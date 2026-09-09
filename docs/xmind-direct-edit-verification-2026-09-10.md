# XMind 直接编辑与统一保存

## 修改

- 移除阅读/编辑模式与 localStorage 模式开关。可写的现代 XMind 文件打开后直接编辑，旧的阅读偏好不再生效。
- 移除独立保存按钮、工具栏中的重复文件名。主题操作、搜索、大纲和格式合并为一条工具栏，使用共用 document-toolbar、Button 和紧凑输入框规格；窄空间允许换行。
- 保留通用 fileio 保存通路和 documentFlush：Cmd/Ctrl+S、文件菜单、另存为、自动保存入口与关闭前未保存提示都沿用应用的统一逻辑。
- 仅原先不支持写回的 legacy XML 继续只读；没有伪装成可编辑再丢弃修改。
- 保留本工作区前几轮的图标、布局等修改。本次没有修复上一轮视觉对比清单中的线形、批注和标签布局问题。

## 分轮验证

轮 1 — 用例：旧阅读偏好下打开现代 XMind，直接 F2 修改并保存。
  期望：无需模式切换；打开不脏；无阅读、编辑、独立保存按钮；修改可用通用保存入口保存。
  实测：回归通过；macOS 独立验证版直接 F2 输入“直接编辑与标准保存检查”，未失焦时 Cmd+S，重新读取磁盘压缩包 content.json 确认主题文字已写入。重启验证版后仍显示该文字。
  结果：通过。

轮 2 — 用例：旧 XML 文件、中文多行标题、Escape 取消输入。
  期望：不支持写回的 XML 可查看但不可误编辑；中文及多行数据保留；取消不产生修改。
  实测：回归通过；27 项 XMind 核心测试通过。
  结果：通过。

轮 3 — 用例：未失焦草稿自动保存入口、取消关闭、另存为、已保存关闭、切页/切文件/撤销。
  期望：统一保存队列先提交草稿；关闭复用公共提示；另存为仍为有效二进制压缩包；视图及撤销不丢。
  实测：相关回归全部通过。关闭最后一个文件后应用按现有逻辑创建空白标签，测试检查原 XMind 标签确实关闭，不错误要求 tabs 为零。
  结果：通过。自动保存验证的是 saveAllDirty 通路，未将其冒充完整原生延迟计时测试。

轮 4 — 用例：磁盘写入失败与相邻功能回归。
  期望：保存失败保留 dirty 内容和画布，不误标已保存；通用文件操作及原有图标显示不退化。
  实测：完整 test:regression 为 45 passed, 0 failed；test:xmind 为 27 passed。构建包含 tsc/Vite 与 Tauri macOS app，退出码 0；保留已有的大包提示。
  结果：通过。

## 原生界面与范围

原生验证程序为 `src-tauri/target/debug/bundle/macos/DEditor Edit Review.app`，标识 `com.deditor.edit-review`。使用 `tests/artifacts/xmind-direct-edit/edit-check.xmind` 测试副本，没有写用户 original 文件，也没有覆盖 `/Applications/DEditor.app`。

- `native-light.png`：最终单行工具栏，无模式切换和独立保存按钮，打开即有编辑操作。
- `native-dark.png`：相同界面结构在暗色下的截图。部分按钮文字对比度仍需专项检查；不以本次截图宣称全部控件视觉状态通过。
- 720px 原生缩窗操作报 `noWindowsAvailable`，未取得有效窄窗截图，未计入通过项。
- 未运行 Windows 原生程序；没有逐一原生测量 hover/focus 的全部状态。

日志：`tests/artifacts/xmind-direct-edit/regression.log`、`core.log`、`native-build.log`。
