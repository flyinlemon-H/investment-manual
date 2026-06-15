@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo 投资作战手册 - GitHub 手机远程触发 Watcher
echo.
echo 本模式每轮会先执行 git pull。
echo 执行远程命令后会 git add / commit / push：
echo   remote_commands\command.json
echo   logs\remote_command_report.json
echo   dist
echo.
echo 按 Ctrl+C 可以停止监听。
echo.

python scripts\remote_command_watcher.py --sync-git

echo.
echo GitHub Watcher 已退出。
pause
