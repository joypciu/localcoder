@echo off
rem Launcher for the built LocalCoder Windows CLI binary.
rem Drops into the same directory as this file and runs localcoder.exe.

setlocal
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%" || (
    echo Failed to locate LocalCoder binary directory.
    exit /b 1
)

if not exist "localcoder.exe" (
    echo LocalCoder binary not found: %SCRIPT_DIR%localcoder.exe
    echo Did you run 'bun run build:win' first?
    exit /b 1
)

localcoder.exe %*
