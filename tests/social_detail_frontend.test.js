const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function loadSocialContext() {
  const code = fs.readFileSync(path.join(root, 'src', 'social.js'), 'utf8');
  const context = {
    console,
    window: {},
    document: { getElementById: () => null },
    fetch: async () => {
      throw new Error('fetch is not used in function tests');
    },
    esc: value => String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char])),
    fmtInt: value => (
      value === null || value === undefined || value === '' || Number.isNaN(Number(value))
        ? '—'
        : Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })
    )
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'src/social.js' });
  const posts = JSON.parse(fs.readFileSync(path.join(root, 'test_data', 'social_detail', 'social_posts.json'), 'utf8'));
  const summary = JSON.parse(fs.readFileSync(path.join(root, 'test_data', 'social_detail', 'social_summary.json'), 'utf8'));
  context.setSocialPosts(posts);
  context.setSocialSummary(summary);
  return context;
}

const context = loadSocialContext();

const xiaomi = { name: '小米集团', code: '1810.HK', id: 'xiaomi', type: 'holding' };
const fii = { name: '工业富联', code: '601138.SS', id: 'fii', type: 'holding' };
const zijin = { name: '紫金矿业', code: '2899.HK', id: 'zijin', type: 'holding' };

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('summary matching uses symbol, company, and aliases', () => {
  const summary = context.socialSummaryForStock(xiaomi);
  assert(summary);
  assert.strictEqual(summary.symbol, '1810.HK');
  assert.strictEqual(summary.company, '小米集团');
  assert(summary.aliases.includes('小米汽车'));
});

test('posts matching supports A-share code and aliases without summary', () => {
  const posts = context.socialPostsForStock(fii);
  assert.strictEqual(posts.length, 2);
  assert(posts.some(post => post.symbol === '601138.SS'));
  assert(posts.some(post => post.symbol === 'FII'));
});

test('empty state renders when no summary or posts exist', () => {
  const html = context.socialDetailPanel(zijin);
  assert(html.includes('social-empty'));
  assert(html.includes('暂无匹配社媒数据'));
});

test('recent posts render at most five and sort newest first', () => {
  const posts = context.socialPostsForStock(xiaomi);
  assert.strictEqual(posts.length, 6);
  const html = context.socialRecentPostsHtml(posts);
  const count = (html.match(/class="social-post"/g) || []).length;
  assert.strictEqual(count, 5);
  assert(html.indexOf('xiaomi-6') < html.indexOf('xiaomi-5'));
  assert(!html.includes('xiaomi-1'));
});

test('sentiment display comes from summary score', () => {
  const metric = context.socialMetricForStock(xiaomi);
  assert.strictEqual(context.socialSentimentLabelFromMetric(metric), '偏利多');
  const html = context.socialDetailPanel(xiaomi);
  assert(html.includes('0.50'));
  assert(html.includes('偏利多'));
});
