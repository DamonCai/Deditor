# 真实远程 iframe 交互验收（2026-09-22）

EXT-02 通过。使用真实产品 `HtmlPreview`、`buildHtmlPreview` 和原有 sandbox，在本地 Vite 的 `tests/external-iframe-review.html` 挂载自建 HTML，内嵌 `https://httpbin.org/forms/post`。仅为浏览器入口提供 Tauri 文件 URL/IPC 边界桩，未 mock 远程页面、表单或响应。

Codex 内置 Chromium 实际加载了远程表单。在跨源的嵌套 iframe 内填写 `DEditor generated test`、选择 Medium 和 Extra Cheese、填写自建测试说明，再通过 Enter 提交演示表单。真实 `https://httpbin.org/post` 回显：

```json
{"custname":"DEditor generated test","size":"medium","topping":"cheese","comments":"Self-generated iframe acceptance fixture.","custtel":"","custemail":"","delivery":""}
```

父页面仍显示自建标题，响应出现在子 iframe 内。回显 Origin 为 null，与现有无同源权限 sandbox 一致；没有放开主编辑器同源权限或输入真实联系方式。HTTPBin 是测试回显服务，此操作不是订餐。

最初 OpenStreetMap 示例在本网络断开连接，未计通过；改用上述可用公开测试服务。CUA 基础 AX 输入无法定位嵌套字段、复选坐标检查失败后，改用其公开 frameLocator 与键盘输入完成，未注入 DOM 事件。此结果覆盖真实远程加载、输入/选择、跨源表单提交及实际响应，不代表所有第三方站点都允许被嵌入，也不新增 macOS WKWebView 验收。

手动复验：启动 `npm run dev -- --host 127.0.0.1 --port 5173` 并打开 `/tests/external-iframe-review.html`。不接入离线 test:all，不修改产品源码。临时浏览器页面与 Vite 服务已关闭。
