@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo Stopping Voyager...
for %%R in (4315 5186) do (
    for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%%R " ^| findstr "LISTENING"') do (
        echo Stopping process on port %%R ^(PID %%P^)...
        taskkill /F /PID %%P >nul 2>&1
    )
)
taskkill /F /IM node.exe /FI "WINDOWTITLE eq Voyager*" >nul 2>&1

echo Done.
if /i not "%~1"=="nopause" pause
