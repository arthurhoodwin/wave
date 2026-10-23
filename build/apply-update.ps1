param([Parameter(Mandatory=$true)][string]$JobFile,[switch]$Bootstrap)
$ErrorActionPreference='Stop'
if ($Bootstrap) {
  try {
    $runner=Join-Path $PSHOME 'powershell.exe'
    $argsList=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-JobFile',('"'+$JobFile+'"'))
    Start-Process -FilePath $runner -ArgumentList $argsList -WindowStyle Hidden | Out-Null
    exit 0
  } catch { exit 1 }
}
$job=Get-Content -LiteralPath $JobFile -Encoding UTF8 -Raw | ConvertFrom-Json
$result=Join-Path (Split-Path -Parent $job.installer) 'last-install.json'
function Report([string]$stage,[int]$code=0) { @{stage=$stage;code=$code;time=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress | Set-Content -LiteralPath $result -Encoding UTF8 }
try {
  Report 'waiting'
  if ($job.sha512 -notmatch '^[a-f0-9]{128}$' -or $job.directory.Contains('"') -or $job.directory.Contains("`n") -or $job.pid -le 0) { Report 'failed' 2; exit 2 }
  if (Get-Process -Id $job.pid -ErrorAction SilentlyContinue) { Wait-Process -Id $job.pid -Timeout 40 -ErrorAction Stop }
  if (Get-Process -Id $job.pid -ErrorAction SilentlyContinue) { Report 'failed' 4; exit 4 }
  $stream=[System.IO.File]::OpenRead($job.installer)
  $sha=[System.Security.Cryptography.SHA512]::Create()
  try { $actual=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant() } finally { $stream.Dispose(); $sha.Dispose() }
  if ($actual -ne $job.sha512) { Report 'failed' 5; exit 5 }
  Report 'installing'
  $task=Start-Process -FilePath $job.installer -ArgumentList @('/S','--updated','--force-run',('/D='+$job.directory)) -WindowStyle Hidden -PassThru
  $task.WaitForExit()
  if ($task.ExitCode -ne 0) { Report 'failed' $task.ExitCode; exit 6 }
  Report 'complete'
} catch { Report 'failed' 7; exit 7 }
finally { Remove-Item -LiteralPath $JobFile -Force -ErrorAction SilentlyContinue }
