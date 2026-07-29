#ifndef MyAppVersion
  #define MyAppVersion "0.8.12"
#endif

#define MyAppName "STM Core"
#define MyAppPublisher "retekniker"
#define MyAppURL "https://github.com/retekniker/STM-Core"

[Setup]
AppId={{9B17847D-4029-46ED-9A6C-40B18C70C56E}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\STM Core
DefaultGroupName=STM Core
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=output
OutputBaseFilename=STM-Core-Setup-{#MyAppVersion}-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=STM Core
SetupLogging=yes

[Tasks]
Name: "desktopicon"; Description: "Utwórz skrót na pulpicie"; GroupDescription: "Dodatkowe skróty:"; Flags: unchecked

[Files]
Source: "dist\STM-Core\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\STM Core"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\windows\stm-core-tray.vbs"" -OpenDashboard"; WorkingDir: "{app}"
Name: "{autodesktop}\STM Core"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\windows\stm-core-tray.vbs"" -OpenDashboard"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "STM Core"; ValueData: """{sys}\wscript.exe"" ""{app}\windows\stm-core-tray.vbs"""; Flags: uninsdeletevalue

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\windows\stm-core-tray.vbs"" -OpenDashboard"; Description: "Uruchom STM Core"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\windows\stm-core-tray.ps1"" -Stop"; Flags: runhidden waituntilterminated
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\windows\stm-core.ps1"" stop"; Flags: runhidden waituntilterminated
