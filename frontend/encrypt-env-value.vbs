Option Explicit

Const DEFAULT_KEY = "msc_aes256_env_key_2026_q1_rotate_in_prod"
Const ENV_VALUE_MARKER = "__ENV__::"
Const ENV_PREFIX = "enc:v1:"

Dim shell, fso, scriptDir
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

Dim plainValue
plainValue = InputBox("Enter the raw value to encrypt for .env", "Encrypt .env value")
If IsNull(plainValue) Then
  WScript.Quit 0
End If

If plainValue = "" Then
  Dim allowEmpty
  allowEmpty = MsgBox("You entered an empty value. Encrypt empty string?", vbYesNo + vbQuestion, "Confirm empty value")
  If allowEmpty <> vbYes Then
    WScript.Quit 0
  End If
End If

Dim encryptionKey
encryptionKey = InputBox("Encryption key (leave blank to use default app key)", "Encryption key", DEFAULT_KEY)
If IsNull(encryptionKey) Then
  WScript.Quit 0
End If
If encryptionKey = "" Then
  encryptionKey = DEFAULT_KEY
End If

Dim plainPath, keyPath
plainPath = fso.BuildPath(fso.GetSpecialFolder(2), "env-plain-" & Replace(CStr(Timer), ".", "") & ".txt")
keyPath = fso.BuildPath(fso.GetSpecialFolder(2), "env-key-" & Replace(CStr(Timer), ".", "") & ".txt")

WriteTextFile plainPath, plainValue
WriteTextFile keyPath, encryptionKey

Dim cmd, execObj, encryptedValue, stderrText
cmd = "cmd /c cd /d """ & scriptDir & """ && node -e ""const fs=require('fs');const CryptoJS=require('crypto-js');const marker=process.argv[3];const prefix=process.argv[4];const plain=fs.readFileSync(process.argv[1],'utf8');const key=fs.readFileSync(process.argv[2],'utf8');const cipher=CryptoJS.AES.encrypt(marker + plain,key).toString();process.stdout.write(prefix + cipher);"" """ & plainPath & """ """ & keyPath & """ """ & ENV_VALUE_MARKER & """ """ & ENV_PREFIX & """"
Set execObj = shell.Exec(cmd)

Do While execObj.Status = 0
  WScript.Sleep 100
Loop

encryptedValue = Trim(execObj.StdOut.ReadAll())
stderrText = Trim(execObj.StdErr.ReadAll())

On Error Resume Next
If fso.FileExists(plainPath) Then fso.DeleteFile plainPath, True
If fso.FileExists(keyPath) Then fso.DeleteFile keyPath, True
On Error GoTo 0

If execObj.ExitCode <> 0 Or encryptedValue = "" Then
  MsgBox "Encryption failed." & vbCrLf & vbCrLf & stderrText, vbCritical, "Encrypt .env value"
  WScript.Quit 1
End If

CopyToClipboard encryptedValue
MsgBox "Encrypted value copied to clipboard." & vbCrLf & vbCrLf & encryptedValue, vbInformation, "Encrypt .env value"

Sub WriteTextFile(path, content)
  Dim stream
  Set stream = CreateObject("ADODB.Stream")
  stream.Type = 2
  stream.Charset = "utf-8"
  stream.Open
  stream.WriteText content
  stream.SaveToFile path, 2
  stream.Close
End Sub

Sub CopyToClipboard(value)
  Dim psCommand
  psCommand = "powershell -NoProfile -ExecutionPolicy Bypass -Command ""Set-Clipboard -Value '" & Replace(value, "'", "''") & "'"""
  shell.Run psCommand, 0, True
End Sub
