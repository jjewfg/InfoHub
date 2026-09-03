// server/index.js —— Express 聚合代理 + 数据库持久化 + AI 摘要（硅基流动）
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { searchGitHub, searchStackOverflow, searchWikipedia, searchHackerNews, searchMock } from './sources.js';
import { readError } from '../src/logic.js';
import { stmts } from './db.js';

const app = express();
app.use(cors());
app.use(express.json());

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

app.get('/', (req, res) => {
  res.json({
    service: 'InfoHub API',
    version: '1.2.0',
    endpoints: {
      health: 'GET /api/health',
      search: 'GET /api/search?q=关键词',
      summarize: 'POST /api/summarize  {query, results}',
      favorites: 'GET /api/favorites?uid=xx | POST /api/favorites | DELETE /api/favorites?uid=xx&cardId=xx',
      hot: 'GET /api/hot',
    },
    sources: Object.keys(REGISTRY),
  });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()) });
});

/* ---------- 收藏 ---------- */
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

/* ---------- 热搜 ---------- */
app.get('/api/hot', (req, res) => {
  res.json({ hot: stmts.hot.all() });
});

/* ---------- 聚合搜索 ---------- */
app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if(!q) return res.status(400).json({ error: '缺少关键词 q' });
  try{ stmts.searchLog.run(q); }catch{}

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

/* ---------- AI 摘要：SSE 流式输出（硅基流动） ---------- */
app.post('/api/summarize', async (req, res) => {
  const { query, results } = req.body || {};
  if (!query || !Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ error: '缺少查询参数或搜索结果' });
  }

  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'AI 服务未配置' });
  }

  const sources = results.slice(0, 12).map((r, i) =>
    `[${i + 1}] ${r.title}
   来源: ${r.source}
   摘要: ${r.summary || '(无摘要)'}
`
  ).join('
');

  const systemPrompt = '你是一个信息聚合助手。根据用户搜索的关键词和搜索结果，生成一份简洁的摘要报告。'
    + '用中文回答，保持客观，列举主要发现和观点。如果搜索结果不足，如实说明。';

  const userPrompt = `用户搜索关键词: "${query}"

搜索结果如下:
${sources}

请根据以上搜索结果生成摘要报告。`;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  try {
    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'Qwen/Qwen2-7B-Instruct',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: true,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      res.write(`data: ${JSON.stringify({ error: `AI 服务返回 ${response.status}` })}

`);
      res.end();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('
');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6).trim();
        if (payload === '[DONE]') {
          res.write('data: [DONE]

');
          continue;
        }
        try {
          const parsed = JSON.parse(payload);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}

`);
          }
        } catch {}
      }
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: 'AI 服务调用失败' })}

`);
  } finally {
    res.end();
  }
});

/* ---------- 404 兜底 ---------- */
app.use((req, res) => {
  res.status(404).json({ error: '路由不存在', hint: '查看 / 获取可用端点列表' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`InfoHub API ready: http://localhost:${PORT}`);
});
