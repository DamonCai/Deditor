# 远程 PlantUML 大图验收（2026-09-22）

EXT-03 的真实远程生成路径已通过：自建 100 条消息、2 个参与者的时序图，共 3,156 字节源码，经产品 `renderMarkdown` 实际懒加载 `plantuml-encoder` 生成占位与编码，再调用产品 `hydratePlantuml` 请求默认服务 `https://www.plantuml.com/plantuml/svg/…`。没有 mock fetch、响应或 SVG，没有发送用户文档。

实际请求一次成功，无需重试：HTTP 200，`Content-Type: image/svg+xml`；响应头到达耗时 3,362ms，hydrate 完成 3,833ms，总过程 3,848ms，仍使用产品原有 5 秒请求超时。返回 SVG 为 `206 × 3014`、`viewBox="0 0 206 3014"`，含精确首条 `FIRST_MSG_001`、末条 `LAST_MSG_100`，全部 100 条消息标签均存在。SVG 已实际装入产品 hydrate 的 DOM 占位。

环境为本机 Node 24.16.0 原生 fetch + JSDOM。JSDOM 仅提供 DOM、空 localStorage 和 matchMedia，不替换产品编码或网络；冷进程无已有图缓存。该结果证明真实外网服务、产品编码和 hydrate 大图闭环，不代表 WKWebView 现场视觉缩放/滚动或浏览器 CORS 的新验收。本次无产品改动、全量、构建、UI 操作或提交。

可重复的手动验收脚本：

```sh
PATH=/Users/damon/.nvm/versions/node/v24.16.0/bin:$PATH \
  node_modules/.bin/tsx scripts/verify-external-plantuml.ts
```

脚本每次生成同一份自建源码，走真实产品路径，最多首次失败后重试一次；网络失败退出非零，不用离线 SVG 冒充通过。可传一个独立输出目录作为第一个参数。不要接到必须离线通过的测试套件。

本次记录位于忽略目录 `tests/artifacts/external-plantuml-2026-09-22/`：`large.puml`、`large.md`、`attempt-1.svg`、`result.json`（含实际请求 URL、状态、耗时及环境）。源文 SHA-256 为 `4835dcc947b2c7df1ae716de0929cb96a7c48548d2387c7d9c94cf70c737b028`。
