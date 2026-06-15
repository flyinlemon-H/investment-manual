@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo 投资作战手册 - 手机远程触发 Watcher
echo.
echo 正在监听 remote_commands\command.json
echo 手机或 GitHub 同步写入 update-news / update-all / build-html 后，本机将自动执行。
echo 按 Ctrl+C 可以停止监听。
echo.

python scripts\remote_command_watcher.py --interval 10

echo.
echo Watcher 已退出。
pause
