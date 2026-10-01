@echo off
rem revelith launcher for the packaged Windows app: <install>\resources\cli\revelith.cmd
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\..\ReveLith.exe" "%~dp0revelith.cjs" %*
endlocal
