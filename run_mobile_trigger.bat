@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo 投资作战手册 - 本地自动化入口
echo.
echo 1. update-news  - 更新新闻数据
echo 2. update-all   - 预留全量更新入口（当前执行新闻更新）
echo 3. build-html   - 重新生成最新版 HTML 到 dist
echo.
set /p choice=请选择要执行的操作 [1-3]: 

if "%choice%"=="1" (
  python scripts\mobile_trigger.py update-news
) else if "%choice%"=="2" (
  python scripts\mobile_trigger.py update-all
) else if "%choice%"=="3" (
  python scripts\mobile_trigger.py build-html
) else (
  echo 未识别的选择：%choice%
)

echo.
echo 运行报告：logs\mobile_trigger_report.json
pause
