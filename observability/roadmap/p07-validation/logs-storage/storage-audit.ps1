$ErrorActionPreference = 'Stop'
$evidencePath = Join-Path $PSScriptRoot 'evidence\desktop-storage.json'
$vhdPath = Join-Path $env:LOCALAPPDATA 'Docker\wsl\disk\docker_data.vhdx'
$vhd = Get-Item -LiteralPath $vhdPath
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class P07DiskFileInfo {
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
 public static extern uint GetCompressedFileSizeW(string path, out uint high);
}
"@
[uint32]$upper=0
[uint32]$lower=[P07DiskFileInfo]::GetCompressedFileSizeW($vhd.FullName,[ref]$upper)
$allocated=[uint64]$upper * 4294967296 + [uint64]$lower
$report=[ordered]@{
 captured_utc=[DateTime]::UtcNow.ToString('o')
 backing_vhd_path=$vhd.FullName
 vhd_file_length_bytes=$vhd.Length
 vhd_allocated_bytes=$allocated
 vhd_attributes=$vhd.Attributes.ToString()
 vhd_last_write_utc=$vhd.LastWriteTimeUtc.ToString('o')
 backing_drive=$vhd.PSDrive.Name
 parent_links=@($vhd.Directory,$vhd.Directory.Parent,$vhd.Directory.Parent.Parent | ForEach-Object { [pscustomobject]@{path=$_.FullName;linkType=$_.LinkType;target=$_.Target} })
 drives=@(Get-PSDrive -Name C,D | ForEach-Object { [pscustomobject]@{name=$_.Name;used_bytes=$_.Used;free_bytes=$_.Free;total_bytes=$_.Used+$_.Free} })
 wsl_mapping=((wsl -d docker-desktop -- sh -c 'lsblk -b -o NAME,SIZE,FSTYPE,MOUNTPOINT; df -Pk /mnt/docker-desktop-disk; findmnt -T /tmp/docker-desktop-root/var/lib/docker -n -o SOURCE,TARGET') -join "`n")
 disk_modified_by_task=$false
}
$report | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 -LiteralPath $evidencePath
$report | ConvertTo-Json -Depth 6
