; Keeps the revelith command line (resources\cli, holding revelith.cmd and the
; extension-less revelith for Git Bash) on the installing user's PATH for the
; lifetime of the install. The value is read and written unexpanded
; (REG_EXPAND_SZ) so entries such as %USERPROFILE%\bin survive, and Explorer
; is told about the change so terminals opened afterwards see it.
; electron-builder compiles the script twice (the second pass, with
; BUILD_UNINSTALLER, only produces the uninstaller); an unreferenced function
; in either pass is a warning makensis treats as an error, hence the guards.
!include "WinMessages.nsh"
!include "StrFunc.nsh"

; electron-builder's stock CHECK_APP_RUNNING routine prompts and terminates
; the app before installing; keep this include focused on app-specific shell
; registration so the same script remains safe in installer and uninstaller.

; This installer keeps electron-builder's stock layout: a per-user install under
; %LOCALAPPDATA%\Programs\${APP_FILENAME}, which is where the other
; electron-builder apps on this machine live and update from.
;
; An earlier revision redirected $INSTDIR to a "-Local" sibling. That redirect
; never took effect: setInstallModePerUser (multiUser.nsh) re-derives $INSTDIR
; from HKCU\Software\${APP_GUID}\InstallLocation every time the install-mode
; page is left (multiUserUi.nsh), so the install landed back on the standard
; directory regardless. It also seeded the registry from preInit, which never
; ran. Removing it keeps $INSTDIR, the registry InstallLocation and electron-
; builder's own upgrade detection consistent between releases.

; Fail-safe only: an interrupted previous install can leave the uninstaller icon
; behind, and NSIS cannot overwrite a read-only file.
!macro customInit
  SetFileAttributes "$INSTDIR\uninstallerIcon.ico" NORMAL
  Delete "$INSTDIR\uninstallerIcon.ico"
!macroend

; Replace electron-builder's stock "is the app running?" check
; (allowOnlyOneInstallerInstance.nsh). That implementation asks whether ANY
; process' executable path starts with $INSTDIR and then kills every match. When
; $INSTDIR is not yet resolved the comparison matches every process on the
; machine, so the installer concludes the app is running, fails to kill
; protected processes, and loops on "cannot be closed" forever while the files
; it still has to write stay locked. Match the app executable by name instead,
; and give up after one bounded attempt so the installer can never hang.
!macro customCheckAppRunning
  nsExec::Exec `"$CmdPath" /C tasklist /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FI "USERNAME eq %USERNAME%" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
  Pop $R0
  ${if} $R0 == 0
    DetailPrint "Closing ${PRODUCT_NAME}..."
    nsExec::Exec `"$CmdPath" /C taskkill /IM "${APP_EXECUTABLE_FILENAME}" /T /FI "USERNAME eq %USERNAME%"`
    Pop $R0
    Sleep 2000
    nsExec::Exec `"$CmdPath" /C taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T /FI "USERNAME eq %USERNAME%"`
    Pop $R0
    Sleep 1500
    nsExec::Exec `"$CmdPath" /C tasklist /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FI "USERNAME eq %USERNAME%" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
    Pop $R0
    ${if} $R0 == 0
      MessageBox MB_OK|MB_ICONSTOP "${PRODUCT_NAME} is still running and could not be closed automatically. Close it, then run this installer again." /SD IDOK
      Quit
    ${endif}
  ${endif}
!macroend

!define REVELITH_PATH_MAX 7900

; Scope templates to our ProgIDs (electron-builder uses fileAssociations.name).
; A shared .ext\ShellNew would overwrite Office/WPS templates. OOXML files
; must be copied from valid packages, never created with NullFile.
!macro ReveLithRegisterShellNew EXT PROGID
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}\${PROGID}\ShellNew" "FileName" "$INSTDIR\resources\shell-new\blank.${EXT}"
!macroend

!macro ReveLithUnregisterShellNew EXT PROGID
  ; Only remove our own registration, including when uninstalling for an update.
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.${EXT}\${PROGID}\ShellNew" "FileName"
  ${If} $0 == "$INSTDIR\resources\shell-new\blank.${EXT}"
    DeleteRegKey SHELL_CONTEXT "Software\Classes\.${EXT}\${PROGID}\ShellNew"
    DeleteRegKey /ifempty SHELL_CONTEXT "Software\Classes\.${EXT}\${PROGID}"
  ${EndIf}
!macroend

; "Open with ReveLith" right-click verbs on SystemFileAssociations (never
; steals the default app). Runtime repair path for the same keys:
; src/main/win-shell-menu.ts (SHELL_MENU_EXTS must match the list below).
!macro REVELITH_ADD_SHELL_VERB EXT
  WriteRegStr SHELL_CONTEXT "Software\Classes\SystemFileAssociations\.${EXT}\shell\ReveLith" "" "Open with ReveLith"
  WriteRegStr SHELL_CONTEXT "Software\Classes\SystemFileAssociations\.${EXT}\shell\ReveLith" "Icon" "$INSTDIR\ReveLith.exe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\SystemFileAssociations\.${EXT}\shell\ReveLith\command" "" '"$INSTDIR\ReveLith.exe" "%1"'
!macroend

!macro REVELITH_REMOVE_SHELL_VERB EXT
  ; A second ReveLith installation may have replaced this verb since this
  ; instance was installed. Remove it only when the command still targets the
  ; installation being uninstalled.
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\SystemFileAssociations\.${EXT}\shell\ReveLith\command" ""
  ${If} $0 == '"$INSTDIR\ReveLith.exe" "%1"'
    DeleteRegKey SHELL_CONTEXT "Software\Classes\SystemFileAssociations\.${EXT}\shell\ReveLith"
  ${EndIf}
!macroend

!macro customInstall
  Push "$INSTDIR\resources\cli"
  Call ReveLithAddToUserPath
  !insertmacro ReveLithRegisterShellNew "docx" "Word Document"
  !insertmacro ReveLithRegisterShellNew "xlsx" "Excel Workbook"
  !insertmacro ReveLithRegisterShellNew "pptx" "PowerPoint Presentation"
  !insertmacro REVELITH_ADD_SHELL_VERB "docx"
  !insertmacro REVELITH_ADD_SHELL_VERB "xlsx"
  !insertmacro REVELITH_ADD_SHELL_VERB "xlsm"
  !insertmacro REVELITH_ADD_SHELL_VERB "xls"
  !insertmacro REVELITH_ADD_SHELL_VERB "csv"
  !insertmacro REVELITH_ADD_SHELL_VERB "tsv"
  !insertmacro REVELITH_ADD_SHELL_VERB "pptx"
  !insertmacro REVELITH_ADD_SHELL_VERB "pdf"
  !insertmacro REVELITH_ADD_SHELL_VERB "md"
  !insertmacro REVELITH_ADD_SHELL_VERB "markdown"
  !insertmacro REVELITH_ADD_SHELL_VERB "html"
  !insertmacro REVELITH_ADD_SHELL_VERB "htm"
  !insertmacro UPDATEFILEASSOC
!macroend

!macro customUnInstall
  Push "$INSTDIR\resources\cli"
  Call un.ReveLithRemoveFromUserPath
  Push $0
  !insertmacro ReveLithUnregisterShellNew "docx" "Word Document"
  !insertmacro ReveLithUnregisterShellNew "xlsx" "Excel Workbook"
  !insertmacro ReveLithUnregisterShellNew "pptx" "PowerPoint Presentation"
  !insertmacro REVELITH_REMOVE_SHELL_VERB "docx"
  !insertmacro REVELITH_REMOVE_SHELL_VERB "xlsx"
  !insertmacro REVELITH_REMOVE_SHELL_VERB "xlsm"
  !insertmacro REVELITH_REMOVE_SHELL_VERB "xls"
  !insertmacro REVELITH_REMOVE_SHELL_VERB "csv"
  !insertmacro REVELITH_REMOVE_SHELL_VERB "tsv"
  !insertmacro REVELITH_REMOVE_SHELL_VERB "pptx"
  !insertmacro REVELITH_REMOVE_SHELL_VERB "pdf"
  !insertmacro REVELITH_REMOVE_SHELL_VERB "md"
  !insertmacro REVELITH_REMOVE_SHELL_VERB "markdown"
  !insertmacro REVELITH_REMOVE_SHELL_VERB "html"
  !insertmacro REVELITH_REMOVE_SHELL_VERB "htm"
  Pop $0
  !insertmacro UPDATEFILEASSOC
!macroend

!ifndef BUILD_UNINSTALLER
${StrStr}

Function ReveLithAddToUserPath
  Exch $0 ; directory
  Push $1
  Push $2
  Push $3
  ReadRegStr $1 HKCU "Environment" "Path"
  StrLen $2 $1
  ; leave an already oversized PATH alone rather than truncate it
  IntCmp $2 ${REVELITH_PATH_MAX} done 0 done
  ${StrStr} $3 ";$1;" ";$0;"
  StrCmp $3 "" 0 done
  StrCmp $1 "" 0 +3
    StrCpy $1 "$0"
    Goto write
  StrCpy $1 "$1;$0"
write:
  WriteRegExpandStr HKCU "Environment" "Path" $1
  SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
done:
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!endif

!ifdef BUILD_UNINSTALLER
${UnStrStr}
${UnStrRep}

Function un.ReveLithRemoveFromUserPath
  Exch $0 ; directory
  Push $1
  Push $2
  ReadRegStr $1 HKCU "Environment" "Path"
  StrCmp $1 "" done
  ${UnStrStr} $2 ";$1;" ";$0;"
  StrCmp $2 "" done
  StrCpy $1 ";$1;"
  ${UnStrRep} $1 $1 ";$0;" ";"
  ; strip the sentinels added above
  StrCpy $1 $1 -1
  StrCpy $1 $1 "" 1
  WriteRegExpandStr HKCU "Environment" "Path" $1
  SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
done:
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!endif
