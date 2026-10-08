@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js 22 LTS y vuelve a abrir este archivo.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Abre http://localhost:3000 cuando aparezca Ready.
call npm run dev
pause
