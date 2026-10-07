# Windows PicGo 真实图床验收（2026-10-08）

本轮在 Windows 11 的 DEditor 原生 WebView2 包上完成 EXT-01：从产品写作设置点击“上传本文本地图片”，通过本机 PicGo Core 服务将自建 PNG 发送到真实远程图床，取得链接，替换 Markdown 引用，保存并关闭重开后重新显示。没有读取用户图床配置或账户凭据。

## 环境与样例

- 已安装 PicGo GUI 3.0.2；本轮使用独立安装的 PicGo Core 3.1.0，在 `tests/artifacts/windows-build/picgo-acceptance/` 保存独立配置和仅用于验收的上传器。本机接口为 `http://127.0.0.1:36677/upload`，不会写入用户 `%APPDATA%\picgo` 配置。PicGo Core 的本地服务和插件机制见[官方文档](https://docs.picgo.app/core/guide/use-in-node)。
- 真实远端选用 Litterbox 的匿名一小时临时存储，接口由其[官方页面](https://litterbox.catbox.moe/)公开。验收插件仅上传自建 PNG，不包含账户令牌或仿造响应。临时 URL 到期后失效，不作为长期图片托管配置。
- 自建 `picgo-probe-2026-10-08.png` 为 64×64 蓝底橙色方块、338 字节；自建 `PicGo真实图床验收.md` 的初始引用为 `![蓝底橙色方块](picgo-probe-2026-10-08.png)`。均位于忽略目录 `tests/artifacts/windows-build/`。测试文件以外的用户文档未修改。

## 实际产品流程

1. PicGo Core 的 `/upload` 对同一自建图返回 `success: true` 和 `https://litter.catbox.moe/uywj5u.png`，证明服务端使用真实 Litterbox 上传器。
2. DEditor 原生文件对话框打开自建 Markdown，右侧实时预览先显示本地图。写作设置中 PicGo 地址为默认 `127.0.0.1:36677/upload`，点击“Upload this document’s local images”。首次图床响应 HTTP 412 `No file!`，产品显示“Uploaded 0, skipped 0, failed 1”，引用保持原样；这次失败不计通过。再次操作时，PicGo Core 日志记录收到扩展 Windows 路径 `\\?\D:\WorkSoft\Deditor\tests\artifacts\windows-build\picgo-probe-2026-10-08.png`，变换后的图片为 338 字节，远端返回 `https://litter.catbox.moe/j2rjim.png`，接口状态 200。
3. DEditor 显示“Uploaded 1, skipped 0, failed 0”，源码引用变为 `![蓝底橙色方块](https://litter.catbox.moe/j2rjim.png)`，标签变脏。`Ctrl+S` 后标签恢复已保存状态；磁盘文件保留原文其余字节，远程引用文件长 111 字节，本地 PNG 仍为 338 字节。
4. `curl` 独立请求新链接取得 HTTP 200、`image/png`、338 字节。DEditor 在保存后显示蓝底橙色方块；关闭标签，再由系统文件对话框重开同一 Markdown，等待网络图加载后再次显示方块。此处的重显是 WebView2 真实渲染证据，不以可访问性树中的图片 alt 文字替代。

结束时关闭了自建 Markdown 与 XMind 测试标签、DEditor 和原版 XMind 测试实例，停止隔离 PicGo Core 服务。此结论只覆盖临时真实图床和这张自建 PNG；不代表第三方永久图床账户、其他图片格式、图床自然故障重试或上传后长期可访问性均通过。
