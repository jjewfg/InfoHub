// server/index.js —— Express 聚合代理 + 数据库 + 一体化静态服务
import express from 'express';
import cors from 'cors';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchGitHub, searchStackOverflow, searchWikipedia, searchHackerNews, searchMock } from './sources.js';
import { readError } from '../src/logic.js';
import { stmts } from './db.js';

const app = express();
app.use(cors());
app.use(express.json());

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

const REGISTRY = {
  github: searchGitHub,
  stackoverflow: searchStackOverflow,
  wikipedia: searchWikipedia,
  hackernews: searchHackerNews,
  mock: searchMock,
};

function rowToCard(r){
  let tags = [];
  try{ tags = JSON.parse(r.tags || '[]'); }catch{}
  return { id: r.card_id, source: r.source, title: r.title, summary: r.summary, url: r.url, time: r.time, tags, metrics: [] };
}

const docs = {
  service: 'InfoHub API',
  version: '1.2.0',
  endpoints: {
    health: 'GET /api/health',
    search: 'GET /api/search?q=关键词（可选 &source=github,wikipedia）',
    favorites: 'GET /api/favorites?uid=xx | POST /api/favorites | DELETE /api/favorites?uid=xx&cardId=xx',
    hot: 'GET /api/hot',
  },
  sources: Object.keys(REGISTRY),
};

// 静态前端：Docker 一体化模式下 '/' 直接打开应用
// （在 Render 上 dist 目录不存在，这一行自动变成空操作，回退到下面的 JSON 说明——同一份代码，两种形态）
// 注意顺序：Express 按注册顺序匹配，静态服务在前才有资格接住 '/' 
app.use(express.static(distDir));

app.get('/', (req, res) => res.json(docs));
app.get('/api', (req, res) => res.json(docs));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()) });
});

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

app.get('/api/hot', (req, res) => {
  res.json({ hot: stmts.hot.all() });
});

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
  res.status(404).json({ error: '路由不存在', hint: '查看 / 或 /api 获取可用端点列表' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`InfoHub API ready: http://localhost:${PORT}`);
});
