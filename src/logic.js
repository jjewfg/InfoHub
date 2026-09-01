// logic.js —— 纯业务逻辑：标准化 / 评分 / 去重（明天 D3 单元测试的主战场）
import { clampText, stripTags, toTime } from './utils.js';

// 把 5 种异构响应统一成一张"标准卡片"
export function normalizeCard({ source, id, title, summary, url, time = null, tags = [], metrics = [] }){
  return {
    id: String(id),
    source,
    title: clampText(title, 120) || '（无标题）',
    summary: clampText(stripTags(summary), 180),
    url: String(url),
    time: toTime(time),
    tags,
    metrics,
  };
}

// 相关度评分：标题命中权重最高，其次摘要、标签，近期内容加分
export function relevanceScore(card, keyword){
  const kw = String(keyword || '').toLowerCase();
  if(!kw) return 0;
  const t = card.title.toLowerCase();
  const s = (card.summary || '').toLowerCase();
  let score = 0;
  if(t.includes(kw)) score += 6;
  if(t.startsWith(kw)) score += 2;
  if(s.includes(kw)) score += 2;
  if(card.tags && card.tags.some(tag => String(tag).toLowerCase().includes(kw))) score += 1;
  if(card.time){
    const days = (Date.now() - card.time) / 864e5;
    if(days >= 0 && days < 7) score += 3;
    else if(days < 30) score += 1;
  }
  return score;
}

// 跨源去重：URL 归一化 + 标题归一化
export function dedup(cards){
  const seenUrl = new Set(), seenTitle = new Set(), out = [];
  for(const c of cards){
    let u = '';
    try{
      const p = new URL(c.url);
      u = p.origin + p.pathname.replace(/\/+$/, '');
    }catch{ u = c.url; }
    const t = c.title.toLowerCase().replace(/[\s\p{P}]+/gu, '');
    if(u && seenUrl.has(u)) continue;
    if(t && seenTitle.has(t)) continue;
    seenUrl.add(u); seenTitle.add(t);
    out.push(c);
  }
  return out;
}

// 把各种报错翻译成人话
export function readError(err){
  if(err && err.name === 'AbortError') return '请求超时（8 秒）';
  const msg = err && err.message ? err.message : '';
  if(/failed to fetch|networkerror|load failed/i.test(msg)) return '网络错误/不可达';
  return msg ? (msg.length > 14 ? msg.slice(0, 14) + '…' : msg) : '网络错误';
}
