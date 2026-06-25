@echo off
REM ============================================================
REM Pulso run script — double-click to start backend + frontend.
REM Two new windows open. Then visit http://localhost:3000
REM Close those windows to stop Pulso.
REM ============================================================

setlocal
set ROOT=%~dp0

REM Your Neon DB and dev secrets. Edit if you rotate the password.
set "DATABASE_URL=postgresql+asyncpg://neondb_owner:npg_5XmwVMy3pkoe@ep-raspy-breeze-athqgmm7.c-9.us-east-1.aws.neon.tech/neondb?ssl=require"
set "JWT_SECRET=dev-secret-change-me"
set "CORS_ORIGINS=http://localhost:3000"
set "ADMIN_EMAIL=admin@pulso.local"
set "ADMIN_PASSWORD=admin123"
set "FRONTEND_BASE_URL=http://localhost:3000"

echo Launching Pulso backend and frontend in two windows...
echo Backend  -> http://localhost:8000  (Swagger at /docs)
echo Frontend -> http://localhost:3000
echo.
echo Close the two new windows to stop the servers.
echo.

start "Pulso backend" cmd /k "cd /d %ROOT%backend && call .venv\Scripts\activate.bat && set DATABASE_URL=%DATABASE_URL% && set JWT_SECRET=%JWT_SECRET% && set CORS_ORIGINS=%CORS_ORIGINS% && set ADMIN_EMAIL=%ADMIN_EMAIL% && set ADMIN_PASSWORD=%ADMIN_PASSWORD% && set FRONTEND_BASE_URL=%FRONTEND_BASE_URL% && uvicorn app.main:app --reload"

REM Give the backend a head start so the frontend doesn't 502 on first load.
timeout /t 4 /nobreak >nul

start "Pulso frontend" cmd /k "cd /d %ROOT%frontend && set NEXT_PUBLIC_API_BASE=http://localhost:8000 && npm run dev"

echo.
echo Once both windows show "ready", open http://localhost:3000 in Edge.
echo Admin login: %ADMIN_EMAIL% / %ADMIN_PASSWORD%
echo.
pause
