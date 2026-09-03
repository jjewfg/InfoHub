// main.js —— 入口模块：程序从这里启动，串联各层并绑定事件
import { $, $$, toast } from './utils.js';
import { store, save } from './store.js';
import { SOURCES } from './sources.js';
import { dedup } from './logic.js';
import { renderStatusRow, renderAll } from './render.js';

// API 地址：开发环境走 Vite 代理的相对路径；生产环境用环境变量注入真实后端地址（D6 生效）
const API = import.meta.env.VITE_API_BASE || '/api';

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

/* ---------- 搜索主流程（v1.0：改为调用后端聚合接口） ---------- */
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
  }catch(err){
    // 后端整个不可达：所有源标错，前端兜底
    Object.keys(SOURCES).forEach(key => {
      store.statuses[key] = { status: 'error', message: '后端不可达' };
    });
    toast('聚合服务暂不可用，请确认后端已启动', 'error');
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

/* ---------- 收藏 / 历史 / 视图 ---------- */
function toggleFav(id){
  const idx = store.favs.findIndex(f => f.id === id);
  if(idx > -1){
    store.favs.splice(idx, 1);
    toast('已取消收藏', 'info');
  }else{
    const card = store.results.find(c => c.id === id);
    if(!card) return;
    store.favs.unshift(card);
    toast('已加入收藏夹', 'success');
  }
  save('infohub.favs', store.favs);
  renderAll();
}

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
$$('.example').forEach(b => b.addEventListener('click', () => {
  $('#searchInput').value = b.dataset.q;
  runSearch(b.dataset.q);
}));
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
  if(item){ $('#searchInput').value = item.dataset.q; runSearch(item.dataset.q); }
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
