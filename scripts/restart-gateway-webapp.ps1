# ==============================================================================
# ops-factory Windows service restart script
#
# Usage: restart-gateway-webapp.ps1 [gateway|webapp|all]
#   gateway  - restart gateway only (default)
#   webapp   - restart webapp only
#   all      - restart both gateway and webapp
# ==============================================================================

param(
    [string]$Component = "all"
)

$ErrorActionPreference = "Continue"

# === Resolve project root ===
$ROOT_DIR = Split-Path -Parent $PSScriptRoot

# === Configuration ===
$GATEWAY_PORT = 3000
$WEBAPP_PORT = 5173
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
        Stop-Gateway
        Start-GatewayService -JavaCmd $JAVA_CMD
    }
    "webapp" {
        Stop-Webapp
        Start-WebappService
    }
    "all" {
        Stop-Webapp
        Stop-Gateway
        Start-GatewayService -JavaCmd $JAVA_CMD
        Start-WebappService
    }
    default {
        Write-Status "ERROR" "Unknown component: $Component"
        Write-Host "Usage: $([System.IO.Path]::GetFileName($PSCommandPath)) [gateway|webapp|all]"
        exit 1
    }
}

Write-Host ""
Write-Status "DONE" "Restart complete ($Component)"
Write-Host ""
