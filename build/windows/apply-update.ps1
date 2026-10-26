param([string]$JobFile,[switch]$Bootstrap,[string]$RecoverRoot)
$ErrorActionPreference='Stop'
if ($Bootstrap) {
  try {
    $runner=Join-Path $PSHOME 'powershell.exe'
    $argsList=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-JobFile',('"'+$JobFile+'"'))
    Start-Process -FilePath $runner -ArgumentList $argsList -WindowStyle Hidden | Out-Null
    exit 0
  } catch { exit 1 }
}
$job=if($RecoverRoot){$null}else{Get-Content -LiteralPath $JobFile -Encoding UTF8 -Raw | ConvertFrom-Json}
$result=if ($job -and $job.result) { $job.result } elseif ($job) { Join-Path (Split-Path -Parent $job.installer) 'last-install.json' } else { $null }
function Report([string]$stage,[int]$code=0) { @{stage=$stage;code=$code;time=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress | Set-Content -LiteralPath $result -Encoding UTF8 }
function FileHash([string]$file) {
  $stream=[IO.File]::OpenRead($file); $hash=[Security.Cryptography.SHA512]::Create()
  try { return ([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-','').ToLowerInvariant() } finally { $stream.Dispose(); $hash.Dispose() }
}
function SafePath([string]$root,[string]$name) {
  if (!$name -or $name.Length -gt 239 -or $name -match '[\\:\x00-\x1f<>"|?*]') { throw 'Invalid patch path' }
  $at=[IO.Path]::GetFullPath($root)
  if ((Get-Item -LiteralPath $at -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked patch root' }
  foreach ($part in $name.Split('/')) {
    if (!$part -or $part -eq '.' -or $part -eq '..' -or $part -match '[. ]$' -or $part -match '^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)') { throw 'Invalid patch component' }
    $at=Join-Path $at $part
    if ((Test-Path -LiteralPath $at) -and ((Get-Item -LiteralPath $at -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Linked patch path' }
  }
  return $at
}
function RecoverTransactions([string]$root) {
  foreach ($dir in Get-ChildItem -LiteralPath $root -Directory -Force | Where-Object { $_.Name -match '^\.wave-transaction-[a-f0-9]{32}$' }) {
    if ($dir.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked transaction' }
    $journalFile=Join-Path $dir.FullName 'journal.json'
    if (Test-Path -LiteralPath $journalFile) {
      $parsed=Get-Content -LiteralPath $journalFile -Raw -Encoding UTF8 | ConvertFrom-Json; $items=@($parsed)
      if ($items.Count -gt 4096) { throw 'Invalid recovery journal' }
      if (!(Test-Path -LiteralPath (Join-Path $dir.FullName 'committed'))) {
        for ($i=$items.Count-1;$i -ge 0;$i--) {
          $entry=$items[$i]; $file=SafePath $root $entry.path
          if ($entry.slot -notmatch '^\d+\.old$') { throw 'Invalid recovery slot' }
          $saved=SafePath $dir.FullName $entry.slot
          if (Test-Path -LiteralPath $saved) {
            if (!$entry.before -or (FileHash $saved) -ne $entry.before) { throw 'Recovery backup differs' }
            if (Test-Path -LiteralPath $file) { if (!$entry.after -or (FileHash $file) -ne $entry.after) { throw 'Recovery target differs' }; [IO.File]::Delete($file) }
            [IO.Directory]::CreateDirectory((Split-Path -Parent $file)) | Out-Null
            [IO.File]::Move($saved,$file)
          } elseif ($entry.before) { if (!(Test-Path -LiteralPath $file) -or (FileHash $file) -ne $entry.before) { throw 'Recovery original missing' } }
          elseif (Test-Path -LiteralPath $file) { if (!$entry.after -or (FileHash $file) -ne $entry.after) { throw 'Recovery new target differs' }; [IO.File]::Delete($file) }
        }
      }
    }
    if ([IO.Path]::GetDirectoryName($dir.FullName) -ne $root) { throw 'Invalid recovery directory' }
    Remove-Item -LiteralPath $dir.FullName -Recurse -Force
  }
}
function ApplyFiles {
  $plan=Get-Content -LiteralPath $job.installer -Encoding UTF8 -Raw | ConvertFrom-Json
  $root=[IO.Path]::GetFullPath($job.directory); RecoverTransactions $root; $sourceRoot=Split-Path -Parent $job.installer
  if (!$plan.base -or !$plan.files -or $plan.files.Count -gt 4096) { throw 'Invalid patch plan' }
  foreach ($entry in $plan.base) { $file=SafePath $root $entry.path; if (!(Test-Path -LiteralPath $file -PathType Leaf) -or (FileHash $file) -ne $entry.sha512) { throw 'Patch base differs' } }
  $seen=@{}
  foreach ($entry in $plan.files) {
    $file=SafePath $root $entry.path
    if ($seen.ContainsKey($file)) { throw 'Duplicate patch destination' }; $seen[$file]=$true
    if ($entry.before) { if (!(Test-Path -LiteralPath $file -PathType Leaf) -or (FileHash $file) -ne $entry.before) { throw 'Patch base differs' } }
    elseif (Test-Path -LiteralPath $file) { throw 'New destination exists' }
    if ($entry.after) { $src=SafePath $sourceRoot $entry.source; if ((FileHash $src) -ne $entry.after) { throw 'Patch source differs' } }
  }
  $transaction=Join-Path $root ('.wave-transaction-'+[Guid]::NewGuid().ToString('N'))
  [IO.Directory]::CreateDirectory($transaction) | Out-Null
  $journal=New-Object 'System.Collections.Generic.List[object]'
  $cleanup=$false
  try {
    $i=0
    foreach ($entry in $plan.files) {
      $file=SafePath $root $entry.path; $saved=Join-Path $transaction ($i.ToString()+'.old'); $pending=Join-Path $transaction ($i.ToString()+'.new'); $i++
      if ($entry.after) { [IO.File]::Copy((SafePath $sourceRoot $entry.source),$pending,$false); if ((FileHash $pending) -ne $entry.after) { throw 'Copied patch differs' } }
      [IO.Directory]::CreateDirectory((Split-Path -Parent $file)) | Out-Null
      $journal.Add(@{file=$file;saved=$saved;hadOld=[bool]$entry.before;path=$entry.path;slot=[IO.Path]::GetFileName($saved);before=$entry.before;after=$entry.after})
      # Persist intent BEFORE any rename; recovery handles either side of each move.
      $journalFile=Join-Path $transaction 'journal.json'; $journalTemp=Join-Path $transaction 'journal.tmp'
      [IO.File]::WriteAllText($journalTemp,($journal | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
      if (Test-Path -LiteralPath $journalFile) { [IO.File]::Replace($journalTemp,$journalFile,(Join-Path $transaction 'journal.bak')) } else { [IO.File]::Move($journalTemp,$journalFile) }
      if ($entry.before) { [IO.File]::Move($file,$saved) }
      if ($entry.after) { [IO.File]::Move($pending,$file) }
    }
    [IO.File]::WriteAllText((Join-Path $transaction 'committed'),'complete')
    $cleanup=$true
  } catch {
    RecoverTransactions $root
    $cleanup=$true
    throw
  } finally {
    # The checked absolute path is generated directly inside the installation directory.
    if ([IO.Path]::GetDirectoryName($transaction) -ne $root -or [IO.Path]::GetFileName($transaction) -notmatch '^\.wave-transaction-[a-f0-9]{32}$') { throw 'Invalid transaction directory' }
    if ($cleanup -and (Test-Path -LiteralPath $transaction)) { Remove-Item -LiteralPath $transaction -Recurse -Force }
  }
}
try {
  if ($RecoverRoot) { RecoverTransactions ([IO.Path]::GetFullPath($RecoverRoot)); exit 0 }
  Report 'waiting'
  if ($job.sha512 -notmatch '^[a-f0-9]{128}$' -or $job.directory.Contains('"') -or $job.directory.Contains("`n") -or $job.pid -le 0) { Report 'failed' 2; exit 2 }
  if (Get-Process -Id $job.pid -ErrorAction SilentlyContinue) { Wait-Process -Id $job.pid -Timeout 40 -ErrorAction Stop }
  if (Get-Process -Id $job.pid -ErrorAction SilentlyContinue) { Report 'failed' 4; exit 4 }
  $stream=[System.IO.File]::OpenRead($job.installer)
  $sha=[System.Security.Cryptography.SHA512]::Create()
  try { $actual=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant() } finally { $stream.Dispose(); $sha.Dispose() }
  if ($actual -ne $job.sha512) { Report 'failed' 5; exit 5 }
  Report 'installing'
  if ($job.kind -eq 'files') {
    ApplyFiles
    Report 'complete'
    if (!$job.noRestart) { Start-Process -FilePath (Join-Path $job.directory 'Wave.exe') -WindowStyle Hidden | Out-Null }
    exit 0
  }
  $task=Start-Process -FilePath $job.installer -ArgumentList @('/S','--updated','--force-run',('/D='+$job.directory)) -WindowStyle Hidden -PassThru
  $task.WaitForExit()
  if ($task.ExitCode -ne 0) { Report 'failed' $task.ExitCode; exit 6 }
  Report 'complete'
} catch { [Console]::Error.WriteLine($_.Exception.Message); if ($result) { Report 'failed' 7 }; exit 7 }
finally { if ($JobFile) { Remove-Item -LiteralPath $JobFile -Force -ErrorAction SilentlyContinue } }
