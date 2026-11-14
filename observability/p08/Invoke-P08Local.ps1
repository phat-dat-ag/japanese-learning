param([ValidateSet('backup','drill')][string]$Mode='backup',[Parameter(Mandatory=$true)][string]$Config,[string]$Node='node.exe')
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location -LiteralPath $repo
$logDirectory=Join-Path (Split-Path -Parent $Config) 'logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$log=Join-Path $logDirectory ((Get-Date -Format 'yyyyMMddTHHmmssffff')+'-'+$Mode+'.log')
if ($Mode -eq 'backup') { & $Node (Join-Path $PSScriptRoot 'local-backup.cjs') $Config --force *> $log }
else { & $Node (Join-Path $PSScriptRoot 'local-drill.cjs') $Config *> $log }
exit $LASTEXITCODE
