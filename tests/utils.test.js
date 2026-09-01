// tests/utils.test.js —— 工具函数测试：纯函数不碰页面，Node 环境直接跑
import { describe, it, expect } from 'vitest';
import { clampText, toTime, stripTags, escapeHtml, formatNum } from '../src/utils.js';

describe('clampText 文本截断', () => {
  it('短文本原样返回', () => {
    expect(clampText('你好', 10)).toBe('你好');
  });

  it('超长文本截断并加省略号', () => {
    expect(clampText('a'.repeat(50), 10)).toBe('aaaaaaaaa…'); // 9 个 a + 省略号
  });

  it('自动去除首尾空格', () => {
    expect(clampText('  hello  ', 10)).toBe('hello');
  });
});

describe('toTime 时间标准化', () => {
  it('秒级时间戳转为毫秒', () => {
    expect(toTime(1700000000)).toBe(1700000000000);
  });

  it('ISO 字符串可解析', () => {
    expect(toTime('2024-01-01T00:00:00Z')).toBe(Date.parse('2024-01-01T00:00:00Z'));
  });

  it('空值返回 null', () => {
    expect(toTime(null)).toBeNull();
    expect(toTime('')).toBeNull();
  });

  it('无法解析的字符串返回 null', () => {
    expect(toTime('不是时间')).toBeNull();
  });
});

describe('stripTags 去除 HTML 标签', () => {
  it('剥掉维基百科摘要里的高亮标签', () => {
    expect(stripTags('<span class="searchmatch">银发</span>经济')).toBe('银发经济');
  });
});

describe('escapeHtml 防注入转义', () => {
  it('尖括号、引号、& 全部转义', () => {
    expect(escapeHtml('<b class="x">&\'')).toBe('&lt;b class=&quot;x&quot;&gt;&amp;&#39;');
  });
});

describe('formatNum 数字缩写', () => {
  it('千位显示 k', () => {
    expect(formatNum(1234)).toBe('1.2k');
  });

  it('万位显示万', () => {
    expect(formatNum(123456)).toBe('12.3万');
  });

  it('小数字原样返回', () => {
    expect(formatNum(42)).toBe('42');
  });
});
