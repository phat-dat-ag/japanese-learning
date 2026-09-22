$ErrorActionPreference = "Stop"

$RootDirectory = Split-Path -Parent $PSScriptRoot
$KeyDirectory = Join-Path $RootDirectory "secrets\jwt"
$TempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$TempDirectory = Join-Path $TempRoot ("japanese-learning-jwt-keygen-" + [guid]::NewGuid().ToString("N"))

$PrivateKeyPath = Join-Path $KeyDirectory "private.pem"
$PublicKeyPath = Join-Path $KeyDirectory "public.pem"

New-Item -ItemType Directory -Force -Path $KeyDirectory | Out-Null

if ((Test-Path $PrivateKeyPath) -or (Test-Path $PublicKeyPath)) {
    throw "JWT key files already exist. Remove them manually before generating a new key pair."
}

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw ".NET SDK was not found in PATH."
}

Write-Host "Generating RSA 2048-bit key pair..."

New-Item -ItemType Directory -Force -Path $TempDirectory | Out-Null

$ProjectFile = Join-Path $TempDirectory "KeyGenerator.csproj"
$ProgramFile = Join-Path $TempDirectory "Program.cs"

@'
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net9.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
</Project>
'@ | Set-Content -Path $ProjectFile -Encoding UTF8

@'
using System.Security.Cryptography;
using System.Security.AccessControl;
using System.Security.Principal;

if (args.Length != 2)
{
    throw new ArgumentException("Expected private and public key output paths.");
}

var privateKeyPath = args[0];
var publicKeyPath = args[1];

using var rsa = RSA.Create(2048);

// Exclusive creation also protects against concurrent generators overwriting keys.
static void WriteNewKey(string path, string pem, bool isPrivate)
{
    var options = new FileStreamOptions { Mode = FileMode.CreateNew, Access = FileAccess.Write };
    if (!OperatingSystem.IsWindows())
        options.UnixCreateMode = isPrivate
            ? UnixFileMode.UserRead | UnixFileMode.UserWrite
            : UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.GroupRead | UnixFileMode.OtherRead;
    using var stream = new FileStream(path, options);
    if (isPrivate && OperatingSystem.IsWindows())
    {
        var security = new FileSecurity();
        security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
        security.AddAccessRule(new FileSystemAccessRule(
            WindowsIdentity.GetCurrent().User!, FileSystemRights.FullControl, AccessControlType.Allow));
        new FileInfo(path).SetAccessControl(security);
    }
    using var writer = new StreamWriter(stream);
    writer.Write(pem);
}

WriteNewKey(privateKeyPath, rsa.ExportPkcs8PrivateKeyPem(), true);
WriteNewKey(publicKeyPath, rsa.ExportSubjectPublicKeyInfoPem(), false);
'@ | Set-Content -Path $ProgramFile -Encoding UTF8

try {
    dotnet run `
        --project $ProjectFile `
        --configuration Release `
        -- $PrivateKeyPath $PublicKeyPath

    if ($LASTEXITCODE -ne 0) {
        throw "Failed to generate RSA key pair."
    }

    Write-Host ""
    Write-Host "JWT RSA key pair generated successfully."
    Write-Host "Private key: $PrivateKeyPath"
    Write-Host "Public key : $PublicKeyPath"
}
finally {
    $ResolvedTempDirectory = [System.IO.Path]::GetFullPath($TempDirectory)
    if ([System.IO.Path]::GetDirectoryName($ResolvedTempDirectory) -ne $TempRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar)) {
        throw "Refusing to clean a key generator directory outside the temporary directory."
    }
    Remove-Item -LiteralPath $ResolvedTempDirectory -Recurse -Force -ErrorAction SilentlyContinue
}