# 全屏窗口按钮验证（2026-09-09）

## 实现

移除之前全屏专用的 React/CSS 仿制按钮。普通窗口仍使用原生标题栏按钮；全屏使用 AppKit 创建的标准 NSButton，尺寸和水平间距从普通窗口的实际按钮读取，放在 40pt 标题栏中。当前机器实测每个 14×14pt、间距 23pt。保留单个侧栏开关，移除 D / DEditor 标识。

全屏时，根据原生按钮所属窗口找到 AppKit 分离标题栏，隐藏其内容，避免顶部揭示时重复出现第二组按钮。退出全屏或进入专注模式时移除常驻按钮并恢复原生层。实现参考了 [JetBrains Runtime 的全屏原生按钮处理](https://github.com/JetBrains/JetBrainsRuntime/blob/jbr21/src/java.desktop/macosx/native/libawt_lwawt/awt/AWTWindow.m)，本项目不通过私有类名查找窗口。

红色调用 performClose，绿色调用 toggleFullScreen；黄色等待 NSWindowDidExitFullScreenNotification，下一主线程循环再最小化。新增 set_titlebar_visible 命令用于专注模式联动，已移除旧 WebView 关闭/最小化/全屏操作权限。

## 五轮验证

轮 1 — 用例：普通窗口与全屏的尺寸、布局及顶部揭示。
  期望：系统绘制同尺寸按钮，全屏常驻，仅一组。
  实测：独立 macOS 测试包运行；原生日志记录三枚按钮均 14×14pt、间距 23pt；全屏/普通窗口 AX 各一组；顶部操作后应用窗口截图无新增一行；日志确认分离标题栏内容已隐藏。
  结果：通过。截图范围为应用窗口，不包含系统菜单栏，分离层隐藏另由原生日志交叉确认。

轮 2 — 用例：不同原生尺寸与三按钮垂直对齐。
  期望：保持原生宽高，中心位于标题栏 y=20pt。
  实测：cargo test window_chrome::tests 两项通过，覆盖 14×16pt 和 16×16pt，验证尺寸保留、三枚按钮的位置与中心。
  结果：通过。

轮 3 — 用例：全屏黄色最小化、恢复后绿色退出、红色关闭。
  期望：退出动画结束后最小化；退出恢复原生标题栏；正常关闭。
  实测：最终测试包黄色操作在 14:26:10 UTC 收到 native window minimization completed（NSWindowDidMiniaturizeNotification）；恢复并再次进入全屏成功；绿色操作后常驻 host 移除，普通按钮恢复；红色关闭后进程已退出。
  结果：通过。

轮 4 — 用例：专注模式联动、亮暗主题、窗口失焦和重新激活。
  期望：专注模式隐藏常驻按钮，退出后恢复一组；主题和激活态使用系统绘制。
  实测：Cmd+K 后 AX 无窗口按钮，日志确认 host 移除；再次 Cmd+K 后恢复一组并重新隐藏分离标题栏；亮暗主题截图、失焦灰色和激活彩色均已检查。
  结果：通过。

轮 5 — 用例：相邻 UI 回归及生产前端/原生构建。
  期望：现有组件回归通过，TypeScript/Vite 与 Tauri 均可构建。
  实测：npm run test:regression 为 41 passed, 0 failed；npm run build 成功；Tauri debug macOS app bundle 构建成功。仅有已有的大 chunk 警告。
  结果：通过。

## 范围

原生验证使用独立标识 com.deditor.fullscreen-review 的 DEditor Fullscreen Review.app，未替换 /Applications/DEditor.app。此次修改包含 Rust，开发应用需重启原生进程；已安装应用需重新打包更新。Windows 分支是 no-op，未在 Windows 机器运行；其它 macOS 版本及多显示器跨屏未实测。


## 全屏按钮悬停标记补充（2026-09-09）

问题：原生按钮在自定义容器中可点击，但鼠标移入后没有关闭、最小化及退出全屏的内部标记。

修复：给原生容器增加随 visibleRect 更新的 NSTrackingArea，维护整组鼠标进入/离开状态，刷新系统按钮；首次全屏布局和窗口焦点变化时按实际指针位置同步。没有把 hover 强制设置为按下高亮。

原生绘制兼容：标准窗口按钮会查询容器的 `_mouseInGroup:`；本次仅在 FullscreenButtonsView 实现这一回调，不修改 AppKit 类，也不自绘符号。该回调不是公开 API，需要在 macOS 大版本升级时复验。依据为 [Chromium 原生按钮容器实现](https://chromium.googlesource.com/chromium/src/+/0a7406f924b6c1b1d9f26ffdb1ee23596fb452ef/chrome/browser/ui/cocoa/tabs/tab_strip_controller.mm)；事件追踪采用 [Apple NSTrackingArea](https://developer.apple.com/documentation/appkit/nstrackingarea) 的公开接口。
