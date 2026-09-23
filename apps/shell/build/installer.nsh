; ReveLith Windows Explorer shell menu ("Open with ReveLith").
;
; Adds a right-click verb for every format the app can open, WITHOUT stealing
; the default association: fileAssociations in electron-builder.cjs owns the
; ProgIds and the default-open handling; this only adds an "Open with
; ReveLith" entry under SystemFileAssociations, which Explorer shows for the
; type regardless of which app is the default.
;
; Conventions mirror electron-builder's own FileAssociation.nsh:
; SHCTX follows SetShellVarContext, so per-user installs write HKCU and
; per-machine installs write HKLM. check64BitAndSetRegView already selected
; the 64-bit registry view before customInstall / customUnInstall run.
; ${APP_EXECUTABLE_FILENAME} is "${PRODUCT_FILENAME}.exe" (common.nsh).
;
; The verb label stays English on purpose (installer-time MUI is out of
; scope): it carries the product name, like "Open with Code".

!macro REVELITH_ADD_SHELL_VERB EXT
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.${EXT}\shell\ReveLith" "" "Open with ReveLith"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.${EXT}\shell\ReveLith" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.${EXT}\shell\ReveLith\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro REVELITH_REMOVE_SHELL_VERB EXT
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.${EXT}\shell\ReveLith"
!macroend

!macro customInstall
  !insertmacro REVELITH_ADD_SHELL_VERB "docx"
  !insertmacro REVELITH_ADD_SHELL_VERB "xlsx"
  !insertmacro REVELITH_ADD_SHELL_VERB "xls"
  !insertmacro REVELITH_ADD_SHELL_VERB "csv"
  !insertmacro REVELITH_ADD_SHELL_VERB "pptx"
  !insertmacro REVELITH_ADD_SHELL_VERB "pdf"
  !insertmacro REVELITH_ADD_SHELL_VERB "md"
  !insertmacro REVELITH_ADD_SHELL_VERB "markdown"
!macroend

!macro customUnInstall
  !insertmacro REVELITH_REMOVE_SHELL_VERB "docx"
  !insertmacro REVELITH_REMOVE_SHELL_VERB "xlsx"
  !insertmacro REVELITH_REMOVE_SHELL_VERB "xls"
  !insertmacro REVELITH_REMOVE_SHELL_VERB "csv"
  !insertmacro REVELITH_REMOVE_SHELL_VERB "pptx"
  !insertmacro REVELITH_REMOVE_SHELL_VERB "pdf"
  !insertmacro REVELITH_REMOVE_SHELL_VERB "md"
  !insertmacro REVELITH_REMOVE_SHELL_VERB "markdown"
!macroend
