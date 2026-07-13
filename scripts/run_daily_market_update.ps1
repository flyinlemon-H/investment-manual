$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $Root "data\logs\market_data"
$LockPath = Join-Path $LogDir "market_update.lock"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$LogPath = Join-Path $LogDir "market_update_$Timestamp.log"
$StatusPath = Join-Path $LogDir "latest_run_status.json"
$CheckScript = Join-Path $PSScriptRoot "check_daily_market_update_task.ps1"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
. (Join-Path $PSScriptRoot "market_task_status.ps1")
$StartedAt = (Get-Date).ToString('o')

# Recommended Task Scheduler time: after the Hong Kong close (for example 16:30 Asia/Hong_Kong).
# The process is not resident; a missed run is filled on the next execution.
try {
    $Lock = [System.IO.File]::Open($LockPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
} catch {
    "$(Get-Date -Format o) skipped: another market update is running" | Set-Content -Encoding UTF8 $LogPath
    Write-MarketRunStatus -Path $StatusPath -Status @{ started_at=$StartedAt; finished_at=(Get-Date).ToString('o'); status='failed'; exit_code=3; symbols=0; success=0; failed=0; latest_trade_date=''; write_status='skipped'; bridge_status='skipped'; log_path=$LogPath; error='another market update is running' }
    if(Test-Path -LiteralPath $CheckScript){ & $CheckScript *>> $LogPath }
    exit 3
}

try {
    Set-Location $Root
    $Python = (Get-Command python -ErrorAction Stop).Source
    "$(Get-Date -Format o) start: $Python scripts\update_daily_kline.py --all" | Set-Content -Encoding UTF8 $LogPath
    & $Python scripts\update_daily_kline.py --all *>> $LogPath
    $Code = $LASTEXITCODE
    $Output = Get-Content -Raw -Encoding UTF8 -LiteralPath $LogPath
    $Value = { param($Name) $Match=[regex]::Match($Output,"(?m)^$([regex]::Escape($Name)):\s*(.+)$"); if($Match.Success){$Match.Groups[1].Value.Trim()}else{''} }
    $Symbols = & $Value 'symbols'
    $Success = & $Value 'success'
    $Failed = & $Value 'failed'
    $WriteStatus = & $Value 'writeStatus'
    $BridgeStatus = & $Value 'bridgeStatus'
    $LatestDates = [regex]::Matches($Output,'projected=(\d{4}-\d{2}-\d{2})') | ForEach-Object { $_.Groups[1].Value }
    $LatestTradeDate = if($LatestDates){$LatestDates | Sort-Object -Descending | Select-Object -First 1}else{''}
    $ErrorText = if($Code -eq 0){''}else{([regex]::Matches($Output,'(?m)^.+error=.+$') | ForEach-Object {$_.Value}) -join '; '}
    Write-MarketRunStatus -Path $StatusPath -Status @{ started_at=$StartedAt; finished_at=(Get-Date).ToString('o'); status=$(if($Code -eq 0){'success'}else{'failed'}); exit_code=$Code; symbols=[int]($Symbols -as [int]); success=[int]($Success -as [int]); failed=[int]($Failed -as [int]); latest_trade_date=$LatestTradeDate; write_status=$WriteStatus; bridge_status=$BridgeStatus; log_path=$LogPath; error=$ErrorText }
    if(Test-Path -LiteralPath $CheckScript){ & $CheckScript *>> $LogPath }
    "$(Get-Date -Format o) exitCode=$Code" | Add-Content -Encoding UTF8 $LogPath
    exit $Code
} catch {
    "$(Get-Date -Format o) failed: $($_.Exception.Message)" | Add-Content -Encoding UTF8 $LogPath
    Write-MarketRunStatus -Path $StatusPath -Status @{ started_at=$StartedAt; finished_at=(Get-Date).ToString('o'); status='failed'; exit_code=1; symbols=0; success=0; failed=0; latest_trade_date=''; write_status='failed'; bridge_status='unknown'; log_path=$LogPath; error=$_.Exception.Message }
    if(Test-Path -LiteralPath $CheckScript){ & $CheckScript *>> $LogPath }
    exit 1
} finally {
    if ($Lock) { $Lock.Dispose() }
    Remove-Item -LiteralPath $LockPath -Force -ErrorAction SilentlyContinue
}
