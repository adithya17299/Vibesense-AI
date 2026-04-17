@echo off
title VibraSense AI Server
echo Starting VibraSense AI Server...

:: Switch to the backend directory
cd /d "%~dp0backend"

:: Wait 3 seconds and open the dashboard in default browser
start "" cmd /c "timeout /t 3 >nul && start http://127.0.0.1:8000/dashboard"

:: Run the python backend within the virtual environment
.\venv\Scripts\python.exe main.py

pause
