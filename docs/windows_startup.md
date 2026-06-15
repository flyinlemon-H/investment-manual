# Windows 开机自启动远程 Watcher

本说明用于让电脑开机后自动在后台运行 GitHub 远程触发 watcher。

## 前置条件

1. 已配置好 GitHub 仓库和本机 git 登录。
2. 已创建本机口令文件：

```powershell
copy config\remote_secret.example.txt config\remote_secret.txt
```

然后把 `config\remote_secret.txt` 改成自己的私人口令。

3. 手动双击 `run_remote_watcher_git.bat` 测试过可以运行。

## 后台静默启动

项目提供：

```text
run_remote_watcher_git_silent.vbs
```

双击它会在后台静默启动：

```text
run_remote_watcher_git.bat
```

不会一直显示命令行窗口。

## 加入 Windows 启动项

1. 按 `Win + R`
2. 输入：

```text
shell:startup
```

3. 回车后会打开 Windows 启动文件夹。
4. 给 `run_remote_watcher_git_silent.vbs` 创建一个快捷方式。
5. 把快捷方式放进启动文件夹。
6. 下次登录 Windows 后，watcher 会自动在后台运行。

## 如何确认正在运行

查看日志：

```text
logs/watcher_runtime.log
```

每轮会写入类似：

```text
2026-06-15T10:00:00 | git_pull=success | command=none | executed=False | result=idle
```

远程命令执行报告：

```text
logs/remote_command_report.json
```

如果要停止 watcher，可以在任务管理器中结束对应的 `python.exe` 进程。
