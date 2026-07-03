# V13 Alpha-2 Closing Report

> Status: Completed
> Scope: Architecture closeout, no business logic change
> Date: 2026-07-03

## Alpha-2 目标

Alpha-2 的目标是在 Alpha-1 的 Core Model、Event Engine、Plan Engine、Risk Engine 基础上，建立只读 Recommendation 派生层，并完成首页复核任务入口与 Decision Review 的最小闭环。

本阶段不生成 Trade，不归档 Plan / Event / Risk，不写回旧业务字段，不改变导入导出结构。

## 已完成模块

1. Recommendation 纯函数层
   - 新增 `src/v13-recommendation-engine.js`
   - 支持从既定计划、风险状态、信息完整度等只读派生 Recommendation
   - Recommendation 包含 `type`、`priority`、`reason`、`reviewGuide`、`source`、`linkedPlanId`
   - Priority 使用 `P4 > P3 > P2 > P1`

2. Recommendation 聚合层
   - 保留完整 `coreModel.recommendations`
   - 派生 `coreModel.primaryRecommendations`
   - 派生 `coreModel.secondaryRecommendations`
   - 每只标的首页只展示一个 primary Recommendation
   - secondary Recommendation 用于 Decision Review 背景参考

3. 首页当前复核任务区
   - 首页优先读取 `coreModel.primaryRecommendations`
   - `P4 / P3` 默认展开
   - `P2 / P1` 默认折叠
   - 无 Recommendation 时 fallback 到旧 Event Engine

4. Decision Review 最小闭环
   - 点击首页复核任务进入只读 Decision Review
   - 显示当前主要复核任务
   - 显示复核依据
   - 显示复核清单
   - 显示同标的相关复核依据
   - 不提供记录操作、生成 Trade、归档或自动执行入口

5. UI 文案清理
   - Decision Review 页面不再直接展示内部对象名、字段名、ID、枚举值
   - Plan ID、Object ID、linkedPlanId、source.objectId 不作为用户可见内容
   - 来源显示为投资语义：既定计划、风险状态、技术事实、信息完整度

## 已确认设计原则

1. Recommendation 是只读派生对象。
2. Recommendation 不写回旧字段，不进入导出结构。
3. Technical Facts 只能作为事实依据，不直接生成操作建议。
4. observe 不默认生成 Recommendation，必须存在明确复核理由。
5. information_update 只能是 P1，且不能淹没更高优先级任务。
6. 首页是复核任务入口，不是完整信息展示中心。
7. 每只标的首页只显示一个最重要复核任务。
8. Decision Review 是用户复核界面，不展示数据库字段或开发者字段。
9. 系统只支持复核流程，不替用户完成最终投资决策。
10. Trade 仍未实现，用户决策后的执行记录留到后续阶段。

## 未包含功能

Alpha-2 不包含以下功能：

1. 不实现 User Decision 状态流转。
2. 不实现 Trade 记录。
3. 不实现 Plan / Event / Risk 归档动作。
4. 不实现 Decision Review Actions。
5. 不生成后续 Plan。
6. 不修改导入导出结构。
7. 不接入自动交易。
8. 不改旧分析模块业务规则。
9. 不实现 DS08 至 DS11 的完整业务模块。
10. 不做新的行情源或新闻源接入。

## Architecture Snapshot

```text
Theory
↓
DB
↓
CASE
↓
Knowledge Base
↓
Technical Facts
↓
Plan Engine
↓
Decision Engine
↓
Recommendation
↓
Decision Review
↓
User Decision（Not Implemented）
↓
Trade（Not Implemented）
```

## Git Summary

### 新增文件

- `src/v13-recommendation-engine.js`
- `docs/release/V13-Alpha2-Closing-Report.md`

### 修改文件

- `index.html`
- `src/state.js`
- `src/ui-render.js`
- `dist/投资作战手册_latest.html`

### 删除文件

以下为历史遗留删除状态，本阶段未处理：

- `dist/投资作战手册_V12.1-Codex.1.html`
- `dist/投资作战手册_V12.2.html`
- `dist/投资作战手册_V12.2.1.html`
- `dist/投资作战手册_V12.2.2.html`
- `dist/投资作战手册_V12.3.html`

## Alpha-3 起点

Alpha-3 建议从 Decision Review Actions 开始。

重点方向：

1. 设计用户可执行动作。
2. 区分继续观察、调整计划、记录操作、归档复核。
3. 建立 User Decision 状态。
4. 明确何时生成 Trade。
5. 明确 Trade 后如何触发 Plan Evolution。
6. 保持 Recommendation 只读派生，不直接执行交易。

Alpha-3 的核心问题：

> 用户完成 Decision Review 后，系统如何记录用户决定，并进入下一轮计划周期。
