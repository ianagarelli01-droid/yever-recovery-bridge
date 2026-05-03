@echo off
REM Script para testar a recuperação no Railway (Windows CMD)
REM Execute: test-recovery.bat

setlocal enabledelayedexpansion

set BASE_URL=https://yever-recovery-bridge-production.up.railway.app

echo.
echo ================================================
echo Teste de Recuperacao - Yever Recovery Bridge
echo ================================================
echo.

echo 1. Forcando execucao do job de recuperacao...
curl -X POST %BASE_URL%/debug/force-recovery-check
echo.

echo Aguardando 3 segundos para processamento...
timeout /t 3 /nobreak

echo.
echo 2. Verificando status dos checkouts...
echo.
curl %BASE_URL%/debug/checkouts > checkouts.json 2>&1

echo Resultado salvo em checkouts.json
echo.
echo ================================================
echo Abra o arquivo 'checkouts.json' para ver o resultado completo
echo ================================================
echo.

echo 3. Para ver os logs do Railway, execute:
echo    railway logs
echo.
