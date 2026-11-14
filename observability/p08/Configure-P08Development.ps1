param([string]$Destination='D:\JapaneseLearningBackups',[string]$DailyTime='03:00',[switch]$InstallSchedule)
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$private=Join-Path $repo '.local/p08-development'
New-Item -ItemType Directory -Path $private -Force | Out-Null
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $private /inheritance:r /grant:r "${identity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot enforce private configuration ACL' }
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
$destinationItem=Get-Item -LiteralPath $Destination
if ($destinationItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked destination rejected' }
$destinationPath=$destinationItem.FullName
# Do not alter existing destination ACLs or delete/adopt existing unrelated files.
$key=Join-Path $private 'backup.key'
if (!(Test-Path -LiteralPath $key)) {
    $random=New-Object byte[] 32
    $generator=[Security.Cryptography.RandomNumberGenerator]::Create()
    $generator.GetBytes($random)
    $stream=[IO.File]::Open($key,[IO.FileMode]::CreateNew)
    try { $stream.Write($random,0,32) } finally { $stream.Dispose(); $generator.Dispose() }
}
if ((Get-Item -LiteralPath $key).Length -ne 32) { throw 'Existing key is not 32 bytes; do not replace it' }
$configPath=Join-Path $private 'config.json'
$config=@{
    destination=$destinationPath; keyFile=$key; stagingRoot=(Join-Path $private 'staging')
    policy=@{
        approved=$true; environment='development'; offHostApproved=$false
        offHostException=@{approved=$true; approvalReference='User: Complete Local Development Backup & Recovery, 2026-11-14'; limitation='Same D: storage; no protection from physical disk/host loss'}
        owner=$identity; dataClasses=@('allowlisted canonical application telemetry','original stored metric samples','OTel traces','Grafana dashboard definitions','collector SQLite offsets','committed observability configuration')
        offHostDestinationEvidence='NOT OFF-HOST; explicitly approved development-only exception'
        keyCustody='Current Windows user and SYSTEM ACL on ignored .local/p08-development; no key export or credential backup'
        retentionDays=7; maxDestinationBytes=1073741824; backupIntervalHours=24
        rpoSeconds=86400; rtoSeconds=14400; drillIntervalDays=30
        approvalReference='Explicit local development policy in current user instruction; not production approval'
    }
    configFiles=@('observability/p07/prometheus/prometheus.yml','observability/p07/prometheus/rules/p05.rules.yml','observability/p07/prometheus/rules/storage.rules.yml','observability/p07/prometheus/storage.tests.json','observability/p07/tempo.yml','observability/p07/collector.yml','observability/p07/fluent-bit/fluent-bit.conf','observability/p07/fluent-bit/parsers-app.conf','observability/p07/fluent-bit/normalize.lua','observability/p07/fluent-bit/registry.json','observability/p07/grafana/provisioning/datasources/prometheus.yml','observability/p07/grafana/provisioning/datasources/tempo.yml','observability/p07/grafana/provisioning/dashboards/health.yml')
}
if (Test-Path -LiteralPath $configPath) {
    $existing=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if ($existing.destination -ne $destinationPath -or $existing.keyFile -ne $key) { throw 'Existing configuration differs; preserve it and review' }
} else { [IO.File]::WriteAllText($configPath,($config | ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false))) }
if ($InstallSchedule) {
    $node=(Get-Command node.exe).Source
    $runner=Join-Path $PSScriptRoot 'Invoke-P08Local.ps1'
    $powershell=(Get-Command powershell.exe).Source
    $definitions=@(
        @{Name='JapaneseLearning-P08-Daily'; Mode='backup'; Trigger=(New-ScheduledTaskTrigger -Daily -At $DailyTime)},
        @{Name='JapaneseLearning-P08-MonthlyRecovery'; Mode='drill'; Trigger=$null}
    )
    foreach ($definition in $definitions) {
        $arguments="-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`" -Mode $($definition.Mode) -Config `"$configPath`" -Node `"$node`""
        $action=New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $repo
        $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
        $principal=New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
        $existingTask=Get-ScheduledTask -TaskName $definition.Name -ErrorAction SilentlyContinue
        if ($existingTask) {
            if ($existingTask.Actions.Execute -ne $powershell -or $existingTask.Actions.Arguments -ne $arguments) { throw "Existing task $($definition.Name) differs; not overwriting" }
            continue
        }
        if ($definition.Trigger) { Register-ScheduledTask -TaskName $definition.Name -Action $action -Trigger $definition.Trigger -Settings $settings -Principal $principal | Out-Null }
        else {
            $oneTime=New-ScheduledTaskTrigger -Once -At '2026-12-01T04:00:00'
            Register-ScheduledTask -TaskName $definition.Name -Action $action -Trigger $oneTime -Settings $settings -Principal $principal | Out-Null
            $xml=[xml](Export-ScheduledTask -TaskName $definition.Name)
            $ns=$xml.DocumentElement.NamespaceURI
            $triggers=$xml.CreateElement('Triggers',$ns)
            $calendar=$xml.CreateElement('CalendarTrigger',$ns)
            $start=$xml.CreateElement('StartBoundary',$ns); $start.InnerText='2026-12-01T04:00:00'; [void]$calendar.AppendChild($start)
            $enabled=$xml.CreateElement('Enabled',$ns); $enabled.InnerText='true'; [void]$calendar.AppendChild($enabled)
            $schedule=$xml.CreateElement('ScheduleByMonth',$ns); $days=$xml.CreateElement('DaysOfMonth',$ns); $day=$xml.CreateElement('Day',$ns); $day.InnerText='1'; [void]$days.AppendChild($day); [void]$schedule.AppendChild($days)
            $months=$xml.CreateElement('Months',$ns)
            foreach($month in @('January','February','March','April','May','June','July','August','September','October','November','December')) { [void]$months.AppendChild($xml.CreateElement($month,$ns)) }
            [void]$schedule.AppendChild($months); [void]$calendar.AppendChild($schedule); [void]$triggers.AppendChild($calendar)
            if ($xml.Task.Triggers) { [void]$xml.DocumentElement.ReplaceChild($triggers,$xml.Task.Triggers) } else { [void]$xml.DocumentElement.AppendChild($triggers) }
            Register-ScheduledTask -TaskName $definition.Name -Xml $xml.OuterXml -Force | Out-Null
        }
    }
}
[pscustomobject]@{Config=$configPath;Destination=$destinationPath;Daily=$DailyTime;SchedulesRequested=[bool]$InstallSchedule;UserContext='Interactive desktop user; Docker Desktop must be available; StartWhenAvailable enabled';OffHost=$false} | ConvertTo-Json
