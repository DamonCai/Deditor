# 当前 Markdown 与 Typora 差距核对（2026-09-12）

> 这是实施前的固定基线，不再追加新分类。用户随后要求执行，最新实现、证据与未完成边界统一见[补齐与验收记录](markdown-typora-implementation-2026-09-12.md)。下表“当前状态”描述的是核对时刻，不代表这些缺口今天仍全部存在。

## 范围与结论

按用户此前范围排除导入、导出和字体。核对基线为当前 `ee2974f`、Typora 官方功能说明、DEditor 实际复杂测试页及已有验证记录；没有执行同机 Typora 与 DEditor 的原生性能对跑，因此不给“完成百分比”或速度倍数。

基础 Markdown 可视化编辑、常用扩展和共享展示已经具备。主要差距集中在：真实输入稳定性与大文档流畅度、阅读模式的完整查找/链接/补全交互、历史恢复，以及高级公式和少数方言兼容。旧 P0–P3 的开发记录不能当作上述范围全部验收。

本次核对不修改产品代码，不提交推送，保护并行 XMind 改动。

## 本次实际检查

- 页面：`tests/markdown-visual-review.html?complex&parity`，自建完整复杂 Markdown，包含 H1–H6、嵌套列表/任务/引用、表格、代码、公式、Mermaid、HTML、脚注、YAML、目录和长文。
- 点击真实“检查呈现一致性”：465 项，`differences: []`。此为已覆盖样式/尺寸检查，不是任意文档的逐像素一致证明。
- 阅读编辑搜索栏：只有一个搜索输入框、匹配数、上一个/下一个和关闭；没有替换、正则、大小写或全词选项。DOM 的 `spellcheck` 为 `false`。
- 阅读编辑中 Cmd 点击文末 WARNING 内的“文内链接”：选中了链接文字，未跳转顶端 H1。事后 H1 相对视口 top 为 -10668.5px，阅读区域 scrollTop 为 10968。此次只验证文内链接，没有打开外部站点或原生文件。
- 自建 `second.md` 正文直接按键输入左括号：出现单个 `(`，没有补 `)`；输入 `:smi` 未出现表情候选。随后重新加载测试页恢复自建样例，没有保存测试输入。
- 当前安装的 KaTeX 默认配置分别执行 `\ce{H2O}`、`E=mc^2\label{eq:one}`、`\eqref{eq:one}`，均报未定义命令。源码没有加载 mhchem 或实现文档级公式编号/引用。这是渲染库核对，不冒充原生公式 UI 验收。
- 本次未重复运行与只读核对无关的全量构建；此前最近的 46 核心、85 阅读集成、142 通用回归和构建结果见性能记录。未新增真实 IME、Windows、图床账户验收结论。

## 逐项差距与建议顺序

| 优先级 | 项目 | 当前状态、具体差距 | 判定依据 |
| --- | --- | --- | --- |
| P0 | 中文输入与跨平台稳定性 | 已有 composition/滚动/撤销保护，但修复版真实中文候选输入仍未成功验收，Windows 未验收；不能说已达到 Typora 的日用成熟度 | [IME 记录](markdown-ime-fix-2026-09-11.md)、[原生补充](markdown-native-followup-2026-09-12.md)。属于待验收，不断言修复仍失败 |
| P0 | 长文流畅度与资源 | 已减少隐藏源码同步和全篇扫描；6303 行、152241 字符、500 表格的三次浏览器输入中位数仍为 70.5ms，模式重建仍有数秒等待；长期内存与多轮切换压力还没闭环 | [性能记录](markdown-performance-2026-09-12.md)。仅三样本、按键到第二动画帧，不是 Typora 对跑 |
| P1 | 阅读编辑查找/替换 | 目前是大小写不敏感的字面量查找；没有本模式的替换/全部替换、用户正则、全词和大小写选项。源码及跨文件搜索的能力不等于阅读模式具备 | `MarkdownVisualEditor.tsx` 搜索栏、`markdownVisual/search.ts`；[Typora Search](https://support.typora.io/Search/) |
| P1 | 普通链接与跨文件章节跳转 | 正文点击处理先 preventDefault，再在非只读模式直接返回；无 Cmd/Ctrl 放行。旧只读入口已经删除。`file.md#heading` 也没有统一拆分文件与章节定位的流程 | 本次文内链接复现；`MarkdownVisualEditor.tsx:126`、`fileio.ts:62`；[Typora Links](https://support.typora.io/Links/) |
| P1 | 输入补全 | 已有完整 `:smile:` 转换，但没有前缀候选；阅读正文没有括号/引号及 Markdown 符号自动配对的完整设置与交互。源码及内嵌代码编辑器的补全不能代替正文 | 本次直接按键、`markdownVisual/shorthand.ts`；[Typora Auto Pair](https://support.typora.io/Auto-Pair/)、[Markdown Reference](https://support.typora.io/Markdown-Reference/) |
| P1 | 历史版本与草稿恢复 | 已有未保存内容持久化、自动保存、会话内撤销；没有按时间浏览/恢复多个文件版本的产品入口，也没有独立的历史草稿恢复列表 | `persistence.ts`、`fileio.ts` 及后端命令；[Typora Version Control](https://support.typora.io/Version-Control/)。Typora macOS 系统版本与 Windows/Linux 草稿恢复并非同一能力 |
| P1 | 阅读与预览整篇布局一致性 | 共享正文样式已经落实，但阅读编辑脚注定义仍在原文位置，预览集中在文末；特殊块源码展开时也使用编辑占位布局 | 本次两侧 DOM、[共享展示验证](markdown-shared-presentation-verification-2026-09-12.md)。应在保护原文、撤销及光标前提下解决布局差异 |
| P2 | 大纲导航 | 有按标题缩进的目录和点击跳转；阅读模式目录没有层级折叠、当前章节高亮和目录内过滤。全局符号搜索是部分替代 | `MarkdownVisualEditor.tsx` 的目录列表；[Typora Outline](https://support.typora.io/Outline/) |
| P2 | 高级公式 | 常规行内/块公式已有；缺少 mhchem 化学公式、文档级编号与 label/eqref 引用。MathJax 与当前 KaTeX 的命令覆盖有差异，不应宣称完整 LaTeX 等价 | `markdown.ts`、本次 KaTeX 核对；[Typora Math](https://support.typora.io/Math/) |
| P2 | 图表方言与编辑反馈 | Mermaid、PlantUML 已有；Typora 的独立 `flow`/`sequence` 围栏未实现。Mermaid 自己的流程/时序图已有，不能说“没有时序图”。当前块源码编辑期间暂停更新图形，退出编辑才恢复 | `markdown.ts`、`markdownVisual/codeView.ts`；[Typora Diagrams](https://support.typora.io/Draw-Diagrams-With-Markdown/) |
| P2 | 代码块专用选项 | 已有代码高亮、复制、内嵌 CodeMirror、自动缩进及行号基础；缺少正文代码块单独的行号/换行/缩进宽度/默认语言等完整设置 | `codeView.ts` 使用 `basicSetup`，其中已包含行号，不得误报“没有行号”；[Typora Code Fences](https://support.typora.io/Code-Fences/) |
| P2 | 拼写检查 | 阅读编辑显式关闭浏览器 spellcheck，未见语言、词典、忽略/更正管理入口 | 本次 DOM、`MarkdownVisualEditor.tsx:117`；[Typora Spellcheck](https://support.typora.io/Spellcheck/) |
| P3 | 自定义排版与嵌入生态 | 当前默认/紧凑排版和亮暗模式已有，没有面向用户的自定义 CSS 主题入口；iframe 会被共用清理层默认过滤。扩展此类能力应先确定安全的显示边界，不能简单移除清理 | `markdownPreferences.ts`、`markdownDisplay.ts`；[Typora Typeset](https://support.typora.io/Typeset/)、[Markdown Reference](https://support.typora.io/Markdown-Reference/) |

链接补充：上游浮层存在 `target="_blank"` 的链接入口，所以准确差距是正文快捷点击及应用级路由没有闭环，不是所有入口都不能打开链接。脚注浮层/回跳有独立逻辑，也不能与普通链接混为一项。

## 已具备，不能再列成“缺失”

- H1–H6、列表/嵌套列表、任务、引用、表格、代码、链接、图片、常规公式、Mermaid/PlantUML、YAML、目录和保留 HTML。
- 光标处块类型提示、行内源码展开、绝对标题级别输入、脚注与提示块直接编辑、高亮/上下标/完整表情简写。
- 表格矩形粘贴、跨格导航、增行、对齐；安装中的 Milkdown 表格组件也已有行列拖拽实现（`@milkdown/components/src/table-block/dnd`）。不能因本项目没有另写一套拖拽代码就断言没有，但真实拖拽全流程验收仍需补。
- 图片尺寸、文档图片目录、`typora-root-url`、本地整理、远程下载、PicGo 本机接入与移动/另存路径维护。原生外部目录选择、复制、保存/撤销已有证据；真实图床账户全流程仍待验收。
- 共享显示外壳、CSS、静态块渲染和资源更新；源码保真文档层、跨模式撤销、保存和多标签会话。
- 聚焦/显式打字机、自动保存、当前草稿持久化、工作区文件树、跨文件搜索、多语言代码与 HTML/XMind 专用能力。DEditor 的定位更广，不能把这些当成 Typora 缺口。

## 后续验收方式

优先收齐真实中文候选输入、长文切换与压力证据；可同时开发不依赖原生工具的查找替换、链接路由和输入补全。之后完成历史恢复、脚注整篇布局与大纲，再推进高级公式/方言和可选设置。

每项修改继续使用完整复杂 Markdown 与真实 Preview 对照，保持共用展示层，并验证原文、保存、撤销重做、跨模式/标签、滚动和 HTML/XMind 隔离。尚未运行的原生/平台验收继续保留未验证，不把自动化通过折算成全部完成。
