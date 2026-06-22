#Requires -RunAsAdministrator
<#
.SYNOPSIS
    One-click LocalCoder setup for Windows.
.DESCRIPTION
    Installs Bun (if missing), clones or updates LocalCoder, installs dependencies,
    builds the Windows CLI, and adds it to the system PATH.
.PARAMETER InstallDir
    Directory to install LocalCoder. Default: C:\tools\localcoder
.PARAMETER SkipBun
    Skip Bun installation check.
.PARAMETER SkipBuild
    Skip building the Windows CLI binary.
.EXAMPLE
    .\scripts\setup-windows.ps1
    .\scripts\setup-windows.ps1 -InstallDir D:\localcoder -SkipBuild
#>
param(
    [string]$InstallDir = "C:\tools\localcoder",
    [switch]$SkipBun,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) {
    Write-Host "`n[LocalCoder Setup] $msg" -ForegroundColor Cyan
}

function Write-Ok($msg) {
    Write-Host "  ✓ $msg" -ForegroundColor Green
}

function Write-Warn($msg) {
    Write-Host "  ⚠ $msg" -ForegroundColor Yellow
}

# 1. Bun
Write-Step "Checking Bun..."
$bun = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bun -and -not $SkipBun) {
    Write-Warn "Bun not found. Installing..."
    powershell -c "irm bun.sh/install.ps1 | iex"
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    $bun = Get-Command bun -ErrorAction SilentlyContinue
    if (-not $bun) { throw "Bun installation failed. Please install manually and re-run." }
}
Write-Ok "Bun: $(bun --version)"

# 2. Clone or update
Write-Step "Installing LocalCoder to $InstallDir..."
if (Test-Path "$InstallDir\.git") {
    Write-Warn "Existing install found. Updating..."
    Set-Location $InstallDir
    git pull
} else {
    if (Test-Path $InstallDir) {
        Remove-Item -Recurse -Force $InstallDir
    }
    git clone https://github.com/anomalyco/localcoder.git $InstallDir
    Set-Location $InstallDir
}
Write-Ok "Source ready at $InstallDir"

# 3. Dependencies
Write-Step "Installing dependencies..."
bun install
Write-Ok "Dependencies installed"

# 4. Build Windows CLI
if (-not $SkipBuild) {
    Write-Step "Building Windows CLI..."
    Set-Location "$InstallDir\packages\localcoder"
    bun run build:win
    Write-Ok "Windows CLI built"

    # 5. Add to PATH
    Write-Step "Adding LocalCoder to PATH..."
    $binDir = "$InstallDir\packages\localcoder\dist\npm\localcoder\bin"
    if (-not (Test-Path $binDir)) {
        $binDir = "$InstallDir\packages\localcoder\dist\npm\localcoder"
    }
    if (Test-Path $binDir) {
        $currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
        if ($currentPath -notlike "*$binDir*") {
            [Environment]::SetEnvironmentVariable("Path", "$currentPath;$binDir", "Machine")
            Write-Ok "Added $binDir to system PATH"
        } else {
            Write-Ok "Already in PATH"
        }
    } else {
        Write-Warn "Could not locate built binary directory. You may need to add it to PATH manually."
    }
} else {
    Write-Warn "Skipping build. You can run from source with .\packages\localcoder\localcoder.bat"
}

# 6. Source launcher fallback
$batPath = "$InstallDir\packages\localcoder\localcoder.bat"
if (Test-Path $batPath) {
    Write-Ok "Source launcher available: $batPath"
}

# 7. Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  LocalCoder Setup Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Source:   $InstallDir"
Write-Host "  Launcher: $batPath"
if (-not $SkipBuild) {
    Write-Host "  Command:  localcoder --help"
}
Write-Host "`nRun 'localcoder doctor' to verify your setup."
Write-Host "Run 'localcoder llamacpp setup' to configure a local model."
