function Write-AtomicUtf8File {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Content)
    $Directory = Split-Path -Parent $Path
    if ($Directory) { New-Item -ItemType Directory -Force -Path $Directory | Out-Null }
    $TempPath = "$Path.tmp"
    try {
        [System.IO.File]::WriteAllText($TempPath, $Content, [System.Text.UTF8Encoding]::new($false))
        if (Test-Path -LiteralPath $Path) {
            $ReplaceBackup = "$Path.replace-backup"
            [System.IO.File]::Replace($TempPath, $Path, $ReplaceBackup)
            Remove-Item -LiteralPath $ReplaceBackup -Force -ErrorAction SilentlyContinue
        } else {
            [System.IO.File]::Move($TempPath, $Path)
        }
    } finally {
        Remove-Item -LiteralPath $TempPath -Force -ErrorAction SilentlyContinue
        if ($ReplaceBackup) { Remove-Item -LiteralPath $ReplaceBackup -Force -ErrorAction SilentlyContinue }
    }
}

function Write-MarketRunStatus {
    param([Parameter(Mandatory)][hashtable]$Status, [Parameter(Mandatory)][string]$Path)
    $Json = $Status | ConvertTo-Json -Depth 8
    $null = $Json | ConvertFrom-Json
    Write-AtomicUtf8File -Path $Path -Content ($Json + "`n")
}

function Read-MarketRunStatus {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    try { return Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | ConvertFrom-Json } catch { return $null }
}

function Write-MarketTaskStatusBridge {
    param(
        [Parameter(Mandatory)][hashtable]$TaskStatus,
        [Parameter(Mandatory)][string]$BridgePath,
        [object]$RunStatus
    )
    $Payload = [ordered]@{
        generated_at = (Get-Date).ToString('o')
        task_exists = [bool]$TaskStatus.taskExists
        task_name = [string]$TaskStatus.taskName
        enabled = $TaskStatus.enabled
        schedule = [string]$TaskStatus.schedule
        next_run_time = [string]$TaskStatus.nextRunTime
        last_run_time = [string]$TaskStatus.lastRunTime
        last_task_result = $TaskStatus.lastTaskResult
        script_path = [string]$TaskStatus.scriptPath
        latest_log_path = [string]$TaskStatus.latestLogPath
        latest_data_trade_date = [string]$TaskStatus.latestDataTradeDate
        latest_run = $RunStatus
    }
    $Json = $Payload | ConvertTo-Json -Depth 10 -Compress
    $null = $Json | ConvertFrom-Json
    Write-AtomicUtf8File -Path $BridgePath -Content ("window.MARKET_TASK_STATUS = $Json;`n")
}
