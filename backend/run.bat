@echo off
title Django - Controle de Certificados

echo ========================================
echo   Controle de Certificados - Servidor
echo ========================================
echo.

REM Caminho da pasta do backend
cd /d "%~dp0"

REM Define variavel de ambiente do Django
set DJANGO_SETTINGS_MODULE=backend.settings

REM Verifica se Python esta disponivel
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Python nao encontrado. Instale Python 3.10+ e tente novamente.
    pause
    exit /b 1
)

echo [INFO] Aplicando migracoes...
python manage.py migrate --noinput

echo.
echo [INFO] Verificando superuser admin...
python -c "import os, django; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings'); django.setup(); from django.contrib.auth import get_user_model; U = get_user_model(); print('OK' if U.objects.filter(username='admin').exists() else 'CRIANDO'); U.objects.create_superuser('admin', 'admin@patrimonio.local', '1324') if not U.objects.filter(username='admin').exists() else None"

echo.
echo [INFO] Iniciando servidor Django em http://10.1.1.180:8080/
echo [INFO] Admin: http://10.1.1.180:8080/admin/  (admin / 1324)
echo [INFO] API:   http://10.1.1.180:8080/api/certificados/
echo.
echo Pressione Ctrl+C para parar o servidor.
echo.

REM Inicia servidor
python manage.py runserver 0.0.0.0:8080

pause
