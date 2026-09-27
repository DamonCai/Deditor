# 外部服务收尾（2026-09-27）

EXT-04 已在实际阅读编辑组件中完成真实远程响应的超时和按钮重试闭环。超时由测试代理人为延迟首个真实 SVG 响应的后半段触发；不是声称 PlantUML 上游自然故障，也不是原生 WKWebView 验收。EXT-01 仍缺可用 PicGo/测试图床环境，保留待办。

## PlantUML 产品修复

复核当前 `4baf39f` 后的产品模块，新增回归首先复现取消后立即对同一 DOM 节点 hydrate 仍不发请求：期望请求数 2，实际 1。取消时原 `data-plantuml-hydrated` 标记没有释放。现在在取消时同步释放进行中的节点标记，旧 Promise 不修改新渲染的标记或内容。

同一图编码的请求继续合并，但按活跃消费者管理生命周期。关闭先发起请求的视图不会中断仍需结果的另一视图；最后一个消费者退出才中断实际传输。同步移除被取消的请求条目，旧请求完成时核对条目归属，避免删除立即启动的新请求。原有 5 秒超时、错误源码、重试按钮与成功缓存保留。

## 真实服务及浏览器证据

使用 `tests/plantuml-timeout-review.html` 挂载实际 `MarkdownVisualEditor`，只包含本轮生成的 Alice/Bob 两条消息。默认页面现在直连产品默认 PlantUML 服务；只有显式 `?proxy=1` 时启用已有测试代理。测试页面和代理不进入正式应用入口。

先经默认 URL 直连成功显示 `Recovery_external-20260927` 与 `Confirmed`。随后进行了两轮真实延迟/按钮恢复，最终完整留证轮次如下：

| 步骤 | 结果 |
| --- | --- |
| 首次上游请求 | 真实 `https://www.plantuml.com/plantuml/svg/...` HTTP 200，2150ms，2585 字节完整 SVG 已收到并保存 |
| 延迟注入 | 代理先发送真实 SVG 的前 100 字节，将余下字节延迟 6500ms；不替换响应内容，不使用离线 SVG |
| 产品超时 | 产品原有 5000ms 计时器终止读取；代理在请求到达后 4989ms 观察到连接关闭，`completed=false` |
| 错误界面 | 显示离线/超时提示、完整自建源码和 `Retry diagram` 按钮；截图 `timeout-final.png` |
| 实际重试 | 用浏览器点击产品按钮，按钮禁用直至完成；代理对相同编码重新向真实远程服务执行 fetch，没有代理响应缓存 |
| 第二次上游 | HTTP 200，1201ms，2585 字节；传输完整完成于 1203ms |
| 恢复界面 | `Recovery_final-proof-20260927` 与 `Confirmed` 图形重新显示，错误及重试按钮消失；实际 store 正文逐字等于测试初始内容（`Source unchanged`），截图 `recovered-final.png` |

两次真实上游响应保存为 `upstream-1.svg` / `upstream-2.svg`，SHA-256 相同：`8a0a5a7d1d4dc43fb2184aa7f9b78b9bd116fe92c9a86cd4bd1f2f655936fa8b`。这里证明两次均向上游服务发起请求；不推断远程服务/CDN 内部是否使用自己的缓存。

前一轮同样成功：首个上游 HTTP 200/3133ms，客户端 4999ms 超时，点击后第二个上游 HTTP 200/1196ms 并恢复。没有重复发送用户文档或读取用户缓存。

证据位于忽略目录 `tests/artifacts/external-services-2026-09-27/`：`proxy.log`、`proxy-final.log`、两份真实 SVG、四张界面截图和 `retry-tests.log`。这些文件不随 Git 迁移。

手动复现（分终端运行；每次重新启动代理并使用新的 `run` 参数，避免产品成功缓存）：

```sh
node scripts/serve-plantuml-timeout-review.mjs tests/artifacts/external-services-review
npm run dev -- --host 127.0.0.1 --port 5194 --strictPort
```

访问 `http://127.0.0.1:5194/tests/plantuml-timeout-review.html?proxy=1&run=自定义唯一标记`，等待错误，再点击重试并核对源码。去掉 `proxy=1` 可直接请求默认远程服务。不要将该真实网络验收加入要求离线通过的回归套件。

## 验证与剩余范围

- `node scripts/test-plantuml-retry.mjs`：6 组通过，包括实际 5 秒计时器、同节点重试、双击合并、取消/脱离 DOM 禁止重试、取消后立即重挂、共享请求首消费者退出、最后消费者退出及旧 finally 不删除新请求。最终日志已保存。
- `npm run test:markdown-diagram-modes`：30 组通过；保留已有 React act 警告，不将其当成失败或掩盖。
- `npm run test:export`：13 项通过。
- `node_modules/.bin/tsc -b`、`git diff --check` 通过。全量测试由主 agent 整合，不在本文声称本组独立完成。
- EXT-01：本机 `/Applications/PicGo.app` 与 `~/Applications/PicGo.app` 未找到安装，默认 `127.0.0.1:36677` 连接失败。未读取用户 PicGo 设置或凭据，未安装/配置图床，未对其他服务伪造成功上传。需要用户指定可用测试服务才能完成返回链接、插入和重新显示的真实闭环。

测试页已关闭，两个测试服务均停止；未启动原生 DEditor、未修改用户文档、未替换日常应用、未提交或推送。
