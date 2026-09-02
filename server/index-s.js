// server/index.js —— Express 聚合代理：对外只暴露一个 /api/search
import express from 'express';
import cors from 'cors';
import { searchGitHub, searchStackOverflow, searchWikipedia, searchHackerNews, searchMock } from './sources.js';
import { readError } from '../src/logic.js';

const app = express();
app.use(cors()); // 生产环境跨域放行（开发环境走 Vite 代理，用不到它）

const REGISTRY = {
  github: searchGitHub,
  stackoverflow: searchStackOverflow,
  wikipedia: searchWikipedia,
  hackernews: searchHackerNews,
  mock: searchMock,
};

// 健康检查：D6 云端部署后用来确认服务活着
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()) });
});

app.get('/api/search', async (req, res) => {
  // 服务端校验：永远不信任客户端传来的输入
  const q = String(req.query.q || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if(!q) return res.status(400).json({ error: '缺少关键词 q' });

  const start = Date.now();
  const keys = Object.keys(REGISTRY);
  const settled = await Promise.allSettled(keys.map(key => REGISTRY[key](q)));

  const sources = {};
  keys.forEach((key, i) => {
    const r = settled[i];
    if(r.status === 'fulfilled'){
      const cards = r.value;
      sources[key] = cards.length
        ? { status: 'ok', count: cards.length, cards }
        : { status: 'empty', cards: [] };
    }else{
      sources[key] = { status: 'error', message: readError(r.reason), cards: [] };
    }
  });

  res.json({ query: q, took_ms: Date.now() - start, sources });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`InfoHub API ready: http://localhost:${PORT}`);
});
