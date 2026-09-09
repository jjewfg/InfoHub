// server/sources.js —— 服务端数据源适配层：和前端版本同构，只是运行环境从浏览器换成 Node
import { fetchWithTimeout, formatNum, sleep } from '../src/utils.js';
import { normalizeCard } from '../src/logic.js';
import { MOCK_DATA } from '../src/mock-data.js';

// Node 环境没有 DOM，用纯字符串替换实现实体解码（前端版用了 document，不能用）
function decodeEntities(s){
  return String(s ?? '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export async function searchGitHub(q){
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=8`;
  const res = await fetchWithTimeout(url);
  if(res.status === 403 || res.status === 429) throw new Error('接口限流（403）');
  if(!res.ok) throw new Error('接口返回 ' + res.status);
  const data = await res.json();
  return (data.items || []).map(it => normalizeCard({
    source: 'github',
    id: it.id ?? it.full_name,
    title: it.full_name,
    summary: it.description || '（仓库未填写描述）',
    url: it.html_url,
    time: it.pushed_at,
    tags: [it.language].filter(Boolean),
    metrics: [`${formatNum(it.stargazers_count)} stars`],
  }));
}

export async function searchStackOverflow(q){
  const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(q)}&site=stackoverflow&pagesize=8`;
  const res = await fetchWithTimeout(url);
  if(!res.ok) throw new Error('接口返回 ' + res.status);
  const data = await res.json();
  return (data.items || []).map(it => normalizeCard({
    source: 'stackoverflow',
    id: it.question_id,
    title: decodeEntities(it.title),
    summary: `${it.answer_count || 0} 个回答 · ${it.score || 0} 分 · ${it.is_answered ? '已采纳答案' : '待解决'} · 标签：${(it.tags || []).join('、') || '无'}`,
    url: it.link,
    time: it.creation_date,
    tags: it.tags || [],
    metrics: [`${it.score || 0} 分`, `${it.answer_count || 0} 回答`],
  }));
}

export async function searchWikipedia(q){
  const url = `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=6&format=json`;
  const res = await fetchWithTimeout(url);
  if(!res.ok) throw new Error('接口返回 ' + res.status);
  const data = await res.json();
  return (data?.query?.search || []).map(it => normalizeCard({
    source: 'wikipedia',
    id: it.pageid,
    title: it.title,
    summary: it.snippet,
    url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(it.title)}`,
    time: it.timestamp,
    tags: ['百科'],
    metrics: [],
  }));
}

export async function searchHackerNews(q){
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&hitsPerPage=8`;
  const res = await fetchWithTimeout(url);
  if(!res.ok) throw new Error('接口返回 ' + res.status);
  const data = await res.json();
  return (data.hits || [])
    .filter(h => h.title || h.story_title)
    .map(h => normalizeCard({
      source: 'hackernews',
      id: h.objectID,
      title: h.title || h.story_title,
      summary: h.story_text ? h.story_text : `由 ${h.author || '匿名'} 发布的社区讨论，共 ${h.num_comments || 0} 条评论`,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      time: h.created_at,
      tags: ['社区讨论'],
      metrics: [`${h.points || 0} 赞`, `${h.num_comments || 0} 评论`],
    }));
}

export async function searchMock(q){
  await sleep(350 + Math.random() * 450);
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  return MOCK_DATA
    .filter(item => {
      const hay = (item.title + ' ' + item.summary + ' ' + item.tags.join(' ')).toLowerCase();
      return tokens.some(t => hay.includes(t));
    })
    .slice(0, 8)
    .map(item => normalizeCard({ ...item, source: 'mock' }));
}
// B站视频搜索（游客身份：先领 buvid cookie 过风控握手，再调搜索接口）
const BILI_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
function fmtNum(n){ n = Number(n) || 0; return n >= 1e8 ? (n/1e8).toFixed(1)+'亿' : n >= 1e4 ? (n/1e4).toFixed(1)+'万' : String(n); }

export async function searchBilibili(q){
  const spi = await fetch('https://api.bilibili.com/x/frontend/finger/spi', {
    headers: { 'User-Agent': BILI_UA, 'Referer': 'https://www.bilibili.com/' },
    signal: AbortSignal.timeout(8000),
  }).then(r => r.json());
  const b3 = spi?.data?.b_3 || '';
  const b4 = spi?.data?.b_4 || '';
  if (!b3) throw new Error('B站风控握手失败');

  const url = 'https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=' + encodeURIComponent(q);
  const res = await fetch(url, {
    headers: {
      'User-Agent': BILI_UA,
      'Referer': 'https://www.bilibili.com/',
      'Cookie': `buvid3=${b3}; buvid4=${b4}`,
    },
    signal: AbortSignal.timeout(8000),
  }).then(r => r.json());
  if (res.code !== 0) throw new Error('B站接口返回 ' + res.code);

  const list = res.data?.result || [];
  return list.slice(0, 8).map(v => ({
    id: 'bili-' + v.bvid,
    source: 'bilibili',
    title: String(v.title || '').replace(/<[^>]+>/g, ''),
    summary: fmtNum(v.play) + '播放 · UP主:' + (v.author || '未知'),
    url: 'https://www.bilibili.com/video/' + v.bvid,
    time: v.pubdate ? v.pubdate * 1000 : null,
    tags: ['视频'],
  }));
}
