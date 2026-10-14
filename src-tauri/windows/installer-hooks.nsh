!macro NSIS_HOOK_POSTINSTALL
  ; Windows Search can retain its generic application icon when the shortcut
  ; relies on the target executable's implicit icon. Pin the packaged icon
  ; explicitly while preserving the installer's shortcut choices and AUMID.
  !if "${STARTMENUFOLDER}" != ""
    IfFileExists "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" 0 deditor_menu_icon_done
    CreateShortcut "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
  !else
    IfFileExists "$SMPROGRAMS\${PRODUCTNAME}.lnk" 0 deditor_menu_icon_done
    CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  !endif
  deditor_menu_icon_done:

  IfFileExists "$DESKTOP\${PRODUCTNAME}.lnk" 0 deditor_desktop_icon_done
  CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
  !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
  deditor_desktop_icon_done:

  ; Ask the shell to discard any icon/association entry cached before install.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
