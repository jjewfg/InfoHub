// tests/logic.test.js —— 核心业务逻辑测试：标准化 / 评分 / 去重 / 错误翻译
import { describe, it, expect } from 'vitest';
import { normalizeCard, relevanceScore, dedup, readError } from '../src/logic.js';

describe('normalizeCard 标准化', () => {
  it('把异构数据整理成固定字段结构', () => {
    const card = normalizeCard({
      source: 'github', id: 1, title: 't', summary: 's',
      url: 'https://a.com', time: 1700000000, tags: ['x'], metrics: ['1 star'],
    });
    expect(card).toEqual({
      id: '1', source: 'github', title: 't', summary: 's', url: 'https://a.com',
      time: 1700000000000, tags: ['x'], metrics: ['1 star'],
    });
  });

  it('自动剥离摘要中的 HTML 标签', () => {
    const card = normalizeCard({ source: 'wikipedia', id: 2, title: 't', summary: '<span>银发</span>经济', url: 'https://b.com' });
    expect(card.summary).toBe('银发经济');
  });

  it('超长标题截断到 120 字', () => {
    const card = normalizeCard({ source: 'mock', id: 3, title: 'x'.repeat(200), summary: '', url: 'https://c.com' });
    expect(card.title.length).toBe(120);
  });

  it('空标题有兜底文案', () => {
    const card = normalizeCard({ source: 'mock', id: 4, title: '', summary: '', url: 'https://d.com' });
    expect(card.title).toBe('（无标题）');
  });
});

describe('relevanceScore 相关度评分', () => {
  const base = { title: '', summary: '', tags: [], time: null };

  it('标题命中得分高于摘要命中', () => {
    const t = relevanceScore({ ...base, title: '银发经济报告' }, '银发');
    const s = relevanceScore({ ...base, summary: '关于银发的研究' }, '银发');
    expect(t).toBeGreaterThan(s);
  });

  it('标题以关键词开头有额外加分', () => {
    const start = relevanceScore({ ...base, title: '银发经济报告' }, '银发');
    const mid = relevanceScore({ ...base, title: '中国银发经济报告' }, '银发');
    expect(start).toBeGreaterThan(mid);
  });

  it('毫无命中得 0 分', () => {
    expect(relevanceScore({ ...base, title: '房价走势' }, '银发')).toBe(0);
  });
});

describe('dedup 跨源去重', () => {
  it('相同 URL 只保留一条', () => {
    const cards = [
      { title: 'A', url: 'https://x.com/p/1', time: null },
      { title: 'B', url: 'https://x.com/p/1', time: null },
    ];
    expect(dedup(cards)).toHaveLength(1);
  });

  it('尾斜杠视为同一 URL', () => {
    const cards = [
      { title: 'A', url: 'https://x.com/p/1', time: null },
      { title: 'B', url: 'https://x.com/p/1/', time: null },
    ];
    expect(dedup(cards)).toHaveLength(1);
  });

  it('标题相同（忽略大小写与标点）去重', () => {
    const cards = [
      { title: 'AI Agent 指南', url: 'https://a.com/1', time: null },
      { title: 'ai agent指南！', url: 'https://b.com/2', time: null },
    ];
    expect(dedup(cards)).toHaveLength(1);
  });

  it('完全不同的卡片全部保留', () => {
    const cards = [
      { title: 'A', url: 'https://a.com/1', time: null },
      { title: 'B', url: 'https://b.com/2', time: null },
    ];
    expect(dedup(cards)).toHaveLength(2);
  });
});

describe('readError 错误翻译', () => {
  it('超时错误翻译成人话', () => {
    const err = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    expect(readError(err)).toContain('超时');
  });

  it('网络错误被正确识别', () => {
    expect(readError(new Error('Failed to fetch'))).toContain('网络');
  });

  it('普通错误信息原样透传', () => {
    expect(readError(new Error('接口返回 500'))).toBe('接口返回 500');
  });

  it('无信息时兜底', () => {
    expect(readError(new Error())).toBe('网络错误');
  });
});
