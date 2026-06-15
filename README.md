# social_collector

`social_collector` 是投资作战手册配套的本地数据整理工具。它把 CSV、公开 RSS/新闻源整理成投资手册可直接读取的两个文件：

- `social_posts.json`：个股详情页展示原帖/原文摘要。
- `social_summary.json`：投资手册快速展示热度、情绪和关键词摘要。

工具只读取公开数据源；不登录、不绕过反爬、不抓微博/雪球/X。

## V6.5.2 数据契约

标准 collector 输出固定使用根对象格式：

```json
{
  "social_posts": []
}
```

```json
{
  "social_summary": []
}
```

投资手册前端会继续兼容历史裸数组格式，但新生成文件和文档示例都推荐根对象格式。

字段约定：

- JSON 层 `sentiment` 固定为 `bullish / bearish / neutral`；前端展示层可以内部转换为 `positive / negative / neutral`。
- summary 热门词固定使用 `hot_keywords`；`hot_topics` 只作为前端读取旧数据的兼容字段，不再作为 collector 输出字段。
- watchlist 标准字段固定为 `aliases`；`alias` 只作为导入兼容字段。
- 去重规则：有 `url` 时按 `platform + symbol + url` 去重；无 `url` 时按 `platform + symbol + post_time + content_hash` 去重。

校验命令：

```powershell
python validate_output.py --mode strict --posts output/social_posts.json --summary output/social_summary.json
python validate_output.py --mode frontend --posts output/social_posts.json --summary output/social_summary.json
```

`strict` 是默认模式，用于验证 collector 标准输出，`likes/comments` 必须是数字类型；`frontend` 用于验证投资手册可读取性，允许数字字符串。

## V6.5.2 最终字段契约

### watchlist.json

标准格式：

```json
{
  "watchlist": [
    {
      "symbol": "1810.HK",
      "company": "小米集团",
      "aliases": ["小米", "小米汽车"],
      "keywords": ["1810", "SU7"]
    }
  ]
}
```

字段说明：

- `symbol`：必填，投资手册兼容代码，例如 `1810.HK`、`601138.SS`。
- `company`：必填，公司名。
- `aliases`：必填数组，标准别名字段。
- `keywords`：必填数组，额外匹配词。
- `alias`：旧字段兼容，仅 collector 导入 watchlist 时读取；不是标准字段，标准文件不要使用。

### social_posts.json

标准格式：

```json
{
  "social_posts": [
    {
      "platform": "news",
      "symbol": "1810.HK",
      "company": "小米集团",
      "post_time": "2026-06-13T09:00:00+08:00",
      "content": "小米集团 1810.HK SU7 交付超预期，市场看多小米汽车。",
      "url": "https://example.test/cn-xiaomi",
      "likes": 30,
      "comments": 4,
      "sentiment": "bullish",
      "matched_keywords": ["1810.HK", "小米集团", "小米", "小米汽车", "SU7"],
      "tags": ["小米", "SU7"],
      "summary": "小米汽车交付超预期",
      "risk_points": [],
      "aliases": ["小米", "小米汽车"]
    }
  ]
}
```

字段说明：

- `sentiment`：标准 JSON 只允许 `bullish / bearish / neutral`。
- `matched_keywords`：必填数组，用于记录命中的股票匹配词。
- `tags`：可选数组，用于展示标签；前端热门词优先使用 `tags`，为空时回退到 `matched_keywords`。
- `aliases`：可选数组，标准字段。
- `alias`：旧兼容字段，不允许出现在标准输出。

### social_summary.json

标准格式：

```json
{
  "social_summary": [
    {
      "symbol": "1810.HK",
      "company": "小米集团",
      "aliases": ["小米", "小米汽车"],
      "today_heat": 38,
      "post_count": 1,
      "bullish_count": 1,
      "bearish_count": 0,
      "neutral_count": 0,
      "sentiment_score": 1.0,
      "hot_keywords": [{"keyword": "小米", "count": 2}],
      "risk_points": [],
      "updated_at": "2026-06-13T00:00:00+00:00"
    }
  ]
}
```

字段说明：

- `hot_keywords`：标准热门词字段。
- `hot_topics`：旧数据兼容字段，仅前端读取旧文件时兼容；collector 不输出。
- `risk_points`：必填数组。
- `aliases`：可选数组；如果存在必须是数组。
- `alias`：旧兼容字段，不允许出现在标准输出。

校验命令：

```powershell
python validate_output.py --posts output/social_posts.json
python validate_output.py --summary output/social_summary.json
python validate_output.py --watchlist watchlist.json
python validate_output.py --posts output/social_posts.json --summary output/social_summary.json --watchlist watchlist.json
```

`frontend` 模式只用于检查投资手册是否能读取旧数据；标准 collector 输出请使用默认 `strict` 模式。

## 输出格式

### social_posts.json

```json
{
  "social_posts": [
    {
      "platform": "rss",
      "symbol": "1810.HK",
      "company": "小米集团",
      "post_time": "2026-06-12T09:10:00+08:00",
      "content": "新闻标题和摘要正文",
      "url": "https://example.com/news/1",
      "likes": 0,
      "comments": 0,
      "sentiment": "bullish",
      "tags": ["小米", "1810.HK"],
      "matched_keywords": ["1810.HK", "小米集团", "小米"],
      "summary": "新闻标题",
      "risk_points": []
    }
  ]
}
```

### social_summary.json

```json
{
  "social_summary": [
    {
      "symbol": "1810.HK",
      "company": "小米集团",
      "aliases": ["小米", "小米汽车"],
      "today_heat": 0,
      "post_count": 1,
      "bullish_count": 1,
      "bearish_count": 0,
      "neutral_count": 0,
      "sentiment_score": 1.0,
      "hot_keywords": [{"keyword": "小米", "count": 1}],
      "risk_points": [],
      "updated_at": "2026-06-12T08:00:00+00:00"
    }
  ]
}
```

`sentiment_score = (bullish_count - bearish_count) / post_count`。

## watchlist.json

`watchlist.json` 用于把新闻/RSS/CSV 内容匹配到投资手册里的标的。`symbol` 建议使用和投资手册一致的代码，例如 `1810.HK`、`601138.SS`。

```json
{
  "watchlist": [
    {
      "symbol": "1810.HK",
      "company": "小米集团",
      "aliases": ["小米", "小米汽车", "Xiaomi"],
      "keywords": ["1810", "SU7", "小米手机"]
    }
  ]
}
```

匹配时会自动兼容：

- 完整股票代码：`1810.HK`
- 去后缀代码：`1810`
- 中文公司名：`小米集团`
- 别名/关键词：`小米`、`小米汽车`

同一条内容如果匹配多个标的，会按标的拆成多条记录。去重规则：有 `url` 时按 `platform + symbol + url`，无 `url` 时按 `platform + symbol + post_time + content_hash`。

## CSV 运行

```powershell
python main.py --input sample_posts.csv --watchlist watchlist.json --output social_posts.json --summary social_summary.json
```

也可以显式指定数据源：

```powershell
python main.py --source csv --input sample_posts.csv --watchlist watchlist.json --output social_posts.json --summary social_summary.json
```

CSV 字段支持常见别名：

| 统一字段 | 可识别字段名 |
| --- | --- |
| `platform` | `platform`, `source_platform`, `network` |
| `author` | `author`, `user`, `username`, `screen_name`, `account` |
| `symbol` | `symbol`, `ticker`, `stock`, `asset` |
| `company` | `company`, `company_name`, `issuer`, `name` |
| `content` | `content`, `text`, `body`, `message`, `post` |
| `url` | `url`, `link`, `permalink` |
| `post_time` | `post_time`, `posted_at`, `created_at`, `published_at`, `timestamp`, `date`, `time` |
| `likes` | `likes`, `like_count`, `favorites`, `favorite_count` |
| `comments` | `comments`, `comment_count`, `replies`, `reply_count` |
| `tags` | `tags`, `tag`, `keywords`, `matched_keywords` |
| `summary` | `summary`, `brief`, `abstract` |
| `risk_points` | `risk_points`, `risks`, `risk` |

## RSS 数据源

RSS 配置文件默认读取：

```text
config/rss_sources.json
```

格式：

```json
[
  {
    "name": "示例财经新闻源",
    "url": "https://example.com/rss",
    "platform": "rss"
  }
]
```

运行：

```powershell
python main.py --source rss --watchlist watchlist.json --output social_posts.json --summary social_summary.json
```

指定其他 RSS 配置：

```powershell
python main.py --source rss --rss-config config/rss_sources.json --watchlist watchlist.json --output social_posts.json --summary social_summary.json
```

RSS/Atom 字段会映射为统一字段：

- `platform`：来自 RSS 配置里的 `platform`
- `post_time`：RSS `pubDate` 或 Atom `published/updated`
- `content`：标题 + 摘要/正文
- `url`：RSS `link/guid` 或 Atom `link/id`
- `likes/comments`：公开 RSS 无互动数据，固定为 `0`
- `symbol/company/matched_keywords`：仍由 `watchlist.json` 匹配生成
- `sentiment`：仍用关键词规则判断 `bullish / bearish / neutral`

## V6.4 网页 URL 抓取

网页抓取读取 `urls.txt`，每行一个公开网页 URL：

```text
https://example.com/news/xiaomi-su7
https://example.com/news/zijin-mining
```

运行：

```powershell
python main.py --source webpage --urls urls.txt --watchlist watchlist.json --output social_posts.json --summary social_summary.json
```

网页源规则：

- 只请求用户提供的公开 URL。
- 不登录、不绕过反爬、不抓微博/雪球/X。
- `platform` 固定为 `"webpage"`。
- 自动解析 `<title>` 作为 `summary`。
- 自动提取正文文本，并跳过 `script/style/nav/footer/header/aside` 等无效区域。
- `likes/comments` 固定为 `0`。
- 如果识别不到发布时间，`post_time` 使用抓取时间。
- `symbol/company/matched_keywords` 仍由 `watchlist.json` 匹配生成。
- `sentiment` 仍使用关键词规则输出 `bullish / bearish / neutral`。
- 去重规则：有 `url` 时按 `platform + symbol + url`，无 `url` 时按 `platform + symbol + post_time + content_hash`。
- 抓取失败的 URL 会跳过，并写入 `logs/collector.log`。

## 日志

每次运行会追加写入：

```text
logs/collector.log
```

日志包含：

- 抓取源
- 抓取数量
- 匹配数量
- 错误信息

示例：

```text
[2026-06-12T08:00:00+00:00] collector run
source=rss:示例财经新闻源 fetched=20 matched=3
error=rss:某源 https://example.com/rss: Fetch failed: ...
```

## 放到投资手册旁边

生成后，把这两个文件放在投资手册 HTML 同目录：

```text
social_posts.json
social_summary.json
```

V6.5.2 HTML 会优先读取 `social_summary.json` 做快速展示，并读取 `social_posts.json` 展示个股详情原文。

## 社媒舆情前端验收

静态验收页：

```text
test_social_detail.html
```

验收页只加载 `src/social.js` 和前端 mock fixture：

```text
test_data/social_detail/social_summary.json
test_data/social_detail/social_posts.json
```

覆盖三种状态：

- 小米集团 `1810.HK`：有 `summary + posts`
- 工业富联 `601138.SS`：只有 `posts`
- 紫金矿业 `2899.HK`：无数据

函数级测试：

```powershell
node tests/social_detail_frontend.test.js
```

检查项包括：

- summary 匹配
- posts 匹配
- 空状态
- 最近 5 条帖子排序
- sentiment 展示

轻量人工验收 checklist：

- 桌面端打开 `test_social_detail.html` 后，“社媒舆情”是否默认折叠。
- 展开后是否完整显示帖子数量、舆情倾向、情绪分数、热门关键词、更新时间。
- 最近帖子是否最多显示 5 条，并且较新的帖子在前。
- 手机宽度下模块是否纵向排列、不挤压首屏。
- 无数据股票是否显示“暂无社媒数据”或“暂无匹配社媒数据”。

如果当前环境没有 Playwright，不强制真实截图；以 `node --check`、函数级测试和人工 checklist 作为轻量截图替代验收。

## V6.5 从采集到投资手册展示

推荐先用 `test_data/` 跑完整链路，确认采集器、匹配器、摘要和输出校验都正常：

```powershell
python main.py --source csv --input test_data/sample_posts.csv --watchlist test_data/watchlist.json --output output/social_posts.json --summary output/social_summary.json
```

校验输出是否符合投资手册读取要求：

```powershell
python validate_output.py --posts output/social_posts.json --summary output/social_summary.json
```

运行基础测试：

```powershell
python -m unittest discover -s tests
```

完整流程：

1. 准备 `watchlist.json`：确保 `symbol/company/aliases/keywords` 与投资手册里的股票代码和名称一致。
2. 选择采集源：
   - CSV：`python main.py --source csv --input test_data/sample_posts.csv --watchlist test_data/watchlist.json --output output/social_posts.json --summary output/social_summary.json`
   - RSS：`python main.py --source rss --rss-config config/rss_sources.json --watchlist watchlist.json --output output/social_posts.json --summary output/social_summary.json`
   - 网页 URL：`python main.py --source webpage --urls urls.txt --watchlist watchlist.json --output output/social_posts.json --summary output/social_summary.json`
3. 执行 `validate_output.py`，确认 `social_posts.json` 和 `social_summary.json` 的字段、类型、情绪值、去重结果都可被投资手册读取。
4. 把通过校验的 `social_posts.json` 和 `social_summary.json` 放到投资手册 HTML 同目录。
5. 打开投资手册 HTML，个股详情页读取 `social_posts.json` 展示原文，列表和详情里的社媒摘要优先读取 `social_summary.json`。

`test_data/` 内容：

- `sample_posts.csv`：CSV 输入样例，包含重复 URL 用于验证去重。
- `urls.txt`：网页 URL 输入样例。
- `watchlist.json`：测试用标的、公司名、别名和关键词。
- `expected_social_posts.json`：CSV 样例期望输出。
- `expected_social_summary.json`：聚合摘要期望输出。
- `sample_feed.xml`：本地 RSS 测试夹具。
- `sample_page.html`：本地网页抓取测试夹具。
## V7.1.2 新闻降噪配置

V7.1.2 在 `run_pipeline.py --source news` 的流水线阶段增加新闻降噪，不改变 `social_posts.json`、`social_summary.json`、`watchlist.json` 字段契约。

配置文件：

```text
config/app_config.json
```

可配置项：

```json
{
  "max_posts_per_symbol": 30,
  "news_days_limit": 14,
  "disabled_news_sources": [],
  "preferred_news_sources": []
}
```

说明：
- `max_posts_per_symbol`：每个 symbol 最多保留多少条新闻，默认 `30`。
- `news_days_limit`：只保留最近多少天新闻，默认 `14`；无法解析 `post_time` 的新闻会保留并写入 warning。
- `disabled_news_sources`：禁用的新闻源名称，按 `config/news_sources.json` 里的 `name` 精确匹配，禁用后不抓取。
- `preferred_news_sources`：优先新闻源或标题/URL 关键词；排序时优先，再按时间新旧、匹配关键词数量排序。

降噪规则：
- 同一 symbol 下 URL 相同只保留一条。
- 标题完全相同只保留一条。
- 去掉标题末尾来源后相同只保留一条。
- 不做复杂 NLP，不自动生成买卖建议。

运行报告会增加：
- `raw_count`
- `matched_count`
- `after_date_filter_count`
- `after_dedup_count`
- `final_count`
- `removed_by_symbol_limit`
- `removed_duplicates`

## V7.1 新闻情报接入版

V7.1 新增 `news` 数据源，用于接入公开 RSS/Atom 新闻源。它复用现有字段契约，命中 `watchlist.json` 后仍输出标准 `social_posts.json` 和 `social_summary.json`。

配置文件：

```text
config/news_sources.json
```

格式：

```json
[
  {
    "name": "示例新闻源",
    "url": "https://example.com/news/rss",
    "platform": "news"
  }
]
```

运行：

```powershell
python run_pipeline.py --source news
```

也可以双击：

```text
run_news.bat
```

指定配置文件：

```powershell
python run_pipeline.py --source news --news-config config/news_sources.json
```

新闻源规则：
- 支持 RSS 和 Atom。
- 输出帖子 `platform` 固定为 `news`。
- `symbol/company/tags/matched_keywords` 由 `watchlist.json` 命中生成。
- `sentiment` 继续使用本地关键词规则，输出 `bullish / bearish / neutral`。
- `social_summary.json` 继续兼容 V7.0 的 `ai_brief`、`bullish_points`、`bearish_points`、`review_flags`。
- 不接微博、不接雪球、不接 X。
- 不改变 `social_posts.json`、`social_summary.json`、`watchlist.json` 字段契约。

## V7.0 AI 总结与投资决策辅助准备版

V7.0 在 `social_summary.json` 上增加可选的投资复核字段，不改变 V6.5.2 标准必填字段，也不改变 `social_posts.json` 和 `watchlist.json` 契约。

新增可选字段：

```json
{
  "ai_brief": "一句话舆情总结",
  "bullish_points": ["利多观点"],
  "bearish_points": ["利空观点"],
  "risk_points": ["风险点"],
  "review_flags": ["price_action_check", "position_size_check"]
}
```

`review_flags` 可取值：
- `high_heat`：热度明显升高
- `sentiment_divergence`：多空分歧
- `negative_risk`：负面风险集中
- `price_action_check`：需要结合价格走势复核
- `position_size_check`：需要结合仓位复核

当前是规则版 AI 辅助准备层：
- 不连接真实 AI API。
- 不接入 OpenAI API。
- 不新增雪球、微博、X 抓取。
- 不自动生成“买入/卖出”结论。
- 只帮助复核价格触发、仓位和舆情之间是否矛盾。

前端社媒模块会展示“投资复核提示”，并明确标注：`仅作信息复核，不构成买卖指令`。

## V6.7 安全运行模式

V6.7 在 V6.6 流水线外层增加防误操作和可观察性能力，不改变 `social_posts.json`、`social_summary.json`、`watchlist.json` 字段契约。

dry-run 只采集、生成、校验和输出摘要，不复制到投资手册目录：

```powershell
python run_pipeline.py --source csv --input test_data/sample_posts.csv --dry-run
```

默认失败保护：如果本次生成 `posts_count = 0`，即使校验通过也不会覆盖 `dist/social_posts.json` 和 `dist/social_summary.json`。确实需要发布空数据时，显式增加：

```powershell
python run_pipeline.py --source csv --input test_data/sample_posts.csv --allow-empty
```

校验并复制成功后自动打开手册：

```powershell
python run_pipeline.py --source csv --input test_data/sample_posts.csv --open-manual
```

Windows 脚本默认不自动打开手册；需要打开时可这样运行：

```powershell
run_csv.bat --open-manual
run_webpage.bat --open-manual
run_rss.bat --open-manual
```

每次运行都会生成报告：

```text
logs/pipeline_report_YYYYMMDD-HHMMSS.json
```

报告包含 `source`、`input`、`watchlist`、`output`、`summary`、`posts_count`、`symbols_count`、`validation_status`、`copied`、`errors`、`warnings`，以及未匹配到帖子的 watchlist 标的和未匹配任何股票的帖子摘要。

## V6.6 日常使用流程

V6.6 新增 `run_pipeline.py`，用于把采集、生成、校验、备份和交付串成一次命令。它不改变 V6.5.2 字段契约，也不新增真实平台抓取。

配置文件：

```text
config/app_config.json
```

默认配置项：
- `watchlist_path`：标的匹配文件，默认 `watchlist.json`
- `output_dir`：collector 输出目录，默认 `output`
- `manual_dist_dir`：投资手册 HTML 同目录，默认 `dist`
- `posts_filename`：默认 `social_posts.json`
- `summary_filename`：默认 `social_summary.json`
- `log_dir`：默认 `logs`

常用命令：

```powershell
python run_pipeline.py --source csv --input test_data/sample_posts.csv
python run_pipeline.py --source webpage --urls urls.txt
python run_pipeline.py --source rss
```

也可以双击 Windows 脚本：

```text
run_csv.bat
run_webpage.bat
run_rss.bat
```

每次运行会先备份旧文件到：

```text
backups/social/YYYYMMDD-HHMMSS/
```

流水线步骤：
1. 更新 `urls.txt`、CSV 文件或 `config/rss_sources.json`。
2. 确认 `watchlist.json` 使用标准字段 `symbol/company/aliases/keywords`。
3. 双击对应 `.bat`，或运行 `python run_pipeline.py ...`。
4. 程序生成 `output/social_posts.json` 和 `output/social_summary.json`。
5. 自动执行 `validate_output.py`，校验通过后复制到投资手册 HTML 同目录。
6. 打开 `dist/投资作战手册_V8.6.html` 查看社媒舆情展示。

运行结束会输出摘要：
- 采集源
- 原始记录数
- 匹配帖子数
- 覆盖股票数
- 校验是否通过
- 是否已复制到投资手册目录

`frontend` 校验模式仍只用于确认旧数据是否能被投资手册读取；标准输出请继续使用默认 `strict` 契约。
