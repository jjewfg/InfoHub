// utils.js —— 纯工具函数：不依赖项目里其他模块，谁都可以 import
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  ));
}
export const escapeAttr = escapeHtml;

export function stripTags(s){ return String(s ?? '').replace(/<[^>]*>/g, ''); }

export function decodeEntities(s){
  const t = document.createElement('textarea');
  t.innerHTML = String(s ?? '');
  return t.value;
}

export function clampText(s, n = 160){
  s = String(s ?? '').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function toTime(v){
  if(!v) return null;
  const ms = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

export function timeAgo(ms){
  if(!ms) return '时间未知';
  const diff = Date.now() - ms;
  const m = 6e4, h = 36e5, d = 864e5;
  if(diff < 0 || diff < m) return '刚刚';
  if(diff < h) return Math.floor(diff / m) + ' 分钟前';
  if(diff < d) return Math.floor(diff / h) + ' 小时前';
  if(diff < 30 * d) return Math.floor(diff / d) + ' 天前';
  return new Date(ms).toLocaleDateString('zh-CN');
}

export function formatNum(n){
  if(n == null || isNaN(n)) return '0';
  if(n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '万';
  if(n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

export async function fetchWithTimeout(url, timeout = 8000){
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try{
    return await fetch(url, { signal: ctrl.signal });
  }finally{
    clearTimeout(timer);
  }
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function toast(msg, type){
  const el = document.createElement('div');
  el.className = 'toast ' + (type || 'info');
  el.textContent = msg;
  $('#toastBox').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 3600);
}
