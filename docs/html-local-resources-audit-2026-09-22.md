# 文件打开与 HTML 本地资源审查（2026-09-22）

按用户“检查 Markdown 编辑性能，并排除导致 HTML 等打不开的不必要限制”的要求，审查文件打开、独立 HTML 与 Markdown 内独立 HTML 文档的共用预览路径。仅使用自建样例，未改用户文档、日常应用、原生能力授权或保存编码。

## 可复现问题与修复

| 问题 | 修复 |
| --- | --- |
| 作者使用 `<base href="file:///…/">` 时，预览仍保留无法从隔离页访问的 file 基路径，相对脚本、样式和图片均不能走应用的本地资源协议 | 显式 file/Windows base 与资源 URL 使用相同转换；相对和远程 base 保留原有解析语义 |
| 生成预览时删除所有作者 base，也删除了 `target`，改变链接和表单的目标窗口 | 独立保留文档中首个 href 与首个 target 的语义，合并到生成的 base |
| SVG `xlink:href`、表单 action/formaction 和响应式图片 srcset 未转换显式本地 URL | 补齐对应属性；srcset 按 URL/描述符候选处理，data URL 中的逗号保留，不按逗号粗暴拆分 |
| 文件树/普通打开遇到丢失、权限、编码或二进制大小错误时只写日志，用户看起来是点击无反应 | 使用现有双语错误对话框显示文件名与原始错误；失败不创建空标签，不改当前正文。近期文件继续用原局部反馈，避免重复弹窗 |
| 二进制文件即使打开失败仍记入系统近期文件 | 仅在实际成功读取或复用已有标签后记录 |

修改 `htmlPreview.ts` 同时用于独立 HTML 和 Markdown 内动态 HTML 的 srcdoc 构建，未改变 Markdown 主编辑器 DOM、历史或源码序列化。

## 限制审查结论

- `read_text_file` 没有文件大小上限和 HTML 特有过滤；`.html`/`.htm` 大小写识别正常，文件对话框也提供 All 类型。
- Rust 当前通过 `read_to_string` 读取 UTF-8，非 UTF-8 文本仍明确报错。没有猜测编码后覆盖原字节；通用编码识别、保留原编码保存属于单独能力。
- 50 MiB 上限仅作用于整文件 Base64 二进制预览，不作用于 HTML/Markdown。由于现有二进制预览仍把整文件读入多份内存，本次未简单删除上限。
- 主编辑器与预览不同源隔离保留；脚本、表单、弹窗、下载、作者 CSP/refresh、srcdoc 及原有媒体行为保留。未新增 CSP、删除正文或调用外部服务。
- 相对样式资源随 base 正常解析。内联 CSS 或脚本运行时自行拼接的显式 file URL 尚非完整浏览器文件环境；未递归读取并重写外部 CSS/脚本。远程页面的站点嵌入策略、CORS 和同源存储规则仍由 WebView 执行。

## 五轮专项

入口：`node scripts/test-html-local-resources.mjs`。每次创建独立临时编译目录并清理，避免与并行测试共享缓存。

1. file/Windows/相对 base、首个 href/target、相对脚本与样式、页内片段：通过。
2. SVG 命名空间属性、表单目标、媒体时间片段、srcset 文件/data/相对 URL 混合：通过。
3. 作者脚本、CSP、refresh、远程 base、内嵌文档保留，不增加编辑器同源权限；重复生成结果一致：通过。
4. 实际 `openFileByPath` 打开大写 HTML、重复打开保留未保存正文；缺失/编码错误可见、近期调用可关闭重复反馈：通过。
5. 二进制失败双语反馈、失败不入系统历史、批量打开遇错继续、全过程不写文件：通过。

相关回归：原预览限制 4 轮、近期文件 5 轮、TypeScript 检查通过。未自行启动全量测试或性能基准；整合测试与构建由主 agent 执行。

## 性能与真实界面边界

成功打开文本仍是一次 IPC；已打开文件仍直接激活且不重读磁盘。预览维持一次 DOMParser，新增转换仅处理本地 URL 属性和实际存在的 srcset，不添加网络请求、定时器或全局 DOM 观察器。此次功能断言不提供速度倍数，完整性能比较由主 agent 统一执行，避免并行负载污染。

真实浏览器自建入口：`tests/html-local-resources-review.html`，英文暗色 `?lang=en&theme=dark`；资源在 `tests/fixtures/html-local-resources/`。可检查本地外链脚本、样式、两种图片、按钮/表单、主编辑器隔离及真实错误对话框。该子任务未自行操作浏览器，真实界面由主 agent 补验，以上 DOM 断言不能替代原生资源协议或 Windows 验收。

主 agent 首轮真实浏览器已验证本地脚本 42→按钮 43、表单提交及中文缺失 HTML 错误框。该轮发现 SVG 第二张图片仍为破图，srcdoc 中 xlink:href 仍是 file URL；JSDOM 的 qualified 属性选择器断言没有捕获真实引擎差异。现改用 namespace 通配本地名选择器 `[*|href]`，配合 `getAttributeNS/setAttributeNS` 读写 SVG 属性，专项重新通过。完整刷新后的真实浏览器重验确认 srcdoc 的 xlink 已转换为本地 HTTP 资源，截图中两张蓝黄图片均正常显示，脚本 42 和隔离提示仍保留。该结果为修正后的真实 SVG 显示证据；原生 asset 协议和 Windows 仍单独验收。

本 agent 未提交推送，未修改 AGENTS/package 测试总入口。

整合 test:all 和前端/独立 macOS 包构建通过。主端原生操作被系统锁屏阻挡，已请求解锁；本轮原生 asset 协议未验收，保留上述边界。最终状态见[总记录](markdown-performance-audit-2026-09-22.md)。
