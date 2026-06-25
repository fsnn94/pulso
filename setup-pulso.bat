@echo off
REM ============================================================
REM Pulso first-time setup — run this once.
REM Double-click in File Explorer or run from cmd/PowerShell.
REM ============================================================

setlocal
set ROOT=%~dp0
echo.
echo === Pulso setup ===
echo Root: %ROOT%
echo.

REM ---- Backend ----
echo [1/4] Creating Python virtual environment...
cd /d "%ROOT%backend"
if not exist .venv (
    python -m venv .venv
    if errorlevel 1 (
        echo.
        echo ERROR: Could not create venv. Is Python installed?
        echo Run "python --version" in PowerShell. If it fails, install Python 3.13.
        pause
        exit /b 1
    )
)

echo [2/4] Installing backend dependencies (may take 1-2 minutes)...
call .venv\Scripts\activate.bat
pip install --quiet --upgrade pip
pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo ERROR: pip install failed. Scroll up to see what broke.
    pause
    exit /b 1
)

REM ---- Frontend ----
echo [3/4] Installing frontend dependencies (may take 2-5 minutes)...
cd /d "%ROOT%frontend"
call npm install --no-audit --no-fund
if errorlevel 1 (
    echo.
    echo ERROR: npm install failed. Is Node.js installed?
    echo Run "node --version" in PowerShell. If it fails, install Node.js 20 LTS.
    pause
    exit /b 1
)

echo [4/4] Done!
echo.
echo Setup complete. To run Pulso, double-click start-pulso.bat.
echo.
pause
