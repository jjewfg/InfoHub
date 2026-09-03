// server/index.js —— Express 聚合代理 + 数据库持久化
import express from 'express';
import cors from 'cors';
import { searchGitHub, searchStackOverflow, searchWikipedia, searchHackerNews, searchMock } from './sources.js';
import { readError } from '../src/logic.js';
import { stmts } from './db.js';

const app = express();
app.use(cors());
app.use(express.json()); // 解析 POST 请求的 JSON body——不加它，req.body 永远是 undefined（新手大坑）

const REGISTRY = {
  github: searchGitHub,
  stackoverflow: searchStackOverflow,
  wikipedia: searchWikipedia,
  hackernews: searchHackerNews,
  mock: searchMock,
};

// 把数据库行还原成前端卡片结构
function rowToCard(r){
  let tags = [];
  try{ tags = JSON.parse(r.tags || '[]'); }catch{}
  return { id: r.card_id, source: r.source, title: r.title, summary: r.summary, url: r.url, time: r.time, tags, metrics: [] };
}

// 根路由：服务说明书
app.get('/', (req, res) => {
  res.json({
    service: 'InfoHub API',
    version: '1.1.0',
    endpoints: {
      health: 'GET /api/health',
      search: 'GET /api/search?q=关键词（可选 &source=github,wikipedia）',
      favorites: 'GET /api/favorites?uid=xx | POST /api/favorites | DELETE /api/favorites?uid=xx&cardId=xx',
      hot: 'GET /api/hot',
    },
    sources: Object.keys(REGISTRY),
  });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()) });
});

/* ---------- 收藏三件套 ---------- */
app.get('/api/favorites', (req, res) => {
  const uid = String(req.query.uid || '').trim();
  if(!uid) return res.status(400).json({ error: '缺少 uid' });
  const cards = stmts.favAll.all(uid).map(rowToCard);
  res.json({ uid, count: cards.length, cards });
});

app.post('/api/favorites', (req, res) => {
  const { uid, card } = req.body || {};
  if(!uid || !card || !card.id) return res.status(400).json({ error: '缺少 uid 或 card' });
  const exists = stmts.favFind.get(uid, String(card.id));
  if(exists) return res.json({ ok: true, duplicate: true });
  stmts.favInsert.run(
    uid, String(card.id), String(card.title || '').slice(0, 200), card.source || '',
    String(card.url || ''), String(card.summary || '').slice(0, 500),
    card.time || null, JSON.stringify(card.tags || [])
  );
  res.json({ ok: true });
});

app.delete('/api/favorites', (req, res) => {
  const uid = String(req.query.uid || '').trim();
  const cardId = String(req.query.cardId || '').trim();
  if(!uid || !cardId) return res.status(400).json({ error: '缺少 uid 或 cardId' });
  const info = stmts.favDelete.run(uid, cardId);
  res.json({ ok: true, deleted: info.changes });
});

/* ---------- 热搜榜：全网搜索关键词统计 ---------- */
app.get('/api/hot', (req, res) => {
  res.json({ hot: stmts.hot.all() });
});

/* ---------- 聚合搜索（顺带记录关键词） ---------- */
app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if(!q) return res.status(400).json({ error: '缺少关键词 q' });

  try{ stmts.searchLog.run(q); }catch{ /* 记录失败不影响搜索本身 */ }

  const wanted = String(req.query.source || '')
    .split(',').map(s => s.trim()).filter(Boolean)
    .filter(s => REGISTRY[s]);
  const keys = wanted.length ? wanted : Object.keys(REGISTRY);

  const start = Date.now();
  const settled = await Promise.allSettled(keys.map(key => REGISTRY[key](q)));

  const sources = {};
  keys.forEach((key, i) => {
    const r = settled[i];
    if(r.status === 'fulfilled'){
      const cards = r.value;
      sources[key] = cards.length ? { status: 'ok', count: cards.length, cards } : { status: 'empty', cards: [] };
    }else{
      sources[key] = { status: 'error', message: readError(r.reason), cards: [] };
    }
  });

  res.json({ query: q, took_ms: Date.now() - start, sources });
});

app.use((req, res) => {
  res.status(404).json({ error: '路由不存在', hint: '查看 / 获取可用端点列表' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`InfoHub API ready: http://localhost:${PORT}`);
});
