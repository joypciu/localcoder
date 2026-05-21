@echo off
setlocal
where wt >nul 2>&1
if %ERRORLEVEL%==0 (
  wt -w 0 nt --title "LocalCoder" -- cd /d "%CD%" && localcoder %*
  exit /b %ERRORLEVEL%
)
localcoder %*
