Option Explicit

Dim shell, fso, scriptDir, powerShellScript
Dim command, argument

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
powerShellScript = fso.BuildPath(scriptDir, "stm-core-tray.ps1")

command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Quote(powerShellScript)

For Each argument In WScript.Arguments
    command = command & " " & Quote(argument)
Next

shell.Run command, 0, False

Function Quote(value)
    Quote = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
