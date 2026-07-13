param(
    [ValidatePattern('^([01]\d|2[0-3]):[0-5]\d$')][string]$Time = "16:30",
    [ValidateNotNullOrEmpty()][string]$TaskName = "InvestmentWorkbench-DailyMarketUpdate",
    [switch]$WeekdaysOnly,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$RunScript = Join-Path $PSScriptRoot "run_daily_market_update.ps1"
if (-not (Test-Path -LiteralPath $RunScript -PathType Leaf)) { throw "Target script not found: $RunScript" }
$Python = (Get-Command python -ErrorAction Stop).Source
if (-not $Python) { throw "Python is not available." }
$Probe = Join-Path $Root ".market_task_write_probe"
try { [System.IO.File]::WriteAllText($Probe, "ok") } finally { Remove-Item -LiteralPath $Probe -Force -ErrorAction SilentlyContinue }

$Existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($Existing -and -not $Force) { throw "Task '$TaskName' already exists. Use -Force to replace it." }

$PowerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
$Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$RunScript`""
$Action = New-ScheduledTaskAction -Execute $PowerShell -Argument $Arguments -WorkingDirectory $Root
$At = [datetime]::Today.Add([timespan]::Parse($Time))
$UseWeekdays = $WeekdaysOnly -or -not $PSBoundParameters.ContainsKey('WeekdaysOnly')
if ($UseWeekdays) {
    $Trigger = New-ScheduledTaskTrigger -Weekly -WeeksInterval 1 -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At $At
    $Schedule = "Monday-Friday $Time"
} else {
    $Trigger = New-ScheduledTaskTrigger -Daily -At $At
    $Schedule = "Daily $Time"
}
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$Principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$Task = New-ScheduledTask -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description "Post-market daily K-line update. No AI or trade execution."
Register-ScheduledTask -TaskName $TaskName -InputObject $Task -Force:$Force | Out-Null

Write-Output "taskRegistered=true"
Write-Output "taskName=$TaskName"
Write-Output "schedule=$Schedule"
Write-Output "scriptPath=$RunScript"
Write-Output "pythonPath=$Python"
