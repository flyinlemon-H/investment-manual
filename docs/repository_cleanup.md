# V10.0 仓库瘦身说明

## 不再进入 Git 的目录和文件

以下内容属于本地运行产物、临时输出或私密配置，不再提交到 Git：

- `logs/`
- `output/`
- `backups/`
- `__pycache__/`
- `*.pyc`
- `config/remote_secret.txt`

`config/remote_secret.example.txt` 继续保留在 Git，用于说明本地 secret 文件格式。

## 为什么不提交 logs / output / backups

- `logs/`：watcher、pipeline、collector 的运行日志会频繁变化，提交后会造成大量无意义 diff，也会拖慢 `git pull` / `git push`。
- `output/`：采集流水线生成的中间数据可以随时重新生成，不适合作为仓库核心文件长期追踪。
- `backups/`：本地备份和历史 HTML 体积较大，只用于本机回退，不应进入 GitHub 仓库。

这样做可以减少仓库体积，让手机远程触发后的 watcher 同步更轻、更快。

## 如何本地保留历史版本

V10.0 清理时，`dist/` 下旧版本 HTML 已迁移到：

```text
backups/dist_history_V10_cleanup/
```

如果以后还想保留某个历史发布包，可以放入 `backups/` 下任意子目录。该目录不会进入 Git，但会保留在本机。

## dist 保留策略

`dist/` 只保留日常运行和发布需要的文件，例如：

- `dist/投资作战手册_V10.7.html`
- `dist/social_posts.json`
- `dist/social_summary.json`

项目根目录的 `index.html` 是当前 GitHub Pages 入口文件，继续保留。

## 远程触发仍然需要保留的文件

以下文件必须继续进入 Git：

- `remote_commands/command.json`
- `scripts/remote_command_watcher.py`
- `scripts/mobile_trigger.py`
- `scripts/set_remote_command.py`
- `run_remote_watcher_git.bat`
- `run_remote_watcher_git_silent.vbs`
- `docs/remote_control.html`
- `docs/remote_trigger.md`
- `docs/windows_startup.md`

## 如何确认远程触发仍然可用

1. 确认本地存在 `config/remote_secret.txt`，内容与手机端生成指令时填写的 secret 一致。
2. 双击启动：

```text
run_remote_watcher_git_silent.vbs
```

3. 手机打开 `docs/remote_control.html`，生成一条 `build-html` 或 `update-news` 指令。
4. 将生成的 JSON 粘贴到 GitHub 上的 `remote_commands/command.json`。
5. 等待 watcher 自动 `git pull`、执行、回写状态并 `git push`。
6. 查看本地日志：

```text
logs/watcher_runtime.log
logs/remote_command_report.json
```

如果日志显示命令执行成功，说明远程触发链路正常。
