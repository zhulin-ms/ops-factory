@echo off
chcp 65001 > nul
setlocal EnableDelayedExpansion

echo ============================================
echo SSH Connection Test and Multiple File Upload
echo ============================================
echo.

set USER=paas
set HOST=192.168.200.35
set PASSWORD=Image0@Huawei123
set REMOTE_PATH=/home/paas/gateway/

set PSCP_PATH=C:\ProgramData\chocolatey\lib\putty.portable\tools\PSCP.EXE
set PLINK_PATH=C:\ProgramData\chocolatey\lib\putty.portable\tools\PLINK.EXE

set "DIST_PATH=C:\zhulin\ops-factory\web-app\dist"
set "ZIP_FILE=C:\zhulin\ops-factory\web-app\dist.zip"

set "FILES[0]=C:\zhulin\ops-factory\gateway\gateway-service\target\gateway-service.jar"
set "FILES[1]=C:\zhulin\ops-factory\gateway\gateway-common\target\gateway-common-1.0.0-SNAPSHOT.jar"
set "FILES[2]=C:\zhulin\goose\handle_ops_app.sh"
set "FILES[3]=C:\zhulin\goose\handle_ops_app.conf"
set "FILES[4]=C:\zhulin\ops-factory\web-app\dist.zip"

echo Configuration:
echo   User: %USER%
echo   Host: %HOST%
echo   Remote Path: %REMOTE_PATH%
echo.

echo.
echo ============================================
echo Step 0: 压缩dist文件夹
echo ============================================
echo 源路径: %DIST_PATH%
echo 压缩文件: %ZIP_FILE%
echo.

if exist "%ZIP_FILE%" (
    echo 删除旧的压缩文件: %ZIP_FILE%
    del "%ZIP_FILE%"
)

powershell -Command "Compress-Archive -Path '%DIST_PATH%\*' -DestinationPath '%ZIP_FILE%' -Force"

if exist "%ZIP_FILE%" (
    echo.
    echo ✓ 压缩成功: %ZIP_FILE%
    for %%F in ("%ZIP_FILE%") do echo 文件大小: %%~zF 字节
) else (
    echo.
    echo ✗ 压缩失败: %ZIP_FILE%
    echo 请检查源路径是否存在: %DIST_PATH%
    pause
    exit /b 1
)

echo.
echo ============================================
echo.

set FILE_COUNT=0
set SUCCESS_COUNT=0
set FAIL_COUNT=0

echo [Step 1] Testing SSH connection...
"%PLINK_PATH%" -v -pw %PASSWORD% -batch %USER%@%HOST% whoami
set SSH_EXITCODE=%errorlevel%
echo.
echo SSH Exit Code: %SSH_EXITCODE%
echo.

if %SSH_EXITCODE% neq 0 (
    echo [ERROR] SSH connection failed with exit code %SSH_EXITCODE%
    echo.
    echo Troubleshooting:
    echo 1. Check if the server is running
    echo 2. Verify the IP address: %HOST%
    echo 3. Verify the username: %USER%
    echo 4. Verify the password
    echo 5. Check if password authentication is enabled on the server
    echo 6. Check if SSH key authentication is required instead
    echo.
    goto :end
)

echo [SUCCESS] SSH connection established!
echo.
echo [Step 2] Creating remote directory...
"%PLINK_PATH%" -pw %PASSWORD% -batch %USER%@%HOST% mkdir -p %REMOTE_PATH%
set MKDIR_EXITCODE=%errorlevel%
echo.
echo mkdir Exit Code: %MKDIR_EXITCODE%
echo.

if %MKDIR_EXITCODE% neq 0 (
    echo [ERROR] Failed to create remote directory %REMOTE_PATH%
    goto :end
)

echo [SUCCESS] Remote directory created/verified: %REMOTE_PATH%
echo.
echo [Step 3] Uploading files...
echo.

for /L %%i in (0,1,4) do (
    set "CURRENT_FILE=!FILES[%%i]!"
    if exist "!CURRENT_FILE!" (
        set /a FILE_COUNT+=1
        
        echo [File %%i] Uploading: !CURRENT_FILE!
        echo   Target: %USER%@%HOST%:%REMOTE_PATH%
        
        "%PSCP_PATH%" -pw %PASSWORD% -batch -P 22 "!CURRENT_FILE!" %USER%@%HOST%:%REMOTE_PATH%
        set UPLOAD_EXITCODE=!errorlevel!
        
        if !UPLOAD_EXITCODE! equ 0 (
            echo   Status: SUCCESS
            set /a SUCCESS_COUNT+=1
        ) else (
            echo   Status: FAILED (Exit Code: !UPLOAD_EXITCODE!)
            set /a FAIL_COUNT+=1
        )
        echo.
    )
)

echo ============================================
echo [Step 4] Executing remote script...
echo ============================================
echo.

:: Check if we need to execute remote script
if !SUCCESS_COUNT! gtr 0 (
    echo Found %SUCCESS_COUNT% successfully uploaded files.
    echo Attempting to execute remote script: /home/paas/gateway/handle_ops_app.sh
    
    "%PLINK_PATH%" -pw %PASSWORD% -batch %USER%@%HOST% "cd /home/paas/gateway/"
    if %errorlevel% equ 0 (
        echo Making script executable and running...
        "%PLINK_PATH%" -pw %PASSWORD% -batch %USER%@%HOST% "cd /home/paas/gateway/;dos2unix handle_ops_app.sh handle_ops_app.conf;chmod +x handle_ops_app.sh;sh handle_ops_app.sh"
        
        if %errorlevel% equ 0 (
            echo Remote script executed successfully!
            set "EXEC_SUCCESS=1"
            echo.
            echo ============================================
            echo Remote Script Execution Summary:
            echo   Script: /home/paas/gateway/handle_ops_app.sh
            echo   Server: %USER%@%HOST%
            echo   Status: SUCCESS
            echo   Exit Code: %errorlevel%
            echo ============================================
            echo.
        ) else (
            echo Remote script execution failed with exit code %errorlevel%
            echo.
            echo ============================================
            echo Remote Script Execution Summary:
            echo   Script: /home/paas/gateway/handle_ops_app.sh
            echo   Server: %USER%@%HOST%
            echo   Status: FAILED
            echo   Exit Code: %errorlevel%
            echo ============================================
            echo.
        )
    ) else (
        echo Failed to connect to remote directory
    )
) else (
    echo Skipping remote script execution - no files were uploaded successfully.
    echo.
    echo ============================================
    echo Remote Script Execution Summary:
    echo   Script: /home/paas/gateway/handle_ops_app.sh
    echo   Server: %USER%@%HOST%
    echo   Status: SKIPPED
    echo   Reason: No files uploaded successfully
    echo ============================================
    echo.
)

echo.
echo ============================================
echo Script completed.
echo ============================================
pause


