// sources.js —— 数据源适配层：每个源一个函数，统一返回标准卡片
import { fetchWithTimeout, formatNum, decodeEntities, sleep } from './utils.js';
import { normalizeCard } from './logic.js';
import { MOCK_DATA } from './mock-data.js';


async function searchGitHub(q){
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

async function searchStackOverflow(q){
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

async function searchWikipedia(q){
  // origin=* 是 MediaWiki 官方的跨域放行参数，否则浏览器会拦截响应
  const url = `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=6&format=json&origin=*`;
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

async function searchHackerNews(q){
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

// 本地模拟数据源：网络全挂/接口限流时保底，保证演示永远有内容
const MOCK_DATA = [
  {title:'银发经济观察：2026 年我国养老产业规模预计突破 12 万亿元',summary:'从适老化改造、社区照护到智慧养老设备，政策与消费双轮驱动下，养老产业链上下游迎来加速期，康复辅具与居家监测成为增速最快的细分赛道。',url:'https://example.com/mock/silver-economy-2026',time:'2026-08-28T09:30:00+08:00',tags:['银发经济','养老产业']},
  {title:'适老化改造落地指南：从一块防滑扶手到全屋智能监测',summary:'梳理老旧小区与居家环境改造的清单、补贴政策与常见坑点，并附智慧传感设备选型建议，帮助家庭以合理预算完成渐进式改造。',url:'https://example.com/mock/home-retrofit-guide',time:'2026-08-21T14:00:00+08:00',tags:['适老化改造','养老']},
  {title:'老年消费新趋势：银发族线上消费同比增长 35%',summary:'电商平台数据显示，老年群体在健康服务、旅游出行与智能家居上的支出快速上升，银发内容创作者与适老化界面改版成为平台新竞争点。',url:'https://example.com/mock/silver-consumption',time:'2026-08-15T10:00:00+08:00',tags:['银发经济','消费']},
  {title:'北京房价走势：三季度二手房成交量环比回升 12%',summary:'挂牌量维持高位、议价空间扩大，改善型需求入场带动核心区成交量回升，但整体价格仍呈温和下行态势，市场分化明显。',url:'https://example.com/mock/beijing-housing-q3',time:'2026-08-26T08:00:00+08:00',tags:['房价','北京']},
  {title:'房贷利率再下调，对一线城市房价意味着什么？',summary:'本轮 LPR 调整后首套房利率进入历史低位区间，分析师认为对购房成本的边际改善有限，真正决定走势的仍是收入预期与库存去化速度。',url:'https://example.com/mock/mortgage-rate-cut',time:'2026-08-10T16:30:00+08:00',tags:['房价','房贷利率']},
  {title:'全国 70 城房价指数解读：哪些城市率先企稳？',summary:'一线韧性最强，部分强二线环比转正；三四线仍在以价换量。报告给出库存去化周期、租金回报率等先行指标的城市排行。',url:'https://example.com/mock/70-city-index',time:'2026-07-30T09:00:00+08:00',tags:['房价','数据解读']},
  {title:'日本旅游攻略：红叶季 10 天行程规划（含交通与预算）',summary:'覆盖东京—京都—大阪经典线路的交通票券取舍、酒店预订时间窗与人均 1.2 万元的预算拆解，并给出避开人流的错峰建议。',url:'https://example.com/mock/japan-autumn-plan',time:'2026-08-24T12:00:00+08:00',tags:['旅游','攻略']},
  {title:'县域旅游崛起：小城搜索量同比翻倍，性价比成关键词',summary:'高铁通达与社交种草共同推高反向旅游，民宿供给与接待能力成为小城接住流量的关键变量。',url:'https://example.com/mock/county-tourism',time:'2026-08-18T11:00:00+08:00',tags:['旅游','趋势']},
  {title:'暑期旅游盘点：亲子游与银发旅游成为两大主力客群',summary:'错峰出行、长住慢游的银发旅游产品供给不足，倒逼旅行社与平台开发节奏更慢、医疗保障更全的定制线路。',url:'https://example.com/mock/summer-travel-review',time:'2026-08-05T09:00:00+08:00',tags:['旅游','银发经济']},
  {title:'AI Agent 落地实录：从聊天机器人到企业自动化工作流',summary:'以客服与研发效能两个场景为例，拆解 Agent 的规划、工具调用与记忆机制，并讨论幻觉控制与人机协同边界的工程实践。',url:'https://example.com/mock/ai-agent-practice',time:'2026-08-29T20:00:00+08:00',tags:['AI','Agent']},
  {title:'大模型 2026 年中盘点：多模态与端侧部署加速',summary:'参数效率与推理成本持续下探，端侧小模型在手机与汽车座舱规模化落地，云端超大模型则向长上下文与工具使用深耕。',url:'https://example.com/mock/llm-midyear',time:'2026-08-12T13:00:00+08:00',tags:['AI','大模型']},
  {title:'RAG 检索增强生成入门：让回答有据可查',summary:'介绍向量库选型、切分策略与重排序的基本组合，并给出一个可直接运行的最小可行示例与常见失败模式清单。',url:'https://example.com/mock/rag-intro',time:'2026-07-22T15:00:00+08:00',tags:['AI','RAG']},
  {title:'养老护理人才缺口超 500 万：谁来照护我们的父母？',summary:'薪酬、职业通道与社会认同三重瓶颈下，各地探索订单班与积分激励的组合政策，标准化培训体系与持证上岗机制仍待完善。',url:'https://example.com/mock/caregiver-gap',time:'2026-08-08T10:30:00+08:00',tags:['养老','银发经济']},
  {title:'长三角养老社区实地测评：医养结合到底做到了几分？',summary:'走访 6 家 CCRC 社区，从医疗配套、护理比、价格透明度三个维度打分，并整理入住合同中最容易被忽略的 5 个条款。',url:'https://example.com/mock/ccrc-review',time:'2026-08-02T14:00:00+08:00',tags:['养老','测评']},
  {title:'反向旅游兴起：躺平式度假为何让年轻人上头？',summary:'不赶行程、不打卡的慢旅行成为新选择，平台数据显示酒店即目的地订单占比创新高，催生度假酒店内容化运营新打法。',url:'https://example.com/mock/slow-travel',time:'2026-07-28T09:30:00+08:00',tags:['旅游','趋势']},
  {title:'二手房挂牌量高企，买房人的议价空间有多大？',summary:'基于重点城市成交样本测算：挂牌周期超过 90 天的房源平均议价空间达 8%，掌握房东出售动机是谈判的关键筹码。',url:'https://example.com/mock/bargain-analysis',time:'2026-08-20T18:00:00+08:00',tags:['房价','二手房']},
];

async function searchMock(q){
  await sleep(350 + Math.random() * 450); // 模拟网络延迟，方便观察骨架屏
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  return MOCK_DATA
    .filter(item => {
      const hay = (item.title + ' ' + item.summary + ' ' + item.tags.join(' ')).toLowerCase();
      return tokens.some(t => hay.includes(t));
    })
    .slice(0, 8)
    .map(item => normalizeCard({ ...item, source: 'mock' }));
}

export const SOURCES = {
  github:        { name: 'GitHub',          dot: '#24292f', search: searchGitHub },
  stackoverflow: { name: 'Stack Overflow',  dot: '#f48024', search: searchStackOverflow },
  wikipedia:     { name: '维基百科（中文）', dot: '#3366cc', search: searchWikipedia },
  hackernews:    { name: 'Hacker News',     dot: '#ff6600', search: searchHackerNews },
  mock:          { name: '本地模拟库',       dot: '#10b981', search: searchMock },
};