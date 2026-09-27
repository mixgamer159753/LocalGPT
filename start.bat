@echo off
setlocal EnableDelayedExpansion

echo ============================================
echo  LocalGPT — Backend + Ngrok Launcher
echo ============================================
echo.

cd /d "C:\Users\abdou\Desktop\LocalGPT\backend"

echo [1/3] Checking venv python...
if not exist "venv\Scripts\python.exe" (
    echo ERROR: venv\Scripts\python.exe not found. Run setup first.
    pause
    exit /b 1
)

echo [2/3] Starting backend on 0.0.0.0:8000...
start "LocalGPT-Backend" /D "C:\Users\abdou\Desktop\LocalGPT\backend" ^
    "C:\Users\abdou\Desktop\LocalGPT\backend\venv\Scripts\python.exe" ^
    -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
echo         Backend PID: %ERRORLEVEL%  (check Task Manager if needed)
echo.

echo [3/3] Starting ngrok tunnel...
echo         Open the ngrok window for your HTTPS URL.
echo         Set NEXT_PUBLIC_API_URL in Vercel to that URL.
echo.
start "LocalGPT-Ngrok" /D "C:\Users\abdou\Desktop\LocalGPT" ngrok http 8000

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
    echo    NEXT_PUBLIC_API_URL = https://<your-ngrok-url>.ngrok-free.app
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
