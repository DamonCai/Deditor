# Windows 原生验收与构建（2026-10-08）

本轮在 Windows 的 `feature/1.0.2` 工作区安装项目依赖，启动 Vite 页面，并构建、运行 DEditor 的 Tauri/WebView2 应用。所有编辑与归档样例均为自建文件，存放于忽略目录 `tests/artifacts/windows-build/`。该目录里的安装工具和下载文件是本机验收材料，不属于产品交付内容。

## 已完成的 Windows 子项

| 子项 | 实际操作与核对 |
| --- | --- |
| WIN-01 | 在原生 WebView2 中打开自建 Markdown，实际输入中文、英文和 emoji，使用 Ctrl+S 保存，磁盘文件内容逐字节核对。 |
| WIN-02 | 在实际编辑器中执行 Ctrl+Z、Ctrl+Shift+Z、Ctrl+S 等快捷键，观察目标文档与编辑结果，再核对磁盘内容。Windows 文件快捷键的前端分派补入定向回归，避免菜单与 WebView2 同时执行一次动作。该范围不替代物理中文输入法候选窗验收。 |
| WIN-03 | 使用 Windows 原生打开与另存面板选取自建中文路径；保存后核对打开的文件与另存文件路径和逐字节内容。 |
| WIN-05 | 原生双窗口中，A 窗在已保存自建文件上继续输入未存中文草稿，B 窗持有未命名中文和 emoji 草稿。退出全部 DEditor 进程后重启，分别核对两窗口标签、草稿内容和归属，再分别保存。 |
| WIN-06 | 从 `fixtures/xmind` 生成自建双工作表 XMind，在 DEditor 原生窗口把根标题改成 `Windows 原版验收 😀` 并保存。解包核对 `content.json` 的两个工作表及未知字段，且其它 ZIP 条目与编辑前逐字节一致；随后用原版 XMind 实际打开，显示更新后的根标题、分支和图像。归档断言脚本保存在忽略目录的 `check-xmind.mts`。 |

本轮完成 5 个可独立验收子项，剩余项见[当前待办](pending-tasks.md)。**WIN-04 仍未完成**：需把自建文件从 Windows 文件管理器实际拖放进指定 DEditor 窗口，观察文件仅在目标窗口打开；打开面板和应用内导航均不能代替该系统拖放。本轮 Sky 原生拖动操作的终点被限制在源 Explorer 窗口边界内，无法形成跨到 DEditor 窗口的真实 drop，因此不把此项计为通过。

## 依赖与构建范围

项目使用 Node/npm 前端依赖及 Rust/Tauri Windows 构建链；本机补齐了 Visual Studio C++ Build Tools、Windows SDK、Rust toolchain、WiX 和 NSIS，并下载原版 XMind 供 WIN-06 验收。Windows 发行包位于 `src-tauri/target/release/bundle/msi/` 和 `src-tauri/target/release/bundle/nsis/`，版本 1.0.2。开发页由 `npm run dev` 提供于 `http://localhost:5173/`。

在本轮最后的图片兼容性修复版本上，Windows Tauri 构建成功，生成 MSI 和 NSIS 两种安装包；同版本完整 `npm run test:all` 已全链路成功退出，末尾 10 组恢复专项全部通过。构建产物分别为 `src-tauri/target/release/bundle/msi/DEditor_1.0.2_x64_en-US.msi` 与 `src-tauri/target/release/bundle/nsis/DEditor_1.0.2_x64-setup.exe`。完整测试日志位于忽略目录的 `tests/artifacts/windows-build/test-all-feature-final.log`。

Windows 字体采用 IDEA 常用的 JetBrains Mono 编辑字体与 Inter 界面字体，字体文件及 OFL 许可证纳入项目；代码编辑区的 CodeMirror 样式也已核对实际计算字体。具体实现见 `src/windows-fonts.css`、`src/main.tsx` 和相关样式文件。字体匹配以本机可用的 IDEA 默认/外观设置为准，不代表每位用户手动改过的 IDE 字体偏好。

这份记录限于上述自建样例和本轮原生操作，不推论所有 XMind 主题的逐像素一致、所有 Windows 输入法或长期内存稳定性。按用户后续要求，本轮代码已提交并推送到 `origin/feature/1.0.2`；重新构建的 NSIS 包已安装，系统安装记录与实际启动的程序均为 1.0.2。安装路径的后续纠正见下节。

## Windows 搜索图标与安装路径补验（2026-10-09）

用户截图显示 Windows 搜索中的 DEditor 仍为通用程序图标。提交 `e060a3f` 已给 NSIS 开始菜单和桌面快捷方式显式设置应用 EXE 图标并保留 `com.deditor.app`，但只核对打包进程内的 EXE、快捷方式和 Shell 图标，不能证明系统搜索能读取同一文件。

本机 Codex 是打包应用；它启动的安装进程访问 `%LOCALAPPDATA%/DEditor/` 时，被 Windows 映射到 Codex 包的 `LocalCache/Local/DEditor/`。独立于 Codex 包的同一用户进程核对时，开始菜单快捷方式指向的真实 `%LOCALAPPDATA%/DEditor/deditor.exe` 不存在。这是搜索结果拿不到应用图标的实际原因，不能归因于图标素材或仅归因于 SearchHost 缓存。

以同一用户的非打包进程运行已构建的 1.0.2 NSIS 安装包后，安装程序退出码为 0；独立进程核对真实 EXE 存在、SHA-256 为 `7A2ED1C33C4C28117C7CB072F2716F549B3206E65907BCEF7CB29B2D5E52F9FB`，开始菜单快捷方式目标与图标均指向该真实 EXE，提取图标为宇航员。重启 SearchHost 后，用户在 Windows 搜索输入 `deditor`，确认结果显示宇航员 logo。临时对照快捷方式和 EXE 已移除，搜索中仅留 `com.deditor.app`。本节只确认这台 Windows 机器的搜索结果和安装路径。

以后在打包应用启动的终端中验收 Windows 安装时，必须用非打包的同一用户进程核对真实安装路径，再检查搜索界面；仅在该终端内 `Test-Path` 或提取 Shell 图标会误读映射副本。
