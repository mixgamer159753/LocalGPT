@echo off
setlocal EnableDelayedExpansion
set "PROJECT_DIR=%~dp0"

echo ============================================
echo  LocalGPT — Backend + Ngrok Launcher
echo ============================================
echo.

cd /d "%PROJECT_DIR%backend"

echo [1/3] Checking venv python...
if not exist "venv\Scripts\python.exe" (
    echo ERROR: venv\Scripts\python.exe not found. Run setup first.
    pause
    exit /b 1
)

echo [2/3] Starting backend on 0.0.0.0:8000...
start "LocalGPT-Backend" /D "%PROJECT_DIR%backend" ^
    "%PROJECT_DIR%backend\venv\Scripts\python.exe" ^
    -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
echo.

echo [3/3] Starting ngrok tunnel...
echo         Open the ngrok window for your HTTPS URL.
echo         Set NEXT_PUBLIC_API_URL in Vercel to that URL.
echo.
start "LocalGPT-Ngrok" /D "%PROJECT_DIR%" ngrok http 8000

echo.
echo ============================================
echo  Waiting for backend to be ready...
echo ============================================
echo.

:wait_loop
timeout /t 2 /nobreak >nul 2>&1
curl -s http://127.0.0.1:8000/api/health 2>nul | findstr /i "ok" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Backend is live and healthy.
    echo.
    curl -s http://127.0.0.1:8000/api/health
    echo.
    echo === Next steps ===
    echo 1. Copy the HTTPS URL from the ngrok window.
    echo 2. In Vercel: Settings > Environment Variables > add:
    echo    NEXT_PUBLIC_API_URL = https://YOUR-TUNNEL.ngrok-free.app
    echo 3. Redeploy the frontend in Vercel.
    echo.
    echo Backend window and ngrok window are both running.
    pause
    exit /b 0
) else (
    echo [?] Backend not ready yet (status: degraded or unreachable)...
    echo     Re-checking in 2s...
    goto wait_loop
)
