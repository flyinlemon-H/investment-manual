# Codex Context - 投资作战手册

## 日常优先阅读

修改投资手册前，优先查看这些文件：

- `index.html`：页面外壳、版本号、CSS、脚本引用。
- `src/state.js`：数据结构、normalize、评分和决策计算。
- `src/ui-render.js`：页面渲染、详情页模块、Prompt、导入弹窗。
- `src/app.js`：启动、状态加载、基础事件。
- `src/import-export.js`：导入导出、版本号、备份文件名。
- `scripts/mobile_trigger.py`：本地/远程触发的 build-html 入口。
- `run_pipeline.py`：新闻流水线和 dist 同步辅助。

## 通常无需读取

除非任务明确要求，默认不要扫描这些目录：

- `dist/`：发布后的单文件 HTML，历史版本体积大。
- `logs/`：运行日志和触发报告。
- `output/`：采集输出。
- `backups/`、`backup/`、`archive/`：本地备份和历史归档。
- `__pycache__/`：Python 缓存。
- `test_data/`：仅测试数据。

## 构建约定

常用验证：

```powershell
node --check src/state.js
node --check src/ui-render.js
node --check src/app.js
python scripts/mobile_trigger.py build-html
```

`build-html` 应生成：

- 当前版本发布文件，例如 `dist/投资作战手册_V12.1-Codex.html`
- 手机端固定入口：`dist/投资作战手册_latest.html`

## 发布文件策略

GitHub 仓库只需要保留当前发布 HTML 和 latest。历史版本可以留在本地，但不建议继续提交到 Git。

如需本地归档历史 dist 文件，可手动移动到 `archive/` 或 `backups/`；这些目录默认不进入 Git。

示例：

```powershell
New-Item -ItemType Directory -Force archive\dist-history
Move-Item dist\投资作战手册_V11*.html archive\dist-history\
```

不要在未确认前删除用户数据或历史 HTML。
