@echo off
rem LocalCoder Windows source launcher
rem Runs the LocalCoder CLI from source using Bun, with friendly error messages.

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%" || (
    echo Failed to switch to LocalCoder directory: %SCRIPT_DIR%
    exit /b 1
)

where bun >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [LocalCoder] Bun was not found on your PATH.
    echo.
    echo Please install Bun first:
    echo   powershell -c "irm bun.sh/install.ps1 ^| iex"
    echo.
    echo Or use the npm-installed binary instead:
    echo   npm install -g localcoder
    echo   localcoder
    exit /b 1
)

if "%1"=="" (
    rem No arguments: start the simple REPL (most user-friendly default)
    bun --conditions=browser ./src/index.ts --simple %*
) else (
    bun --conditions=browser ./src/index.ts %*
)
