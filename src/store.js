// store.js —— 应用状态的唯一来源 + localStorage 持久化
export function load(key, fallback){
  try{ const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v : fallback; }
  catch{ return fallback; }
}

export function save(key, val){
  try{ localStorage.setItem(key, JSON.stringify(val)); }catch{ /* 隐身模式等场景下静默降级 */ }
}

export const store = {
  view: 'search',
  keyword: '',
  hasSearched: false,
  searching: false,
  results: [],
  dedupRemoved: 0,
  statuses: {},
  activeFilter: 'all',
  sortMode: 'relevance',
  favs: load('infohub.favs', []),
  history: load('infohub.history', []),
};

export const isFav = id => store.favs.some(f => f.id === id);
