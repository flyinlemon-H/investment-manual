@echo off
setlocal
cd /d "%~dp0"
python scripts\generate_daily_brief.py --input data\latest_export.json --mode intraday %*
pause
