# Markdown 导出

Markdown 工具栏右侧的「导出」在编辑、预览、阅读模式下均可使用。打开弹窗时捕获文档快照，之后的编辑或标签切换不会改变本次导出的内容。导出统一放在工具栏，编辑区右键菜单不再重复显示 HTML/PDF 导出项。

| 格式 | 适合用途 | 导出范围 |
| --- | --- | --- |
| HTML | 分享、离线归档 | 完整正文；跟随导出时预览主题；内嵌图片、图表 SVG、KaTeX CSS/WOFF2 字体 |
| PDF | 阅读、打印、交付定稿 | 系统打印对话框中选「存储为 PDF」或 PDF 打印机 |
| Word `.docx` | 后续编辑、文档协作 | 可编辑标题、正文、强调、列表、链接、表格；图片/图表内嵌 |
| PowerPoint `.pptx` | 将 Markdown 整理成演示稿 | H1/H2 新建幻灯片；水平分隔线分页；长正文自动续页；正文可编辑 |
| TXT | 复制到纯文本系统、搜索归档 | 正文、列表、制表符分隔的表格；图表/公式保留源码，图片保留说明 |
| SVG | 图表复用、矢量设计 | 选择一张 Mermaid/PlantUML 图表导出 |
| PNG | 粘贴、聊天分享 | 选择一张图表导出白底图片，默认 2 倍尺寸 |

## 格式边界

- Word/PPTX 为真正的 OOXML 文件；不使用改扩展名的 HTML，也不把整篇正文截图。
- Word/PPTX 中公式目前以 LaTeX 文本保留。PPTX 的表格目前转换为可编辑的逐行文字。复杂 HTML 样式和段落内装饰不会完全复刻；以 HTML/PDF 保留视觉排版更合适。
- SVG/PNG 导出图表，不导出整篇 Markdown。PNG 最大 8192 像素单边、1600 万总像素，避免超大画布耗尽内存。
- 相对路径图片需要先保存 Markdown，才能确定所在目录。远程图片需要允许跨域读取；资源读取/渲染失败会停止本次导出并显示错误，避免生成缺图文件。
- PlantUML 沿用预览的公共服务和缓存；未缓存图表需要联网并发送图表源码。TXT 不渲染图表，也不加载图片。
- PDF 沿用 Tauri 的原生打印能力，不内置 PDF 引擎。打印快照一直保留到下次打印替换，避免 native print 调用提前返回后把内容清空。系统是否提供 PDF 目标取决于操作系统。
- 文件写入仍通过既有 Rust `write_text_file` / `write_binary_file`；没有新增前端文件系统权限。Office 生成器及公式字体按需加载。

## 验证（2026-09-10）

- `npm run test:export`：12 项，覆盖快照、取消、重复导出互斥、HTML 主动内容清理、PDF 快照保留、可编辑 OOXML、中文长文续页、POSIX/Windows 图片路径、资源失败清理及 TXT 离线行为。
- `npm run test:regression`：69 项通过；`npm run test:xmind`：33 项通过。
- 浏览器实际操作导出 HTML/DOCX/PPTX/TXT/SVG/PNG，验证 PDF 的内容准备与原生调用边界。22 种工具栏 Mermaid/PlantUML 模板均成功渲染并转换 PNG。
- 实际 DOCX/PPTX 样例使用隔离的 bundled LibreOffice 转为 PDF、逐页检查中文、图表和分页。验证环境额外指定系统中文字体目录，不修改用户字体或 Office 设置。
- `npm run build` 通过。此轮未安装新的桌面包，也未在 Windows 原生打印机上实测。

实现 API 参考：[docx Packer](https://docx.js.org/api/classes/Packer.html)、[PptxGenJS 保存格式](https://gitbrent.github.io/PptxGenJS/docs/usage-saving/)。

## HTML 配色与图表修复补充

HTML 直接内嵌与预览共用的 `src/preview.css`，按点击导出时捕获的明暗主题生成代码高亮与 Mermaid。PDF 保留独立的浅色打印排版。文字颜色、高亮、链接、引用、代码块、图表颜色都保留在文件中，打开 HTML 不依赖再次加载 Mermaid。

生成文件前检查每一个图表容器都已经有 SVG；未完成、空源码、错误占位或无效 PlantUML 返回值都会中止导出，不再写出“正在加载”占位。新增测试验证异步渲染完成前不会写文件、主题与文字颜色保留、未生成 SVG 时禁止写文件。

移除 Mermaid/PlantUML 类型菜单的顶部说明和底部提示，仅保留系列名称与类型选项。浏览器重新打开深色/浅色 HTML 检查了文字颜色、语法高亮和实际 SVG；深色样例检测到 7 种代码颜色，加载占位为 0。

本次同时生成包含修复的 macOS 安装包。检查时运行中的 `/Applications/DEditor.app` 仍是 11:14 构建；需要退出旧应用并安装新包后，桌面应用才会使用这些修复。

安装包校验：最终使用 ad-hoc 本地签名重新打包，`codesign --verify --deep --strict` 通过，DMG 通过 `hdiutil verify`。交付文件为 `scripts/DEditor_0.9.0_aarch64.dmg`（Apple Silicon）。
