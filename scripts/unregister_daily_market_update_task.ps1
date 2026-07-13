param([ValidateNotNullOrEmpty()][string]$TaskName = "InvestmentWorkbench-DailyMarketUpdate")

$ErrorActionPreference = "Stop"
$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $Task) {
    Write-Output "taskExists=false"
    Write-Output "taskRemoved=false"
    Write-Output "taskName=$TaskName"
    exit 0
}
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Output "taskExists=true"
Write-Output "taskRemoved=true"
Write-Output "taskName=$TaskName"
