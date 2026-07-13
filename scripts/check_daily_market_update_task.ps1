param([ValidateNotNullOrEmpty()][string]$TaskName = "InvestmentWorkbench-DailyMarketUpdate")

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "market_task_status.ps1")
$RunScript = Join-Path $PSScriptRoot "run_daily_market_update.ps1"
$LogDir = Join-Path $Root "data\logs\market_data"
$RunStatusPath = Join-Path $LogDir "latest_run_status.json"
$BridgePath = Join-Path $Root "data\market_task_status_bridge.js"
$FormalPath = Join-Path $Root "data\latest_export.json"
$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$Info = if ($Task) { Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue } else { $null }
$LatestLog = Get-ChildItem -LiteralPath $LogDir -Filter "market_update_*.log" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$LatestTradeDate = ""
if (Test-Path -LiteralPath $FormalPath) {
    try {
        $Formal = Get-Content -Raw -Encoding UTF8 -LiteralPath $FormalPath | ConvertFrom-Json
        $Dates = @($Formal.stocks | ForEach-Object { $_.marketDataFreshness.last_trade_date } | Where-Object { $_ })
        if ($Dates.Count) { $LatestTradeDate = ($Dates | Sort-Object -Descending | Select-Object -First 1) }
    } catch { $LatestTradeDate = "" }
}
$Schedule = if ($Task -and $Task.Triggers) { ($Task.Triggers | ForEach-Object { "$(($_.DaysOfWeek -join ',')) $($_.StartBoundary)" }) -join '; ' } else { "" }
$Status = @{
    taskExists = [bool]$Task
    taskName = $TaskName
    enabled = if ($Task) { [string]$Task.State -ne 'Disabled' } else { $false }
    schedule = $Schedule
    nextRunTime = if ($Info -and $Info.NextRunTime.Year -gt 1900) { $Info.NextRunTime.ToString('o') } else { "" }
    lastRunTime = if ($Info -and $Info.LastRunTime.Year -gt 1900) { $Info.LastRunTime.ToString('o') } else { "" }
    lastTaskResult = if ($Info) { $Info.LastTaskResult } else { $null }
    scriptPath = $RunScript
    latestLogPath = if ($LatestLog) { $LatestLog.FullName } else { "" }
    latestDataTradeDate = $LatestTradeDate
}
$RunStatus = Read-MarketRunStatus -Path $RunStatusPath
Write-MarketTaskStatusBridge -TaskStatus $Status -RunStatus $RunStatus -BridgePath $BridgePath
$Status.GetEnumerator() | Sort-Object Name | ForEach-Object { Write-Output "$($_.Key)=$($_.Value)" }
Write-Output "bridgePath=$BridgePath"
