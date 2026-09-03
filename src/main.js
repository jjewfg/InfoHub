// main.js —— 入口模块：启动、事件绑定、云同步（乐观更新 + 失败回滚）
import { $, $$, toast } from './utils.js';
import { store, save, getUid } from './store.js';
import { SOURCES } from './sources.js';
import { dedup } from './logic.js';
import { renderStatusRow, renderAll } from './render.js';

const API = '/api';
const uid = getUid();

/* ---------- 骨架屏 ---------- */
function showSkeleton(){
  $('#skeleton').innerHTML = Array.from({ length: 8 }, () =>
    '<div class="skel">' +
      '<div class="ln" style="width:42%"></div><div class="ln" style="width:92%"></div>' +
      '<div class="ln" style="width:100%"></div><div class="ln" style="width:76%"></div>' +
      '<div class="ln" style="width:30%"></div>' +
    '</div>'
  ).join('');
}

/* ---------- 云同步：启动时拉取收藏 ---------- */
async function initFavs(){
  try{
    const res = await fetch(`${API}/favorites?uid=${encodeURIComponent(uid)}`);
    if(!res.ok) throw new Error();
    const data = await res.json();
    // 云端是唯一真相源：只要响应成功，无论空与否都覆盖本地
    // （空列表同样覆盖——否则云端数据蒸发后，本地缓存会"诈尸"）
    if(Array.isArray(data.cards)){
      store.favs = data.cards;
      save('infohub.favs', store.favs);
      renderAll();
    }
  }catch{ /* 静默降级：后端不可达时才用 localStorage 兜底 */ }
}

/* ---------- 云同步：热搜榜 ---------- */
async function loadHot(){
  try{
    const res = await fetch(`${API}/hot`);
    if(!res.ok) throw new Error();
    const data = await res.json();
    const row = $('#hotRow');
    if(!data.hot || !data.hot.length){ row.hidden = true; return; }
    row.innerHTML = '<span>全网热搜：</span>' +
      data.hot.slice(0, 8).map(h =>
        `<button type="button" class="example" data-q="${h.q}">${h.q} <small style="color:#9ca3af">${h.cnt}次</small></button>`
      ).join('');
    row.hidden = false;
  }catch{ /* 热榜是增强功能，失败完全静默 */ }
}

/* ---------- 搜索主流程 ---------- */
async function runSearch(raw){
  const kw = String(raw || '').trim().replace(/\s+/g, ' ');
  if(!kw){ toast('请输入搜索关键词', 'error'); $('#searchInput').focus(); return; }
  if(kw.length > 60){ toast('关键词不能超过 60 个字符', 'error'); return; }

  store.keyword = kw;
  store.searching = true;
  store.hasSearched = true;
  store.results = [];
  store.dedupRemoved = 0;
  store.activeFilter = 'all';
  store.statuses = Object.fromEntries(Object.keys(SOURCES).map(k => [k, { status: 'loading' }]));
  $('#searchInput').value = kw;
  $('#searchBtn').disabled = true;

  showView('search');
  showSkeleton();
  addHistory(kw);

  try{
    const res = await fetch(`${API}/search?q=` + encodeURIComponent(kw));
    if(!res.ok) throw new Error('后端返回 ' + res.status);
    const data = await res.json();

    const merged = [];
    Object.keys(SOURCES).forEach(key => {
      const s = data.sources?.[key];
      if(!s){ store.statuses[key] = { status: 'error', message: '无数据' }; return; }
      if(s.status === 'ok') store.statuses[key] = { status: 'ok', count: s.count };
      else if(s.status === 'empty') store.statuses[key] = { status: 'empty' };
      else store.statuses[key] = { status: 'error', message: s.message || '未知错误' };
      merged.push(...(s.cards || []));
    });

    store.results = dedup(merged);
    store.dedupRemoved = merged.length - store.results.length;
    loadHot(); // 搜索后热榜可能变化，顺手刷新
  }catch(err){
    Object.keys(SOURCES).forEach(key => {
      store.statuses[key] = { status: 'error', message: '后端不可达' };
    });
    toast('聚合服务暂不可用，请稍后再试', 'error');
  }finally{
    store.searching = false;
    $('#searchBtn').disabled = false;
    renderAll();
  }

  const errs = Object.values(store.statuses).filter(s => s.status === 'error').length;
  if(errs > 0 && errs < Object.keys(SOURCES).length){
    toast(errs + ' 个数据源暂时不可用，其余来源已正常返回', 'info');
  }
}

/* ---------- 收藏：乐观更新 + 失败回滚 ---------- */
async function toggleFav(id){
  const idx = store.favs.findIndex(f => f.id === id);
  const wasFav = idx > -1;
  const card = wasFav ? store.favs[idx] : store.results.find(c => c.id === id);
  if(!card) return;

  // 第一步：乐观更新——先改本地状态和界面，不等网络
  if(wasFav) store.favs.splice(idx, 1);
  else store.favs.unshift(card);
  renderAll();

  // 第二步：后台同步云端
  try{
    const res = wasFav
      ? await fetch(`${API}/favorites?uid=${encodeURIComponent(uid)}&cardId=${encodeURIComponent(id)}`, { method: 'DELETE' })
      : await fetch(`${API}/favorites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid, card }),
        });
    if(!res.ok) throw new Error();
    save('infohub.favs', store.favs);
    toast(wasFav ? '已取消收藏（已同步云端）' : '已加入收藏夹（已同步云端）', 'success');
  }catch{
    // 第三步：同步失败——回滚到操作前状态，界面绝不撒谎
    if(wasFav) store.favs.unshift(card);
    else store.favs.shift();
    save('infohub.favs', store.favs);
    renderAll();
    toast('云端同步失败，已回滚本地操作', 'error');
  }
}

/* ---------- 本地历史（与云端热搜双轨并存） ---------- */
function addHistory(q){
  store.history = store.history.filter(h => h.q.toLowerCase() !== q.toLowerCase());
  store.history.unshift({ q, ts: Date.now() });
  store.history = store.history.slice(0, 20);
  save('infohub.history', store.history);
}

function showView(v){
  store.view = v;
  $$('.views button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  renderAll();
}

/* ---------- 事件绑定 ---------- */
$('#searchForm').addEventListener('submit', e => {
  e.preventDefault();
  runSearch($('#searchInput').value);
});
$('#searchInput').addEventListener('input', e => {
  const len = e.target.value.length;
  $('#charCount').textContent = len + '/60';
  $('#charCount').style.color = len > 50 ? 'var(--danger)' : '';
});
// 示例词与热搜词统一委托：点谁搜谁
document.querySelector('.search-card').addEventListener('click', e => {
  const btn = e.target.closest('[data-q]');
  if(btn && (btn.classList.contains('example') || btn.closest('#hotRow'))){
    runSearch(btn.dataset.q);
  }
});
$('#sortSelect').addEventListener('change', e => { store.sortMode = e.target.value; renderAll(); });
$('#filterChips').addEventListener('click', e => {
  const chip = e.target.closest('.f-chip');
  if(!chip || chip.disabled) return;
  store.activeFilter = chip.dataset.filter;
  renderAll();
});
['resultsGrid', 'favGrid'].forEach(id => {
  $('#' + id).addEventListener('click', e => {
    const btn = e.target.closest('.fav-btn');
    if(btn) toggleFav(btn.dataset.id);
  });
});
$('#emptyState').addEventListener('click', e => {
  if(e.target.closest('#retryBtn')) runSearch(store.keyword);
  if(e.target.closest('#resetFilterBtn')){ store.activeFilter = 'all'; renderAll(); }
});
$('#historyList').addEventListener('click', e => {
  const del = e.target.closest('.del-btn');
  if(del){
    const ts = Number(del.dataset.ts);
    store.history = store.history.filter(h => h.ts !== ts);
    save('infohub.history', store.history);
    renderAll();
    return;
  }
  const item = e.target.closest('.history-item');
  if(item) runSearch(item.dataset.q);
});
$('#clearHistory').addEventListener('click', () => {
  store.history = [];
  save('infohub.history', store.history);
  renderAll();
  toast('已清空搜索历史', 'info');
});
$$('.views button').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));

/* ---------- 启动 ---------- */
renderAll();
initFavs();
loadHot();
