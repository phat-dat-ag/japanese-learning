param([ValidateSet('backup','drill')][string]$Mode='backup',[Parameter(Mandatory=$true)][string]$Config,[string]$Node='node.exe')
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location -LiteralPath $repo
$logDirectory=Join-Path (Split-Path -Parent $Config) 'logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$log=Join-Path $logDirectory ((Get-Date -Format 'yyyyMMddTHHmmssffff')+'-'+$Mode+'.log')
# Windows PowerShell 5.1 converts redirected native stderr to NativeCommandError.
# Stop would terminate before recording diagnostics or propagating Node's exit code.
# Resolve the executable first; relax only native invocation, then restore Stop.
Get-Command $Node -ErrorAction Stop | Out-Null
$nativeExitCode=$null
try {
    $ErrorActionPreference='Continue'
    $LASTEXITCODE=$null
    if ($Mode -eq 'backup') { & $Node (Join-Path $PSScriptRoot 'local-backup.cjs') $Config --force *> $log }
    else { & $Node (Join-Path $PSScriptRoot 'local-drill.cjs') $Config *> $log }
    $nativeExitCode=$LASTEXITCODE
} finally {
    $ErrorActionPreference='Stop'
}
if ($null -eq $nativeExitCode) { throw 'Backup executable did not return an exit code' }
exit $nativeExitCode
