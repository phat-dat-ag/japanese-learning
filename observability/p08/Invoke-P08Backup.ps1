param([Parameter(Mandatory=$true)][string]$Config)
$ErrorActionPreference = 'Stop'
# Suitable for an approved scheduler. Does not register a task or read environment secrets.
$configPath = (Resolve-Path -LiteralPath $Config).Path
& node (Join-Path $PSScriptRoot 'backup.cjs') run $configPath
exit $LASTEXITCODE
