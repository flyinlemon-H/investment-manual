# 手机远程触发说明

本功能通过 GitHub 上的 `remote_commands/command.json` 作为指令文件，让手机可以触发本地电脑执行更新任务。

## 手机端指令生成页面

项目提供一个离线 HTML 页面：

```text
docs/remote_control.html
```

使用方式：

1. 把 `docs/remote_control.html` 打开到手机浏览器。
2. 在 `secret` 输入框里填写与电脑 `config/remote_secret.txt` 相同的口令。
3. 点击一个指令按钮：
   - 更新新闻 `update-news`
   - 全量更新 `update-all`
   - 重新生成 HTML `build-html`
   - 更新技术面 `update-technical`（预留命令，当前只写入 report，不抓取真实行情）
4. 页面会生成完整 JSON。
5. 点击“一键复制 JSON”。
6. 到 GitHub 仓库中打开 `remote_commands/command.json`。
7. 点击编辑，粘贴覆盖全部内容，然后提交。
8. 电脑端 watcher 下次 `git pull` 后会读取、校验 secret 并执行。

该页面只负责本地生成 JSON，不连接 GitHub，不上传 secret。

生成的 JSON 会包含 `command_id`，用于避免同一条 GitHub 指令被重复执行。

## 电脑端配置 secret

1. 复制示例文件：

```powershell
copy config\remote_secret.example.txt config\remote_secret.txt
```

2. 打开 `config/remote_secret.txt`，替换为你自己的私人口令，例如：

```text
my-private-trigger-secret
```

`config/remote_secret.txt` 已加入 `.gitignore`，不要提交到 GitHub。

## 电脑端启动 watcher

普通本地监听：

```powershell
python scripts\remote_command_watcher.py
```

GitHub 同步监听：

```powershell
python scripts\remote_command_watcher.py --sync-git
```

也可以双击：

```text
run_remote_watcher_git.bat
```

电脑端必须保持 watcher 运行，手机端提交到 GitHub 后，本机才会自动拉取和执行。

后台静默运行可以双击：

```text
run_remote_watcher_git_silent.vbs
```

开机自启动设置见：

```text
docs/windows_startup.md
```

## 手机端如何触发

推荐用 `docs/remote_control.html` 生成 JSON，然后复制到 GitHub 的 `remote_commands/command.json`。

也可以手动在 GitHub 上编辑 `remote_commands/command.json`，把 `secret` 填成本机 `config/remote_secret.txt` 中的同一串口令。

示例：更新新闻

```json
{
  "command": "update-news",
  "created_at": "2026-06-15T10:00:00",
  "status": "pending",
  "secret": "my-private-trigger-secret",
  "command_id": "cmd-20260615-ab123"
}
```

示例：重新生成 HTML

```json
{
  "command": "build-html",
  "created_at": "2026-06-15T10:05:00",
  "status": "pending",
  "secret": "my-private-trigger-secret",
  "command_id": "cmd-20260615-cd456"
}
```

允许的命令只有：

- `update-news`
- `update-all`
- `build-html`
- `update-technical`（预留，当前提示 not implemented yet）

## 执行完成后

本地 watcher 会把 `remote_commands/command.json` 改回：

```json
{
  "command": "none",
  "created_at": "原始创建时间",
  "status": "success",
  "secret": "",
  "last_command": "build-html",
  "finished_at": "执行完成时间",
  "updated_at": "执行完成时间"
}
```

如果 secret 不匹配，会写入：

```json
{
  "command": "none",
  "created_at": "原始创建时间",
  "status": "rejected",
  "secret": "",
  "last_command": "build-html",
  "updated_at": "拒绝时间"
}
```

详细结果见：

```text
logs/remote_command_report.json
```

长期运行日志见：

```text
logs/watcher_runtime.log
```

每轮会记录：

- 时间
- git pull 是否成功
- 当前 command
- 是否执行
- 执行结果

已执行过的 `command_id` 会记录在：

```text
logs/remote_command_seen_ids.json
```

如果 GitHub 上同一条 command 因同步问题再次出现，watcher 会跳过，不重复执行。

## 本地测试

写入一条测试命令：

```powershell
python scripts\set_remote_command.py build-html
```

只处理一轮：

```powershell
python scripts\remote_command_watcher.py --once
```

测试 rejected：

```powershell
python scripts\set_remote_command.py build-html --secret wrong-secret
python scripts\remote_command_watcher.py --once
```
