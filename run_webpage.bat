@echo off
setlocal
cd /d "%~dp0"
set OPEN_FLAG=
if /I "%~1"=="--open-manual" set OPEN_FLAG=--open-manual
python run_pipeline.py --source webpage --urls urls.txt %OPEN_FLAG%
if errorlevel 1 (
  echo.
  echo Pipeline failed. See logs\pipeline_report_*.json for details.
) else (
  echo.
  echo Pipeline succeeded.
)
pause
