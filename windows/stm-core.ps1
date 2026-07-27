param(
    [ValidateSet("open", "start", "stop", "restart", "status", "token")]
    [string]$Action = "open"
)

$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent $PSScriptRoot
$DataDir = Join-Path $env:LOCALAPPDATA "STM-Core"
$ConfigDir = Join-Path $DataDir "config"
$DatabaseDir = Join-Path $DataDir "database"
$LogsDir = Join-Path $DataDir "logs"

$EnvFile = Join-Path $DataDir ".env"
$ConfigFile = Join-Path $ConfigDir "servers.json"
$DatabaseFile = Join-Path $DatabaseDir "stm.db"
$PidFile = Join-Path $DataDir "stm-core.pid"

$NodeExe = Join-Path $AppDir "runtime\node.exe"
$EntryPoint = Join-Path $AppDir "src\index.js"

$HealthUrl = "http://127.0.0.1:3000/api/v1/community/health"
$DashboardUrl = "http://127.0.0.1:3000/community/"

function Initialize-STMCore {
    New-Item -ItemType Directory -Force -Path `
        $DataDir, $ConfigDir, $DatabaseDir, $LogsDir | Out-Null

    if (-not (Test-Path $ConfigFile)) {
        Copy-Item (Join-Path $AppDir "config\servers.json") $ConfigFile
    }

    if (-not (Test-Path $EnvFile)) {
        $bytes = New-Object byte[] 32
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $rng.GetBytes($bytes)
        $rng.Dispose()

        $token = -join ($bytes | ForEach-Object { $_.ToString("x2") })
        $utf8 = New-Object System.Text.UTF8Encoding($false)

        [System.IO.File]::WriteAllText(
            $EnvFile,
            "STM_ADMIN_TOKEN=$token`r`n",
            $utf8
        )
    }
}

function Test-STMCore {
    try {
        $health = Invoke-RestMethod `
            -Uri $HealthUrl `
            -TimeoutSec 2 `
            -UseBasicParsing

        return $health.success -eq $true
    }
    catch {
        return $false
    }
}

function Start-STMCore {
    Initialize-STMCore

    if (Test-STMCore) {
        return
    }

    if (-not (Test-Path $NodeExe)) {
        throw "Nie znaleziono srodowiska Node.js: $NodeExe"
    }

    $env:STM_ENV_PATH = $EnvFile
    $env:STM_CONFIG_PATH = $ConfigFile
    $env:STM_DATABASE_PATH = $DatabaseFile
    $env:STM_HOST = "127.0.0.1"
    $env:STM_PORT = "3000"

    $stdoutLog = Join-Path $LogsDir "stm-core.log"
    $stderrLog = Join-Path $LogsDir "stm-core-error.log"

    $process = Start-Process `
        -FilePath $NodeExe `
        -ArgumentList "`"$EntryPoint`"" `
        -WorkingDirectory $AppDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -PassThru

    Set-Content -Path $PidFile -Value $process.Id -Encoding ASCII

    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Seconds 1

        if (Test-STMCore) {
            return
        }

        if ($process.HasExited) {
            throw "STM Core zakonczyl dzialanie. Sprawdz: $stderrLog"
        }
    }

    throw "STM Core nie odpowiedzial w ciagu 30 sekund."
}

function Stop-STMCore {
    if (Test-Path $PidFile) {
        $stmProcessId = Get-Content $PidFile -ErrorAction SilentlyContinue

        if ($stmProcessId) {
            Stop-Process -Id $stmProcessId -Force -ErrorAction SilentlyContinue
        }

        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }
}

switch ($Action) {
    "open" {
        Start-STMCore
        Start-Process $DashboardUrl
    }

    "start" {
        Start-STMCore
    }

    "stop" {
        Stop-STMCore
    }

    "restart" {
        Stop-STMCore
        Start-Sleep -Seconds 1
        Start-STMCore
    }

    "status" {
        if (Test-STMCore) {
            Invoke-RestMethod -Uri $HealthUrl -UseBasicParsing |
                ConvertTo-Json
        }
        else {
            Write-Output "STM Core nie dziala."
        }
    }

    "token" {
        Initialize-STMCore
        (Get-Content $EnvFile |
            Where-Object { $_ -like "STM_ADMIN_TOKEN=*" }) `
            -replace "^STM_ADMIN_TOKEN=", ""
    }
}
