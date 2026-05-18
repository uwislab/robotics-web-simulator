@SETLOCAL
@IF EXIST "%~dp0\node.exe" (
  "%~dp0\node.exe"  "%~dp0\..\..\..\..\..\WorkingSoftware\nodejs\node_modules\corepack\dist\pnpx.js" %*
) ELSE (
  @SET PATHEXT=%PATHEXT:;.JS;=;%
  node  "%~dp0\..\..\..\..\..\WorkingSoftware\nodejs\node_modules\corepack\dist\pnpx.js" %*
)
