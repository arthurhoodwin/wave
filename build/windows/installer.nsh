!macro customInstall
  CreateDirectory "$LOCALAPPDATA\Wave\installers"
  CopyFiles /SILENT "$EXEPATH" "$LOCALAPPDATA\Wave\installers\${VERSION}.exe"
!macroend
