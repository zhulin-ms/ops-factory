# ==============================================================================
# ops-factory Windows service restart script
#
# Usage: restart-gateway-webapp.ps1 [gateway|webapp|knowledge|bi|control|all] [nobuild]
#   gateway   - restart gateway (includes sop-executor build) only (default)
#   webapp    - restart webapp only
#   knowledge - restart knowledge-service only
#   bi        - restart business-intelligence only
#   control   - restart control-center only
#   all       - restart all services (gateway, knowledge, bi, control, webapp)
#   nobuild   - (optional) skip build steps, restart only
# ==============================================================================

param(
    [Parameter(Position = 0)]
    [ValidateSet("gateway", "webapp", "knowledge", "bi", "control", "all")]
    [string]$Component = "all",

    [Parameter(Position = 1)]
    [switch]$NoBuild
)

$ErrorActionPreference = "Continue"

# === Resolve project root ===
$ROOT_DIR = Split-Path -Parent $PSScriptRoot

# === Configuration ===
$GATEWAY_PORT = 3000
$WEBAPP_PORT = 5173
$KNOWLEDGE_PORT = 8092
$BI_PORT = 8093
$CONTROL_PORT = 8094
$GATEWAY_SECRET_KEY = "test"
$GATEWAY_SCHEME = "http"

# === Helper functions ===
function Write-Status($Level, $Message) {
    switch ($Level) {
        "INFO"  { Write-Host "[INFO]  $Message" -ForegroundColor Green }
        "OK"    { Write-Host "[OK]    $Message" -ForegroundColor Green }
        "WARN"  { Write-Host "[WARN]  $Message" -ForegroundColor Yellow }
        "ERROR" { Write-Host "[ERROR] $Message" -ForegroundColor Red }
        "FAIL"  { Write-Host "[FAIL]  $Message" -ForegroundColor Red }
        "DONE"  { Write-Host "[DONE]  $Message" -ForegroundColor Green }
    }
}

function Resolve-Java21 {
    $JDK21_PATHS = @(
        "D:\Program Files\Microsoft\jdk-21.0.10.7-hotspot",
        "${env:ProgramFiles}\Microsoft\jdk-21.0.10.7-hotspot"
    )

    # First check JAVA_HOME
    if ($env:JAVA_HOME -and (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
        $ver = & "$env:JAVA_HOME\bin\java.exe" -version 2>&1 | ForEach-Object { $_.ToString() } | Out-String
        if ($ver -match 'version "21') {
            return "$env:JAVA_HOME\bin\java.exe"
        }
    }
    # Then search known paths
    foreach ($p in $JDK21_PATHS) {
        if ((Test-Path "$p\bin\java.exe")) {
            $ver = & "$p\bin\java.exe" -version 2>&1 | ForEach-Object { $_.ToString() } | Out-String
            if ($ver -match 'version "21') {
                return "$p\bin\java.exe"
            }
        }
    }
    return $null
}

# ==============================================================================
# Gateway functions
# ==============================================================================

function Stop-Gateway {
    Write-Status "INFO" "Stopping gateway on port $GATEWAY_PORT..."

    # Kill goosed processes
    Get-Process -Name "goosed" -ErrorAction SilentlyContinue | Stop-Process -Force

    # Kill Java process on gateway port
    $conns = netstat -ano | Select-String ":$GATEWAY_PORT " | Select-String "LISTENING"
    foreach ($conn in $conns) {
        $procId = ($conn -split '\s+')[-1]
        Write-Status "INFO" "Killing PID $procId on port $GATEWAY_PORT..."
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Seconds 3
    Write-Status "OK" "Gateway stopped"
}

function Start-GatewayService {
    param([string]$JavaCmd)

    Write-Status "INFO" "Starting gateway at ${GATEWAY_SCHEME}://0.0.0.0:${GATEWAY_PORT}..."

    $JAR = "$ROOT_DIR\gateway\gateway-service\target\gateway-service.jar"
    $LIB_DIR = "$ROOT_DIR\gateway\gateway-service\target\lib"
    $LOG4J_CONFIG = "$ROOT_DIR\gateway\gateway-service\target\resources\log4j2.xml"

    if (-not (Test-Path $JAR)) {
        Write-Status "ERROR" "JAR not found: $JAR"
        Write-Status "ERROR" "Run 'mvn package -DskipTests' in gateway/ first"
        exit 1
    }

    $LOG_DIR = "$ROOT_DIR\gateway\logs"
    if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR | Out-Null }

    $javaOpts = @(
        "-Dloader.path=$LIB_DIR",
        "-Dserver.port=$GATEWAY_PORT",
        "-Dserver.address=0.0.0.0",
        "-Dgateway.secret-key=$GATEWAY_SECRET_KEY",
        "-Dgateway.cors-origin=*",
        "-Dgateway.goosed-bin=goosed",
        "-Dgateway.goose-tls=false",
        "-Dgateway.paths.project-root=$ROOT_DIR",
        "-Dgateway.paths.agents-dir=agents",
        "-Dgateway.paths.users-dir=users",
        "-Dgateway.idle.timeout-minutes=15",
        "-Dgateway.idle.check-interval-ms=60000",
        "-Dgateway.sse.first-byte-timeout-sec=120",
        "-Dgateway.sse.idle-timeout-sec=300",
        "-Dgateway.sse.max-duration-sec=600",
        "-Dgateway.upload.max-file-size-mb=50",
        "-Dgateway.upload.max-image-size-mb=20",
        "-Dgateway.limits.max-instances-per-user=20",
        "-Dgateway.limits.max-instances-global=200",
        "-Dgateway.prewarm.enabled=true",
        "-Dgateway.prewarm.default-agent-id=universal-agent",
        "-Dgateway.api.password=test123",
        "-Dgateway.office-preview.enabled=true",
        "-Dgateway.office-preview.onlyoffice-url=http://127.0.0.1:8080",
        "-Dgateway.office-preview.file-base-url=http://host.docker.internal:$GATEWAY_PORT",
        "-Dgateway.credential-encryption-key=changeit-changeit-changeit-32ch",
        "-Dgateway.remote-execution.default-timeout=30",
        "-Dgateway.remote-execution.max-timeout=120"
    )

    if (Test-Path $LOG4J_CONFIG) {
        $javaOpts += "-Dlogging.config=file:$LOG4J_CONFIG"
    }

    $javaArgs = ($javaOpts -join " ") + " -jar `"$JAR`""
    $gwLog = "$LOG_DIR\gateway.log"
    $gwErrLog = "$LOG_DIR\gateway-err.log"

    Start-Process -FilePath $JavaCmd -ArgumentList $javaArgs `
        -WorkingDirectory "$ROOT_DIR\gateway" `
        -WindowStyle Minimized `
        -RedirectStandardOutput $gwLog `
        -RedirectStandardError $gwErrLog

    # Wait for health check - accept any HTTP response (even 4xx) as "up"
    Write-Status "INFO" "Waiting for gateway to become healthy (up to 60s)..."
    $healthy = $false
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $null = Invoke-WebRequest -Uri "${GATEWAY_SCHEME}://127.0.0.1:${GATEWAY_PORT}/ops-gateway/status" `
                -Headers @{ "x-secret-key" = $GATEWAY_SECRET_KEY } `
                -TimeoutSec 2 -UseBasicParsing
            $healthy = $true
            Write-Status "OK" "Gateway is healthy"
            break
        } catch {
            # If the error message contains a status code, the server is up
            if ($_.Exception.Message -match '\b4\d{2}\b' -or $_.Exception.Message -match 'StatusCode') {
                $healthy = $true
                Write-Status "OK" "Gateway is healthy"
                break
            }
            # Connection failure - server not ready yet
            Start-Sleep -Seconds 1
        }
    }

    if (-not $healthy) {
        Write-Status "FAIL" "Gateway health check failed after 60s"
        Write-Status "FAIL" "Check log: $LOG_DIR\gateway.log"
        exit 1
    }
}

# ==============================================================================
# Build functions
# ==============================================================================

function Build-Gateway {
    Write-Status "INFO" "Building gateway (Maven)..."

    $JAVA_HOME = Split-Path -Parent (Split-Path -Parent $JAVA_CMD)

    Push-Location "$ROOT_DIR\gateway"
    $env:JAVA_HOME = $JAVA_HOME
    $mvnArgs = "clean package -pl gateway-service -am -Dmaven.test.skip=true -q"
    & cmd.exe /c "mvn $mvnArgs" 2>&1 | ForEach-Object { Write-Host $_ }
    $exitCode = $LASTEXITCODE
    Pop-Location

    if ($exitCode -ne 0) {
        Write-Status "FAIL" "Gateway build failed (exit code $exitCode)"
        Write-Status "INFO"  "Try manually: cd gateway && set JAVA_HOME=$JAVA_HOME && mvn package -Dmaven.test.skip=true"
        exit 1
    }

    $JAR = "$ROOT_DIR\gateway\gateway-service\target\gateway-service.jar"
    if (-not (Test-Path $JAR)) {
        Write-Status "FAIL" "Build succeeded but JAR not found: $JAR"
        exit 1
    }

    Write-Status "OK" "Gateway build complete"
}

function Build-SopExecutor {
    Write-Status "INFO" "Building sop-executor (TypeScript)..."

    $SOP_DIR = "$ROOT_DIR\gateway\agents\qos-agent\config\mcp\sop-executor"
    if (-not (Test-Path "$SOP_DIR\node_modules")) {
        Write-Status "INFO" "Installing sop-executor npm dependencies..."
        Push-Location $SOP_DIR
        & npm.cmd install 2>&1 | ForEach-Object { Write-Host $_ }
        $exitCode = $LASTEXITCODE
        Pop-Location
        if ($exitCode -ne 0) {
            Write-Status "FAIL" "sop-executor npm install failed"
            exit 1
        }
    }

    Push-Location $SOP_DIR
    & npm.cmd run build 2>&1 | ForEach-Object { Write-Host $_ }
    $exitCode = $LASTEXITCODE
    Pop-Location

    if ($exitCode -ne 0) {
        Write-Status "FAIL" "sop-executor build failed"
        exit 1
    }

    Write-Status "OK" "sop-executor build complete"
}

function Build-Webapp {
    Write-Status "INFO" "Building webapp (Vite)..."

    $WEBAPP_DIR = "$ROOT_DIR\web-app"
    if (-not (Test-Path "$WEBAPP_DIR\node_modules")) {
        Write-Status "INFO" "Installing npm dependencies..."
        Push-Location $WEBAPP_DIR
        & npm.cmd install 2>&1 | ForEach-Object { Write-Host $_ }
        $exitCode = $LASTEXITCODE
        Pop-Location
        if ($exitCode -ne 0) {
            Write-Status "FAIL" "npm install failed"
            exit 1
        }
    }

    Push-Location $WEBAPP_DIR
    & npm.cmd run build 2>&1 | ForEach-Object { Write-Host $_ }
    $exitCode = $LASTEXITCODE
    Pop-Location

    if ($exitCode -ne 0) {
        Write-Status "FAIL" "Webapp build failed"
        exit 1
    }

    Write-Status "OK" "Webapp build complete"
}

# ==============================================================================
# Knowledge-service functions
# ==============================================================================

function Stop-KnowledgeService {
    Write-Status "INFO" "Stopping knowledge-service on port $KNOWLEDGE_PORT..."

    $conns = netstat -ano | Select-String ":$KNOWLEDGE_PORT " | Select-String "LISTENING"
    foreach ($conn in $conns) {
        $procId = ($conn -split '\s+')[-1]
        Write-Status "INFO" "Killing PID $procId on port $KNOWLEDGE_PORT..."
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Seconds 3
    Write-Status "OK" "Knowledge-service stopped"
}

function Build-KnowledgeService {
    Write-Status "INFO" "Building knowledge-service (Maven)..."

    $JAVA_HOME = Split-Path -Parent (Split-Path -Parent $JAVA_CMD)
    $KS_DIR = "$ROOT_DIR\knowledge-service"

    Push-Location $KS_DIR
    $env:JAVA_HOME = $JAVA_HOME
    & cmd.exe /c "mvn clean package -DskipTests -q" 2>&1 | ForEach-Object { Write-Host $_ }
    $exitCode = $LASTEXITCODE
    Pop-Location

    if ($exitCode -ne 0) {
        Write-Status "FAIL" "Knowledge-service build failed (exit code $exitCode)"
        Write-Status "INFO"  "Try manually: cd knowledge-service && set JAVA_HOME=$JAVA_HOME && mvn package -DskipTests"
        exit 1
    }

    $JAR = "$KS_DIR\target\knowledge-service.jar"
    if (-not (Test-Path $JAR)) {
        Write-Status "FAIL" "Build succeeded but JAR not found: $JAR"
        exit 1
    }

    Write-Status "OK" "Knowledge-service build complete"
}

function Start-KnowledgeService {
    param([string]$JavaCmd)

    Write-Status "INFO" "Starting knowledge-service at http://127.0.0.1:${KNOWLEDGE_PORT}..."

    $JAR = "$ROOT_DIR\knowledge-service\target\knowledge-service.jar"

    if (-not (Test-Path $JAR)) {
        Write-Status "ERROR" "JAR not found: $JAR"
        Write-Status "ERROR" "Run 'mvn package -DskipTests' in knowledge-service/ first"
        exit 1
    }

    $LOG_DIR = "$ROOT_DIR\knowledge-service\logs"
    if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR | Out-Null }

    $javaOpts = @(
        "-Dserver.port=$KNOWLEDGE_PORT",
        "-jar `"$JAR`""
    )

    $javaArgs = $javaOpts -join " "
    $ksLog = "$LOG_DIR\knowledge-service.log"
    $ksErrLog = "$LOG_DIR\knowledge-service-err.log"

    $env:CONFIG_PATH = "$ROOT_DIR\knowledge-service\config.yaml"

    Start-Process -FilePath $JavaCmd -ArgumentList $javaArgs `
        -WorkingDirectory "$ROOT_DIR\knowledge-service" `
        -WindowStyle Minimized `
        -RedirectStandardOutput $ksLog `
        -RedirectStandardError $ksErrLog

    # Wait for health check - needs longer timeout due to Lucene index rebuild
    Write-Status "INFO" "Waiting for knowledge-service to become healthy (up to 60s)..."
    $healthy = $false
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $null = Invoke-WebRequest -Uri "http://127.0.0.1:${KNOWLEDGE_PORT}/actuator/health" `
                -TimeoutSec 2 -UseBasicParsing
            $healthy = $true
            Write-Status "OK" "Knowledge-service is healthy"
            break
        } catch {
            Start-Sleep -Seconds 1
        }
    }

    if (-not $healthy) {
        Write-Status "WARN" "Knowledge-service health check failed after 60s"
        Write-Status "WARN" "Check log: $LOG_DIR\knowledge-service.log"
    }
}

# ==============================================================================
# Business-intelligence functions
# ==============================================================================

function Stop-BIService {
    Write-Status "INFO" "Stopping business-intelligence on port $BI_PORT..."

    $conns = netstat -ano | Select-String ":$BI_PORT " | Select-String "LISTENING"
    foreach ($conn in $conns) {
        $procId = ($conn -split '\s+')[-1]
        Write-Status "INFO" "Killing PID $procId on port $BI_PORT..."
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Seconds 3
    Write-Status "OK" "Business-intelligence stopped"
}

function Build-BIService {
    Write-Status "INFO" "Building business-intelligence (Maven)..."

    $JAVA_HOME = Split-Path -Parent (Split-Path -Parent $JAVA_CMD)
    $BI_DIR = "$ROOT_DIR\business-intelligence"

    Push-Location $BI_DIR
    $env:JAVA_HOME = $JAVA_HOME
    & cmd.exe /c "mvn clean package -DskipTests -q" 2>&1 | ForEach-Object { Write-Host $_ }
    $exitCode = $LASTEXITCODE
    Pop-Location

    if ($exitCode -ne 0) {
        Write-Status "FAIL" "Business-intelligence build failed (exit code $exitCode)"
        Write-Status "INFO"  "Try manually: cd business-intelligence && set JAVA_HOME=$JAVA_HOME && mvn package -DskipTests"
        exit 1
    }

    $JAR = "$BI_DIR\target\business-intelligence.jar"
    if (-not (Test-Path $JAR)) {
        Write-Status "FAIL" "Build succeeded but JAR not found: $JAR"
        exit 1
    }

    Write-Status "OK" "Business-intelligence build complete"
}

function Start-BIService {
    param([string]$JavaCmd)

    Write-Status "INFO" "Starting business-intelligence at http://127.0.0.1:${BI_PORT}..."

    $JAR = "$ROOT_DIR\business-intelligence\target\business-intelligence.jar"

    if (-not (Test-Path $JAR)) {
        Write-Status "ERROR" "JAR not found: $JAR"
        Write-Status "ERROR" "Run 'mvn package -DskipTests' in business-intelligence/ first"
        exit 1
    }

    $LOG_DIR = "$ROOT_DIR\business-intelligence\logs"
    if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR | Out-Null }

    $javaOpts = @(
        "-Dserver.port=$BI_PORT",
        "-jar `"$JAR`""
    )

    $javaArgs = $javaOpts -join " "
    $biLog = "$LOG_DIR\business-intelligence.log"
    $biErrLog = "$LOG_DIR\business-intelligence-err.log"

    $env:CONFIG_PATH = "$ROOT_DIR\business-intelligence\config.yaml"

    Start-Process -FilePath $JavaCmd -ArgumentList $javaArgs `
        -WorkingDirectory "$ROOT_DIR\business-intelligence" `
        -WindowStyle Minimized `
        -RedirectStandardOutput $biLog `
        -RedirectStandardError $biErrLog

    Write-Status "INFO" "Waiting for business-intelligence to become healthy (up to 30s)..."
    $healthy = $false
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $null = Invoke-WebRequest -Uri "http://127.0.0.1:${BI_PORT}/actuator/health" `
                -TimeoutSec 2 -UseBasicParsing
            $healthy = $true
            Write-Status "OK" "Business-intelligence is healthy"
            break
        } catch {
            Start-Sleep -Seconds 1
        }
    }

    if (-not $healthy) {
        Write-Status "WARN" "Business-intelligence health check failed after 30s"
        Write-Status "WARN" "Check log: $LOG_DIR\business-intelligence.log"
    }
}

# ==============================================================================
# Control-center functions
# ==============================================================================

function Stop-ControlCenter {
    Write-Status "INFO" "Stopping control-center on port $CONTROL_PORT..."

    $conns = netstat -ano | Select-String ":$CONTROL_PORT " | Select-String "LISTENING"
    foreach ($conn in $conns) {
        $procId = ($conn -split '\s+')[-1]
        Write-Status "INFO" "Killing PID $procId on port $CONTROL_PORT..."
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Seconds 3
    Write-Status "OK" "Control-center stopped"
}

function Build-ControlCenter {
    Write-Status "INFO" "Building control-center (Maven)..."

    $JAVA_HOME = Split-Path -Parent (Split-Path -Parent $JAVA_CMD)
    $CC_DIR = "$ROOT_DIR\control-center"

    Push-Location $CC_DIR
    $env:JAVA_HOME = $JAVA_HOME
    & cmd.exe /c "mvn clean package -DskipTests -q" 2>&1 | ForEach-Object { Write-Host $_ }
    $exitCode = $LASTEXITCODE
    Pop-Location

    if ($exitCode -ne 0) {
        Write-Status "FAIL" "Control-center build failed (exit code $exitCode)"
        Write-Status "INFO"  "Try manually: cd control-center && set JAVA_HOME=$JAVA_HOME && mvn package -DskipTests"
        exit 1
    }

    $JAR = "$CC_DIR\target\control-center.jar"
    if (-not (Test-Path $JAR)) {
        Write-Status "FAIL" "Build succeeded but JAR not found: $JAR"
        exit 1
    }

    Write-Status "OK" "Control-center build complete"
}

function Start-ControlCenter {
    param([string]$JavaCmd)

    Write-Status "INFO" "Starting control-center at http://127.0.0.1:${CONTROL_PORT}..."

    $JAR = "$ROOT_DIR\control-center\target\control-center.jar"

    if (-not (Test-Path $JAR)) {
        Write-Status "ERROR" "JAR not found: $JAR"
        Write-Status "ERROR" "Run 'mvn package -DskipTests' in control-center/ first"
        exit 1
    }

    $LOG_DIR = "$ROOT_DIR\control-center\logs"
    if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR | Out-Null }

    $javaOpts = @(
        "-Dserver.port=$CONTROL_PORT",
        "-jar `"$JAR`""
    )

    $javaArgs = $javaOpts -join " "
    $ccLog = "$LOG_DIR\control-center.log"
    $ccErrLog = "$LOG_DIR\control-center-err.log"

    $env:CONFIG_PATH = "$ROOT_DIR\control-center\config.yaml"

    Start-Process -FilePath $JavaCmd -ArgumentList $javaArgs `
        -WorkingDirectory "$ROOT_DIR\control-center" `
        -WindowStyle Minimized `
        -RedirectStandardOutput $ccLog `
        -RedirectStandardError $ccErrLog

    Write-Status "INFO" "Waiting for control-center to become healthy (up to 30s)..."
    $healthy = $false
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $null = Invoke-WebRequest -Uri "http://127.0.0.1:${CONTROL_PORT}/actuator/health" `
                -TimeoutSec 2 -UseBasicParsing
            $healthy = $true
            Write-Status "OK" "Control-center is healthy"
            break
        } catch {
            Start-Sleep -Seconds 1
        }
    }

    if (-not $healthy) {
        Write-Status "WARN" "Control-center health check failed after 30s"
        Write-Status "WARN" "Check log: $LOG_DIR\control-center.log"
    }
}

# ==============================================================================
# Webapp functions
# ==============================================================================

function Stop-Webapp {
    Write-Status "INFO" "Stopping webapp on port $WEBAPP_PORT..."

    $conns = netstat -ano | Select-String ":$WEBAPP_PORT " | Select-String "LISTENING"
    foreach ($conn in $conns) {
        $procId = ($conn -split '\s+')[-1]
        Write-Status "INFO" "Killing PID $procId on port $WEBAPP_PORT..."
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Seconds 2
    Write-Status "OK" "Webapp stopped"
}

function Start-WebappService {
    Write-Status "INFO" "Starting webapp (Vite dev server)..."
    $WEBAPP_DIR = "$ROOT_DIR\web-app"

    if (-not (Test-Path "$WEBAPP_DIR\node_modules")) {
        Write-Status "ERROR" "node_modules not found. Run 'npm install' in web-app/ first"
        exit 1
    }

    Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$WEBAPP_DIR`" && npm run dev" -WindowStyle Minimized
    Write-Status "OK" "Webapp started (Vite dev server at http://localhost:$WEBAPP_PORT)"
}

# ==============================================================================
# Main
# ==============================================================================

Write-Host ""
Write-Host "============================================"
Write-Host "  ops-factory service restart (Windows)"
Write-Host "============================================"
Write-Host ""

# Resolve Java 21
$JAVA_CMD = Resolve-Java21
if (-not $JAVA_CMD) {
    Write-Status "ERROR" "JDK 21 not found. Set JAVA_HOME or install JDK 21."
    exit 1
}
Write-Status "INFO" "Using Java: $JAVA_CMD"

switch ($Component.ToLower()) {
    "gateway" {
        if (-not $NoBuild) { Build-Gateway }
        if (-not $NoBuild) { Build-SopExecutor }
        Stop-Gateway
        Start-GatewayService -JavaCmd $JAVA_CMD
    }
    "webapp" {
        if (-not $NoBuild) { Build-Webapp }
        Stop-Webapp
        Start-WebappService
    }
    "knowledge" {
        if (-not $NoBuild) { Build-KnowledgeService }
        Stop-KnowledgeService
        Start-KnowledgeService -JavaCmd $JAVA_CMD
    }
    "bi" {
        if (-not $NoBuild) { Build-BIService }
        Stop-BIService
        Start-BIService -JavaCmd $JAVA_CMD
    }
    "control" {
        if (-not $NoBuild) { Build-ControlCenter }
        Stop-ControlCenter
        Start-ControlCenter -JavaCmd $JAVA_CMD
    }
    "all" {
        if (-not $NoBuild) { Build-Gateway }
        if (-not $NoBuild) { Build-SopExecutor }
        if (-not $NoBuild) { Build-KnowledgeService }
        if (-not $NoBuild) { Build-BIService }
        if (-not $NoBuild) { Build-ControlCenter }
        if (-not $NoBuild) { Build-Webapp }
        Stop-Webapp
        Stop-ControlCenter
        Stop-BIService
        Stop-KnowledgeService
        Stop-Gateway
        Start-GatewayService -JavaCmd $JAVA_CMD
        Start-KnowledgeService -JavaCmd $JAVA_CMD
        Start-BIService -JavaCmd $JAVA_CMD
        Start-ControlCenter -JavaCmd $JAVA_CMD
        Start-WebappService
    }
    default {
        Write-Status "ERROR" "Unknown component: $Component"
        Write-Host "Usage: $([System.IO.Path]::GetFileName($PSCommandPath)) [gateway|webapp|knowledge|bi|control|all] [-NoBuild]"
        exit 1
    }
}

Write-Host ""
Write-Status "DONE" "Restart complete ($Component)"
Write-Host ""
