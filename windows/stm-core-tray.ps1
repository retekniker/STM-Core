param(
    [switch]$OpenDashboard,
    [switch]$Stop
)

$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent $PSScriptRoot
$DataDir = Join-Path $env:LOCALAPPDATA "STM-Core"
$LogsDir = Join-Path $DataDir "logs"
$TrayPidFile = Join-Path $DataDir "stm-core-tray.pid"
$ControllerScript = Join-Path $PSScriptRoot "stm-core.ps1"

$HealthUrl = "http://127.0.0.1:3000/api/v1/community/health"
$DashboardUrl = "http://127.0.0.1:3000/community/"
$PowerShellExe = Join-Path $env:SystemRoot `
    "System32\WindowsPowerShell\v1.0\powershell.exe"

$RunRegistryPath = `
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$RunValueName = "STM Core"
$TrayLauncher = Join-Path $PSScriptRoot "stm-core-tray.vbs"
$WScriptExe = Join-Path $env:SystemRoot "System32\wscript.exe"
$RunCommand = "`"$WScriptExe`" `"$TrayLauncher`""

function Invoke-STMCore {
    param(
        [ValidateSet("open", "start", "stop", "restart")]
        [string]$Action
    )

    $arguments = `
        "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden " +
        "-File `"$ControllerScript`" $Action"

    Start-Process `
        -FilePath $PowerShellExe `
        -ArgumentList $arguments `
        -WindowStyle Hidden | Out-Null
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

function Test-StartWithWindows {
    try {
        $runValue = Get-ItemPropertyValue `
            -Path $RunRegistryPath `
            -Name $RunValueName `
            -ErrorAction Stop

        return -not [string]::IsNullOrWhiteSpace($runValue)
    }
    catch {
        return $false
    }
}

function Set-StartWithWindows {
    param(
        [bool]$Enabled
    )

    if ($Enabled) {
        New-Item `
            -Path $RunRegistryPath `
            -Force | Out-Null

        Set-ItemProperty `
            -Path $RunRegistryPath `
            -Name $RunValueName `
            -Value $RunCommand
    }
    else {
        Remove-ItemProperty `
            -Path $RunRegistryPath `
            -Name $RunValueName `
            -Force `
            -ErrorAction SilentlyContinue
    }
}

function Stop-ExistingTray {
    if (-not (Test-Path $TrayPidFile)) {
        return
    }

    $trayProcessId = Get-Content `
        -Path $TrayPidFile `
        -ErrorAction SilentlyContinue |
        Select-Object -First 1

    if ($trayProcessId -and $trayProcessId -match "^\d+$") {
        $processInfo = Get-CimInstance `
            -ClassName Win32_Process `
            -Filter "ProcessId = $trayProcessId" `
            -ErrorAction SilentlyContinue

        if (
            $processInfo -and
            $processInfo.CommandLine -like "*stm-core-tray.ps1*"
        ) {
            Stop-Process `
                -Id ([int]$trayProcessId) `
                -Force `
                -ErrorAction SilentlyContinue
        }
    }

    Remove-Item $TrayPidFile -Force -ErrorAction SilentlyContinue
}

if ($Stop) {
    Stop-ExistingTray
    exit 0
}

New-Item -ItemType Directory -Force -Path $DataDir, $LogsDir |
    Out-Null

$createdNew = $false
$mutexName = "Local\STMCoreTray-$($env:USERNAME)"
$mutex = [System.Threading.Mutex]::new(
    $true,
    $mutexName,
    [ref]$createdNew
)

if (-not $createdNew) {
    if ($OpenDashboard) {
        Invoke-STMCore "open"
    }

    $mutex.Dispose()
    exit 0
}

Set-Content `
    -Path $TrayPidFile `
    -Value $PID `
    -Encoding ASCII

$notifyIcon = $null
$timer = $null

try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    [System.Windows.Forms.Application]::EnableVisualStyles()

    $contextMenu = New-Object System.Windows.Forms.ContextMenuStrip

    $openItem = $contextMenu.Items.Add("Open Dashboard")
    $contextMenu.Items.Add(
        (New-Object System.Windows.Forms.ToolStripSeparator)
    ) | Out-Null

    $startItem = $contextMenu.Items.Add("Start STM Core")
    $stopItem = $contextMenu.Items.Add("Stop STM Core")
    $restartItem = $contextMenu.Items.Add("Restart STM Core")
    $startWithWindowsItem = `
        $contextMenu.Items.Add("Start with Windows")
    $startWithWindowsItem.CheckOnClick = $false

    $contextMenu.Items.Add(
        (New-Object System.Windows.Forms.ToolStripSeparator)
    ) | Out-Null

    $statusItem = $contextMenu.Items.Add("Status: Checking...")
    $statusItem.Enabled = $false

    $contextMenu.Items.Add(
        (New-Object System.Windows.Forms.ToolStripSeparator)
    ) | Out-Null

    $exitItem = $contextMenu.Items.Add("Exit STM Core")

    $notifyIcon = New-Object System.Windows.Forms.NotifyIcon
    $notifyIcon.ContextMenuStrip = $contextMenu
    $notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
    $notifyIcon.Text = "STM Core - Checking status"
    $notifyIcon.Visible = $true

    function Update-TrayStatus {
        $running = Test-STMCore
        $startWithWindowsItem.Checked = Test-StartWithWindows

        if ($running) {
            $notifyIcon.Icon = [System.Drawing.SystemIcons]::Information
            $notifyIcon.Text = "STM Core - Running"
            $statusItem.Text = "Status: Running"
            $startItem.Enabled = $false
            $stopItem.Enabled = $true
            $restartItem.Enabled = $true
        }
        else {
            $notifyIcon.Icon = [System.Drawing.SystemIcons]::Warning
            $notifyIcon.Text = "STM Core - Stopped"
            $statusItem.Text = "Status: Stopped"
            $startItem.Enabled = $true
            $stopItem.Enabled = $false
            $restartItem.Enabled = $false
        }
    }

    $openItem.Add_Click({
        Invoke-STMCore "open"
    })

    $startItem.Add_Click({
        Invoke-STMCore "start"
    })

    $stopItem.Add_Click({
        Invoke-STMCore "stop"
    })

    $restartItem.Add_Click({
        Invoke-STMCore "restart"
    })

    $startWithWindowsItem.Add_Click({
        $enabled = -not (Test-StartWithWindows)
        Set-StartWithWindows -Enabled $enabled
        $startWithWindowsItem.Checked = $enabled
    })

    $exitItem.Add_Click({
        Invoke-STMCore "stop"
        $timer.Stop()
        $notifyIcon.Visible = $false
        [System.Windows.Forms.Application]::Exit()
    })

    $notifyIcon.Add_MouseUp({
        param($sender, $eventArgs)

        if (
            $eventArgs.Button -eq
            [System.Windows.Forms.MouseButtons]::Left
        ) {
            Invoke-STMCore "open"
        }
    })

    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 5000
    $timer.Add_Tick({
        Update-TrayStatus
    })

    Update-TrayStatus
    $timer.Start()

    if ($OpenDashboard) {
        Invoke-STMCore "open"
    }
    else {
        Invoke-STMCore "start"
    }

    [System.Windows.Forms.Application]::Run()
}
catch {
    Add-Content `
        -Path (Join-Path $LogsDir "stm-core-tray-error.log") `
        -Value "[$(Get-Date -Format o)] $($_ | Out-String)"

    throw
}
finally {
    if ($timer) {
        $timer.Stop()
        $timer.Dispose()
    }

    if ($notifyIcon) {
        $notifyIcon.Visible = $false
        $notifyIcon.Dispose()
    }

    if (Test-Path $TrayPidFile) {
        $storedProcessId = Get-Content `
            -Path $TrayPidFile `
            -ErrorAction SilentlyContinue |
            Select-Object -First 1

        if ("$storedProcessId" -eq "$PID") {
            Remove-Item `
                -Path $TrayPidFile `
                -Force `
                -ErrorAction SilentlyContinue
        }
    }

    if ($createdNew) {
        $mutex.ReleaseMutex()
    }

    $mutex.Dispose()
}
