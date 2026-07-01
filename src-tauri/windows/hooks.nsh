; Sonarix NSIS installer hooks — backup warning + wipe user data on uninstall

!macro NSIS_HOOK_PREUNINSTALL
  MessageBox MB_YESNO|MB_ICONEXCLAMATION \
    "PENTING / IMPORTANT:$\n$\n\
Database library (sonarix.db) akan dihapus permanen saat uninstall.$\n\
Backup dulu via Sonarix > Settings > Backup library DB.$\n$\n\
Your music library database will be permanently deleted.$\n\
Back it up first via Sonarix > Settings > Backup library DB.$\n$\n\
Lanjut uninstall? / Continue uninstall?" \
    IDYES continue_uninstall
  Abort
  continue_uninstall:
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Always remove app data so reinstall shows fresh onboarding
  SetShellVarContext current
  RmDir /r "$APPDATA\com.sonarix.app"
  RmDir /r "$LOCALAPPDATA\com.sonarix.app"
!macroend
