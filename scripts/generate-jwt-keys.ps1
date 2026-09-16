$ErrorActionPreference = "Stop"

$RootDirectory = Split-Path -Parent $PSScriptRoot
$KeyDirectory = Join-Path $RootDirectory "secrets\jwt"
$TempDirectory = Join-Path $env:TEMP "japanese-learning-jwt-keygen"

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

Remove-Item $TempDirectory -Recurse -Force -ErrorAction SilentlyContinue
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

if (args.Length != 2)
{
    throw new ArgumentException("Expected private and public key output paths.");
}

var privateKeyPath = args[0];
var publicKeyPath = args[1];

using var rsa = RSA.Create(2048);

File.WriteAllText(
    privateKeyPath,
    rsa.ExportPkcs8PrivateKeyPem());

File.WriteAllText(
    publicKeyPath,
    rsa.ExportSubjectPublicKeyInfoPem());
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
    Remove-Item $TempDirectory -Recurse -Force -ErrorAction SilentlyContinue
}