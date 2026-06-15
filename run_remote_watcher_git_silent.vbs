Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
bat = fso.BuildPath(base, "run_remote_watcher_git.bat")
shell.Run Chr(34) & bat & Chr(34), 0, False
