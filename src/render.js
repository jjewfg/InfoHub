// render.js —— 渲染层：只负责"画"，不负责"算"和"存"
import { $, escapeHtml, escapeAttr, timeAgo } from './utils.js';
import { store, isFav } from './store.js';
import { SOURCES } from './sources.js';
import { relevanceScore } from './logic.js';

/* ---------- 排序 / 筛选 ---------- */
function sortedFiltered(){
  let list = store.results;
  if(store.activeFilter !== 'all') list = list.filter(c => c.source === store.activeFilter);
  const kw = store.keyword;
  return list
    .map(c => ({ c, s: relevanceScore(c, kw) }))
    .sort((a, b) => {
      if(store.sortMode === 'relevance' && b.s !== a.s) return b.s - a.s;
      return (b.c.time || 0) - (a.c.time || 0);
    })
    .map(x => x.c);
}

/* ---------- 高亮 ---------- */
function highlight(text){
  const safe = escapeHtml(text ?? '');
  const kw = store.keyword;
  if(!kw) return safe;
  const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return safe.replace(re, m => '<mark>' + m + '</mark>');
}

function cardHtml(c){
  const src = SOURCES[c.source] || { name: c.source, dot: '#9ca3af' };
  const fav = isFav(c.id);
  return '<article class="card">' +
    '<div class="card-top">' +
      '<span class="badge"><i style="background:' + src.dot + '"></i>' + escapeHtml(src.name) + '</span>' +
      '<time>' + timeAgo(c.time) + '</time>' +
    '</div>' +
    '<h3 class="card-title"><a href="' + escapeAttr(c.url) + '" target="_blank" rel="noopener noreferrer">' + highlight(c.title) + '</a></h3>' +
    '<p class="card-summary">' + highlight(c.summary || '') + '</p>' +
    (c.tags && c.tags.length
      ? '<div class="card-tags">' + c.tags.slice(0, 4).map(t => '<span class="tag">' + escapeHtml(t) + '</span>').join('') + '</div>'
      : '') +
    '<div class="card-foot">' +
      '<div class="metrics">' + (c.metrics || []).slice(0, 3).map(m => '<span class="metric">' + escapeHtml(m) + '</span>').join('') + '</div>' +
      '<div class="actions">' +
        '<button class="icon-btn fav-btn' + (fav ? ' active' : '') + '" data-id="' + escapeAttr(c.id) + '" title="' + (fav ? '取消收藏' : '收藏') + '">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="' + (fav ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>' +
        '</button>' +
        '<a class="open-link" href="' + escapeAttr(c.url) + '" target="_blank" rel="noopener noreferrer">打开原文' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>' +
        '</a>' +
      '</div>' +
    '</div>' +
  '</article>';
}

export function renderStatusRow(){
  if($('#statusRow').hidden) return;
  $('#statusRow').innerHTML = Object.entries(SOURCES).map(([key, cfg]) => {
    const st = store.statuses[key] || { status: 'idle' };
    let right = '', cls = '';
    if(st.status === 'loading'){ right = '检索中'; cls = 'loading'; }
    else if(st.status === 'ok'){ right = st.count + ' 条'; cls = 'ok'; }
    else if(st.status === 'empty'){ right = '无结果'; cls = 'empty'; }
    else if(st.status === 'error'){ right = st.message; cls = 'error'; }
    else right = '待命';
    return '<span class="src-chip ' + cls + '" title="' + escapeAttr(st.message || cfg.name) + '">' +
      '<i class="dot" style="background:' + cfg.dot + '"></i>' + escapeHtml(cfg.name) +
      ' <b style="font-weight:600">· ' + escapeHtml(right) + '</b></span>';
  }).join('');
}

function renderToolbar(){
  const counts = { all: store.results.length };
  Object.keys(SOURCES).forEach(k => counts[k] = store.results.filter(c => c.source === k).length);
  const chip = (key, label, count) =>
    '<button class="f-chip' + (store.activeFilter === key ? ' active' : '') + '" data-filter="' + key + '"' + (count === 0 ? ' disabled' : '') + '>' +
    escapeHtml(label) + ' ' + count + '</button>';
  $('#filterChips').innerHTML = chip('all', '全部', counts.all) +
    Object.entries(SOURCES).map(([k, c]) => chip(k, c.name, counts[k])).join('');
}

function renderMeta(){
  const avail = Object.values(store.statuses).filter(s => s.status === 'ok').length;
  $('#metaLine').textContent = '关键词「' + store.keyword + '」共 ' + store.results.length +
    ' 条结果 · 跨源去重合并 ' + store.dedupRemoved + ' 条 · ' + avail + '/' + Object.keys(SOURCES).length + ' 个数据源可用';
}

function renderEmpty(){
  const el = $('#emptyState');
  const list = sortedFiltered();
  if(store.searching || list.length){ el.hidden = true; return; }
  el.hidden = false;
  if(!store.hasSearched){
    el.innerHTML = '<svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
      '<h3>开始你的第一次聚合检索</h3><p>输入关键词，InfoHub 将并行请求 5 个数据源，合并去重后统一呈现</p>';
  }else if(store.results.length === 0){
    el.innerHTML = '<svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
      '<h3>没有找到与「' + escapeHtml(store.keyword) + '」相关的结果</h3><p>所有数据源都没有命中，换个更短的关键词试试</p>' +
      '<button class="ghost-btn" id="retryBtn" style="color:var(--accent)">重新搜索</button>';
  }else{
    el.innerHTML = '<h3>当前筛选条件下没有结果</h3><p>该来源未命中关键词，切换回「全部」看看其他来源的结果</p>' +
      '<button class="ghost-btn" id="resetFilterBtn" style="color:var(--accent)">查看全部来源</button>';
  }
}

function renderFav(){
  $('#favGrid').innerHTML = store.favs.map(cardHtml).join('');
  $('#favEmpty').hidden = store.favs.length > 0;
}

function renderHistory(){
  $('#historyList').innerHTML = store.history.map(h =>
    '<li class="history-item" data-q="' + escapeAttr(h.q) + '">' +
      '<span class="q">' + escapeHtml(h.q) + '</span>' +
      '<span style="display:flex;gap:10px;align-items:center">' +
        '<span class="t">' + timeAgo(h.ts) + '</span>' +
        '<button class="del-btn" data-ts="' + h.ts + '" title="删除该条">✕</button>' +
      '</span>' +
    '</li>'
  ).join('');
  $('#historyEmpty').hidden = store.history.length > 0;
}

export function renderAll(){
  $('#favCount').textContent = store.favs.length;
  $('#favView').hidden = store.view !== 'favorites';
  $('#historyView').hidden = store.view !== 'history';
  const inSearch = store.view === 'search';

  $('#statusRow').hidden = !(inSearch && (store.hasSearched || store.searching));
  const showTools = inSearch && store.hasSearched && !store.searching;
  $('#toolbar').hidden = !showTools;
  $('#metaLine').hidden = !showTools;
  $('#skeleton').hidden = !(inSearch && store.searching);
  $('#resultsGrid').hidden = !(inSearch && !store.searching && sortedFiltered().length);

  if(inSearch){
    renderStatusRow();
    if(showTools){ renderToolbar(); renderMeta(); }
    $('#resultsGrid').innerHTML = sortedFiltered().map(cardHtml).join('');
    renderEmpty();
  }else{
    $('#emptyState').hidden = true;
  }
  if(store.view === 'favorites') renderFav();
  if(store.view === 'history') renderHistory();
}
