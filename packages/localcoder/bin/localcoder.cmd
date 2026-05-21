@echo off
setlocal
set "DIR=%~dp0"
set "BIN=%DIR%.localcoder"
if not exist "%BIN%" set "BIN=%DIR%localcoder.exe"
if not exist "%BIN%" (
  echo LocalCoder binary not found. Run: npm install -g localcoder
  exit /b 1
)
"%BIN%" %*
exit /b %ERRORLEVEL%
