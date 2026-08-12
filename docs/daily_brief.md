# 每日股票简报生成器

脚本：

```powershell
python scripts\generate_daily_brief.py --input data\latest_export.json
```

默认行为：

- 默认 `--mode premarket`
- 默认只把 Markdown 简报打印到 stdout
- 默认不保存文件
- 自动复用现有取价口径：东方财富优先，Yahoo 兜底
- 不输出确定性买卖指令，只输出 `observe / wait / review / add_review / reduce_review / risk_review`

## 盘前简报

```powershell
python scripts\generate_daily_brief.py --input data\latest_export.json --mode premarket
```

盘前模式使用前一交易日收盘价或可获得的最新收盘价，重点回答“今日需要关注什么”。

输出重点：

- 今日优先关注
- 接近计划价
- 仓位偏离
- 待复核事件
- 数据缺失/过期

快捷脚本：

```powershell
run_daily_brief_premarket.bat
```

## 盘中简报

```powershell
python scripts\generate_daily_brief.py --input data\latest_export.json --mode intraday
```

盘中模式使用当日最新行情价格，重点回答“是否已经接近或触发计划”。

输出重点：

- 已触发计划
- 接近触发区
- 盘中风险
- 收盘前复核事项

快捷脚本：

```powershell
run_daily_brief_intraday.bat
```

## 保存文件

默认不保存。需要保存时加 `--save`：

```powershell
python scripts\generate_daily_brief.py --input data\latest_export.json --mode premarket --save
python scripts\generate_daily_brief.py --input data\latest_export.json --mode intraday --save
```

输出位置：

```text
reports/daily/YYYY-MM-DD-premarket.md
reports/daily/YYYY-MM-DD-premarket.json
reports/daily/YYYY-MM-DD-intraday.md
reports/daily/YYYY-MM-DD-intraday.json
```

## OpenAI 摘要

如果配置了 `OPENAI_API_KEY`，脚本会在规则版判断基础上生成“今日摘要”和“优先复核说明”。GPT 只允许整理、归纳、润色已有判断，不允许新增确定性买卖建议。
