# AGENTS.md

DEditor 项目的协作上下文。Codex 在这个目录工作时自动加载本文件。

## 当前进行中的 XMind 核对（2026-09-11，跨机器接续）

- 最新接续：性能优化后补齐跨文件图片资源/同名避让、所选主题间联系及内部链接复制，单次撤销连同资源恢复。Review26 固定快照 119 核心 / 144 组件、完整回归、性能与构建通过；真实浏览器和 macOS 保存/撤销/重开、两份原版读取闭环通过，测试应用全部退出。Review24 大附件结果也已补原生重开/原版读取；无 theme 根节点无填充时的原版标题显示差异仍需核对。见 [剪贴板修复与最新边界](docs/xmind-clipboard-fix-2026-09-12.md)。Review26 采用 Review24 的已验证 Markdown 基线加 XMind 改动，不代表当前并行 Markdown 最新开发整体通过；保护并行工作区，未提交推送。

- 最新性能实施：已优化 Base64、仅外观变化的布局复用、标题测量/路径共享及独立草稿渲染。相同数据 8MiB 编码 136→9ms、5,001 节点完整布局 52→28ms、改色画布更新 49→2ms。Review24 固定快照 116 核心 / 143 组件及完整回归、性能、构建通过；1,001 节点浏览器连续编辑通过，原生含 8MiB 附件保存/撤销精确校验通过。原生控制随后超时，Review24 重开/原版读取未完成，测试进程已退出。详见 [性能实施与验收边界](docs/xmind-performance-implementation-2026-09-12.md)。本执行未提交推送，期间外部操作提交到 `ee2974f`，接续重查 Git。

- **最新审计纠正：剩余不只有 IME 和 Windows。** 已用自建文件复现跨文档粘贴图片资源缺失/同名错图，以及选中主题间联系线未复制，均尚未修复；可在本机继续处理。紧凑形状/主题组合、复杂连续交互及最新整合快照也尚未完整收口。接手优先读 [可处理项审计](docs/xmind-pending-audit-2026-09-12.md)，下方“只剩两项”是此前错误概括，不能再据此停止。

- 最新接续补充：已从系统设置确认简体拼音和切换快捷键启用，但真实组词仍未激活；截图恢复后仅见英文纠正建议，不能计作中文候选。已补 [跨机器原生验收步骤](docs/xmind-native-acceptance.md)、六组自建样例生成及精确归档校验器，正反用例通过；这些准备不替代 IME / Windows 原生验收。测试应用及本次系统设置均已关闭，完整记录见第二十轮末尾。

- 第二十轮最新：Review23 标题/标签/左右深层鱼骨/整段联系已完成原生保存重开与原版读取；鱼骨原版 62% 全图和组合标签全文均已补齐。打开面板改用系统文件项打开动作通过，无需代码修改。只剩本环境无法补齐的真实 IME 候选定位和 Windows 原生验收，整体未完成。测试应用均已退出；详见 [第二十轮记录](docs/xmind-round20-verification-2026-09-12.md)末尾。

- 最新接续见 [第二十轮记录](docs/xmind-round20-verification-2026-09-12.md)：标题宽度/换行、标签组合字符截断已修复。Review23 固定快照 112 核心 / 142 组件、完整回归、性能及构建通过；浏览器显示和全文编辑通过。原生工具仍报锁屏，Review23 新包原生、原版闭环及候选/Windows 尚未验收，不能标整体完成。

- 最新接续见 [第十九轮记录](docs/xmind-round19-verification-2026-09-12.md)：标签/对称折叠已原生与原版闭环，整段联系拖动已原生保存/撤销/重开；深层鱼骨混合折叠重叠已修复并完成 128 组合与浏览器复测。Review21 固定快照 109 核心 / 142 组件、完整回归、性能与构建通过，但锁屏后新包原生、拖动结果原版重读、候选窗口仍待补；Windows 未验收。测试应用已退出，不要以这些批次通过声称整体完成。

- 用户 2026-09-12 要求：每次 DEditor / XMind 原生验证结束立即退出应用，避免测试实例和恢复窗口积累影响正常使用。仅保留正在验证的实例；退出前保护未保存文档，验证用文件保存后关闭文档再退出，防止下次批量恢复。

- 接手先读 [XMind 接续上下文](docs/xmind-handoff-2026-09-11.md)，再读其中引用的第五批验证记录。**整体修复和全量验收尚未完成**；58 项核心测试、91 项组件回归及 macOS 样例通过只代表已覆盖范围。
- 用户已明确授权持续对照原版、修复并验证，尤其是 UI 和前端交互。通过一批测试后，立即推进下一个未完成项；不要以“本轮通过”“已写报告”结束整个工作，不要反复要求用户说“继续”。用户中途问进度时，简短回答后继续执行。
- 只有约定范围全部验收完成、用户明确要求暂停/交接，或无法继续任何相关工作的真实阻塞，才结束执行。单个平台/工具不可用时记录该项未验证，同时推进不依赖它的工作；不得将未验证项计为通过，也不得擅自缩小验收范围。
- 本次暂停原因是用户明确要换机器，并要求写入上下文。此前多次停止是助手把批次完成误判为任务完成，属于执行判断失误；解锁后的最近几次停止并非环境阻塞。
- 以下是早期跨机交接时的历史状态，接手必须重新检查 Git：当时所有修复尚未提交，`src/lib/xmind/drop.ts` 为未跟踪文件。`tests/artifacts/` 被忽略，截图、样例和哈希不会自动随 Git 同步。交接说明包含迁移包和重建方法。
- 本任务允许修改 XMind 专用组件；下文通用 UI 整理时“不调整 XMind”的约束不阻止用户明确要求的 XMind 修复。继续遵守仅用自建测试样例、保护原有改动、真实 UI 验证和中英文同步等要求。

---

## Markdown 可视化编辑架构（2026-09-11，核心接入已实施）

- 后续接手此功能先读 [Markdown 可视化编辑接续上下文](docs/markdown-visual-editing-context-2026-09-11.md)。用户要求接近 Typora、以最终体验为优先，不以代码量作为选型约束，同时保护 HTML、XMind 等既有能力。
- 本次讨论最终倾向：**Milkdown／ProseMirror 定制可视化编辑 + CodeMirror 源码和代码块 + 独立 Markdown 保真文档层 + 每标签编辑会话层**。优先复用成熟组件，必要时深入 ProseMirror 定制；不要把此前讨论过的纯 CodeMirror 实时预览或从零搭建 ProseMirror 当作最终结论。
- 原文保真、跨模式撤销、真实中文输入法与长文档性能是必须先验证的风险，不能声称引入依赖后自动具备。HTML/XMind 的模式、快捷键、样式、保存和会话生命周期必须隔离并回归。
- **用户随后已明确要求执行，现已接入 Milkdown 阅读编辑、只读模式、源码保真文档层和共用撤销会话。** 详见 [实施与验证记录](docs/markdown-visual-editing-verification-2026-09-11.md)。自动化与浏览器验证已有证据，真实 IME、macOS 原生交互和 Windows 验收尚未完成，不能计为通过。XMind 仍由其独立任务继续验收；不要覆盖同时进行的 XMind 改动。时间估算仅作参考。

- 历史指令（后续已取消本次提交推送）：全面测试、整体更新 README、更新上下文并提交推送，不再提问。Markdown 提交前已在独立暂存区快照完成完整自动化、性能和构建，详见 [提交前验证记录](docs/markdown-release-verification-2026-09-11.md)；源码原生历史事件捕获已修复。目标远程分支 `origin/feature/0.9.0`，独立 XMind 改动保持在原工作区，真实 IME 与双平台未验收项仍须补齐。

- 用户实际反馈部分区域不可编辑、输入跳页后，已复现搜索关闭后仍自动选中文末并覆盖文本的问题；修复搜索选区、引用/行内 HTML 编辑范围及块内光标，新增长文回归。见 [交互修复记录](docs/markdown-interaction-fix-2026-09-11.md)。旧测试通过不能替代这些操作证据。

- 单个 `# ` 变为 `##### ` 已复现并修复：上游标题规则会将新井号数累加到已有级别，现替换为绝对 H1–H6 规则。见 [标题修复与验证](docs/markdown-heading-fix-2026-09-11.md)，后续不得重新引入原累加规则。

- 阅读编辑与实时预览已统一正文样式，须用真实 Preview 做同宽对照；另修复标题 id 引发的撤销空行变化及滚动清空重做历史，见 [呈现一致性验证](docs/markdown-presentation-fix-2026-09-11.md)。用户要求钉钉式光标提示，并进一步明确不限于 H1–H6：现统一在页边显示当前标题、正文、嵌套列表/引用、任务、表格、代码、公式、图表、图片或保留块的类型，文本范围选区、失焦及只读隐藏；不得恢复为全篇常显。此前“正文隐藏”已被本次需求替代。必须用复杂完整 Markdown 验证；273 行样例与完整记录见 [块提示验证](docs/markdown-block-hint-verification-2026-09-11.md)，早期仅标题版本见 [标题提示验证](docs/markdown-heading-hint-fix-2026-09-11.md)。

- 用户再次反馈输入时页面移动：已复现高图表切换源码导致块高度 512 → 151.75px，现保留编辑占位高度、延后隐藏预览更新、复用未改内容，异步结果须校验当前源码。见 [输入位移修复记录](docs/markdown-scroll-fix-2026-09-11.md)。浏览器滚动验收要先手动滚至目标，再用坐标点击和直接按键；对元素重复定位会引入工具自身的滚动，不得混作产品证据。

- 用户明确校正：页面移动发生在**中文组词输入**。旧隔离原生应用已复现 `zhong` 组词使正文上移约 170px，不能再拿图表修复或直接插入中文作为 IME 验收。现增加 composition 期间按 DOM 光标保持可视区的保护；浏览器模拟与全量回归通过，修复版真实拼音复测仍未完成（原生控制/输入源切换受阻）。见 [中文输入法位移记录](docs/markdown-ime-fix-2026-09-11.md)，不得标记为原生全面通过。

- 按用户“开始吧，保持预览样式一致”的指令先推进 P0：已新增完整组词历史边界，修复长停顿撤销回到中间拼音；取消保留重做，结束时撤销不可被延迟覆盖，覆盖正文/表格、内嵌代码/保留块及源码。共享 CSS 未变，完整回归及复杂文档浏览器验证见 [P0 输入记录](docs/markdown-p0-input-verification-2026-09-11.md)。**真实拼音仍未激活成功，输入源菜单控制超时；Windows 未验收。P0 未全面完成，不得以模拟通过取代原生结果或直接跳到 P1 宣称完成。**

- 用户随后追问 P0–P3 并明确反对停止：必须持续执行[完整 P0–P3 清单](docs/markdown-typora-roadmap-2026-09-11.md)。P0 的某个平台验收受阻时保留未验证标记，同时继续 P1–P3 中可独立推进的开发和测试；此前“先后顺序”不得解释为整项停工或等待用户再次催促。

- P1–P3 可独立开发项已实施：行内源码展开、表格矩形粘贴、共享脚注/目录/YAML/提示块、图片尺寸/目录/路径维护、主题/聚焦/显式打字机和 HTML/PDF 模板。接手先读[2026-09-12 实施与验证](docs/markdown-p1p3-verification-2026-09-12.md)，不要把文末脚注布局、原生输入法或 Windows 未验收项说成全部通过。新增设置在 `markdownPreferences.ts`，保护独立 XMind 修改。

- 2026-09-12 用户要求字体类型全局统一：Markdown 阅读编辑、真实预览和 HTML/PDF 正文沿用原默认字体栈；行内源码展开继承正文类型与字号。衬线主题已移除，旧 `serif` 持久化/导出快照恢复默认；紧凑选项仅改排版密度。代码仍保持等宽。字体修正留在工作区，用户反对以提交作为停止条件，本次不提交推送。56 项集成、13 项导出和生产构建通过；复杂页实测两侧正文和展开的 `**粗体**` 均为同一字体栈与 15px（测试页当前字号）。

- 2026-09-12 用户排除导出，要求检查其他 Typora 差距。本次已复现修复图片路径转义/HTML 实体/Windows 大小写及未改动行内片段收起时整篇解析的问题，见[非导出检查记录](docs/markdown-non-export-audit-2026-09-12.md)。57 项阅读集成及完整回归通过；脚注正文/提示块直接编辑、扩展简写、图床流程和真实 IME 仍有明确缺口。不要把检查完成说成上述功能已实现；改动未提交推送。

- 2026-09-12 非导出功能继续推进：已补直接编辑脚注/提示块、简写、图片根目录、远程下载、本机 PicGo、外部图片目录、富文本脚注浮层及长文目录/行内索引优化。接手先读[最新验证与未完成边界](docs/markdown-image-footnote-performance-2026-09-12.md)，再看[扩展实施记录](docs/markdown-extended-editing-2026-09-12.md)。本次不提交推送，保护独立 XMind 工作区。真实 macOS IME、Windows、真实图床账号及目录选择器原生操作仍待验收；锁屏后不能继续原生控制，浏览器与自动化不替代这些项。

- 2026-09-12 用户再次明确阅读编辑必须与实时预览保持样式一致，并要求评估共用显示组件。已记录[共享展示层设计评估](docs/markdown-shared-presentation-design-2026-09-12.md)：统一文档显示配置、静态块渲染生命周期和可编辑块结构约定，宿主只负责各自交互；不要继续各写一套正文样式。该条为最初评估状态，后续实施见下一条；迁移须保护 IME、光标、滚动、原文及 HTML/XMind。

- 2026-09-12 用户明确要求执行共享展示重构：已接入 `MarkdownDocumentSurface`、`markdownDisplayHtml` / `hydrateMarkdownDisplay`，Preview、代码/图表、保留块共用显示处理；字体及块间距以 `preview.css` 为准，编辑器只作控件和包裹适配。修复表格隔行色、窄窗代码换行及嵌套列表累积间距。接手读[共享展示实施与验证](docs/markdown-shared-presentation-verification-2026-09-12.md)，此前“仅评估”状态已被实施取代。5 种复杂文档显示配置各 465 项 DOM 样式/尺寸/流位置检查通过，43 核心 / 77 集成、完整隔离回归及构建通过；真实 IME、Windows、真实图床账号和原生选择器仍未全面验收。本次不提交推送，保护独立 XMind 改动。

- 2026-09-12 用户追问可完成项后，已重新构建最新共享展示原生包并补测：系统外部目录选择（中文/空格/井号）、两张图片复制与精确引用替换、设置关闭后的键盘撤销、脚注 Tab/Esc、保存关闭重开通过。详见[原生补充验收](docs/markdown-native-followup-2026-09-12.md)。截图接口先失败后恢复，不得沿用“永久锁屏”解释停止。真实拼音切换仍失败（两种快捷键输入保持拉丁文，两个系统菜单控制超时），Windows 和真实图床账号仍未验收。设置已恢复，原文已校验一致，测试文档关闭、独立应用退出；未提交推送。

- 2026-09-12 用户要求删除 Markdown“只读”：应用仅保留编辑、实时预览、阅读编辑，旧 `read` 持久化值迁移为 `visual`；HTML/XMind 专用模式保留。见[删除只读与验证](docs/markdown-remove-readonly-2026-09-12.md)。此前只读描述属于历史记录，不得据此恢复入口。43 核心、79 集成、完整分组回归、112 XMind、导出／语法／图标与生产构建通过；复杂文档跨模式编辑撤销和 465 项呈现对照通过。本次未执行提交推送，未新增真实 IME 或 Windows 验收结论。

- 2026-09-12 Markdown 输入与长文继续修复：阅读编辑改用原生光标并保留格式边界导航，移除虚拟光标每次输入的强制布局；关闭搜索停止全文扫描，修复 Unicode 搜索偏移，缓存未变文本块、标题位置并避免重复属性写入。见[最新原生光标与长文记录](docs/markdown-native-caret-long-document-2026-09-12.md)。46 核心 / 82 集成 / 142 组件回归、其他完整回归及构建通过，465 项共享样式对照无差异。6303 行浏览器连续输入、保存快照、跨模式撤销通过；303 行原生普通输入、保存与撤销逐字节恢复通过。真实 IME、Windows、大文档原生编辑仍未验收；开发标签崩溃两次，随后复现修复取消初始化后仍创建编辑区的问题；新增用例修复前创建 2 个实例、修复后 1 个。修复后 6303 行五次模式往返及一次标签往返全文一致，仍不得计为长期压力测试全面通过。最后初始化守卫尚未包含在此前原生验证包中。本执行未提交推送，期间代码和记录被外部操作纳入 `cf1445d`、`acdd121`，接续重查 Git，继续保护独立 XMind 修改。


- 2026-09-12 Markdown 性能继续优化：控件按 DOM 变化局部更新（补齐任务正文与嵌套名称）、关闭目录不计算目录；隐藏 Markdown CodeMirror 延后到激活前同步，保护保存、共享历史和阅读光标。见[性能记录](docs/markdown-performance-2026-09-12.md)。46 核心 / 85 集成 / 142 组件及构建通过，最终 465 项呈现检查无差异。6303 行三个普通输入的第二帧中位数 87.5 → 70.5ms（约降 19%，仅局部测量）；2000 任务局部控件更新 29.11 → 0.026ms。大文档模式重建仍重，真实 IME、Windows 和长期压力仍未验收。本次未提交推送，保护独立 XMind 修改。

- 2026-09-12 用户反馈行尾 `<kbd>Ctrl</kbd>` 无法把光标放到最右侧：已复现并补齐 HTML 格式内外的方向键、鼠标定位及原生光标显示。零宽装饰仅属于视图，不写入原文。见[行尾 HTML 光标记录](docs/markdown-terminal-html-caret-2026-09-12.md)。浏览器内外编辑、撤销与呈现对照通过；本次未新增原生包、Windows 或真实 IME 验收，未提交推送。

## 项目概览

- 2026-09-12 最新 Typora 差距核对（排除导入导出和字体）见 [当前核对记录](docs/markdown-typora-audit-2026-09-12.md)。复杂文档 465 项呈现检查通过，但脚注整篇布局仍不同；本次实测正文 Cmd 点击文内链接未跳转、阅读正文括号/表情前缀无补全。阅读查找缺替换/正则、大纲缺折叠/章节高亮、历史版本与高级公式仍有缺口。表格拖拽已有上游实现、内嵌代码已有行号，不得误报缺失。真实 IME、Windows、长时压力及真实图床仍未验收。本次为核对与上下文记录，没有产品代码修改或提交推送。

**DEditor** 是跨平台桌面 Markdown / 多语言代码编辑器。

- **应用名 / 二进制名 / identifier**：`DEditor` / `deditor` / `com.deditor.app`
- **目标平台**：macOS（.dmg）+ Windows（.msi/.exe）
- **Git 状态**：已初始化 Git；当前分支与未提交改动以 `git status` 为准。跨机接续时同时迁移未提交文件和被忽略的验证证据。

## 技术栈

- **Tauri 2.10**（不是 Electron —— 选 Tauri 是为了包体小 + 内存低，代价是必须装 Rust 工具链）
- **Rust** 后端（`src-tauri/src/lib.rs`，所有命令集中在这个文件）
- **React 18 + TypeScript 5 + Vite 6** 前端
- **CodeMirror 6** 编辑器内核 + `@codemirror/legacy-modes` 兜底（shell/toml/ruby/swift/lua/dockerfile/powershell）
- **markdown-it 14** Markdown 解析
- **Shiki 1.x** 代码高亮（与 VSCode 同款 TextMate 语法）
- **Zustand 5** 状态管理
- **Tailwind 3** + CSS 变量 主题
- **react-icons (Simple Icons)** 语言品牌 logo

## 目录结构

| 目录 | 语言 | 角色 |
| --- | --- | --- |
| `src/` | TS/TSX/CSS | React 前端（UI、编辑器、预览） |
| `src-tauri/` | Rust | 原生进程（窗口、文件 IO、对话框、菜单） |
| `scripts/` | Bash/PowerShell | 启动 + 打包 + 清理脚本 |
| 根目录 | JSON/JS/HTML | 构建配置（Vite / TS / Tailwind / Tauri） |

通信：前端 `invoke("命令名", { 参数 })` ↔ Rust `#[tauri::command]`，单一通道。

## 架构详解

### 进程模型

```
┌────────────────────────────────────────────────────────────┐
│  WebView 进程（Chromium / WKWebView）                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  React 18 应用                                        │  │
│  │   ├── App.tsx        全局布局 + 键盘 + drop          │  │
│  │   ├── components/    UI 组件                         │  │
│  │   ├── store/editor.ts (Zustand) 单一 store           │  │
│  │   └── lib/           纯逻辑 + IPC 包装               │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↕ invoke()                        │
└─────────────────────────│──────────────────────────────────┘
                          │ JSON IPC
┌─────────────────────────▼──────────────────────────────────┐
│  Rust 主进程                                               │
│   ├── #[tauri::command] 文件 IO / 目录遍历 / 路径解析      │
│   ├── 原生菜单（i18n 同步 + AppKit 注入清理）              │
│   ├── 窗口状态插件（位置/大小记忆）                        │
│   └── tauri-plugin-log（panic hook + 滚动日志）            │
└────────────────────────────────────────────────────────────┘
```

**关键约束**：
- 所有 IO 在 Rust 端，所有渲染在 TS 端，唯一通道是 `invoke()`
- 不开 Tauri shell 插件、不开 fs 插件——前端自由读写文件系统是个安全雷
- 不同步状态：每次 invoke 都是一次性请求/响应，前端缓存自管

### 前端分层

| 层 | 路径 | 职责 |
| --- | --- | --- |
| **Shell** | `App.tsx` | 全局布局拼装、`Cmd+X` 键盘、OS 拖拽、文件菜单事件桥 |
| **UI 组件** | `components/` | 纯展示 + 局部交互。对话框 / 浮层（GotoAnything、CommandPalette、GotoSymbol、FindInFiles、SettingsDialog、DiffView、HexView、ConfirmDialog、PromptDialog、ContextMenu）；专用预览器（XmindView + XmindCanvas）；按文件类型显示的工具条（MarkdownToolbar、JsonToolbar）；语言图标（LangIcon）；统一 Button（`ui/Button.tsx`，JetBrains 视觉）|
| **Store** | `store/editor.ts` | 单一 Zustand store。约 30 个字段，所有跨组件共享状态 |
| **Lib** | `lib/*.ts` | 纯逻辑 / IPC 包装。每个文件单一职责 |
| **入口** | `main.tsx` | React 挂载 + 全局 log handler + tab cache 清理订阅 |

**lib/ 模块清单**：

| 文件 | 职责 |
| --- | --- |
| `fileio.ts` | 所有文件操作：open/save/save-as/close、`openFileByPath` 按类型分流 |
| `lang.ts` | 50+ 扩展名 → CodeMirror lang loader + Shiki id + 图标。是 / 否判定（isMarkdown / isImageFile / isHexFile / 等） |
| `persistence.ts` | 状态序列化/反序列化（走 Rust `read_app_state` / `write_app_state` 写到 `<app_data_dir>/state.json`；老 localStorage 一次性迁移）|
| `fileWatch.ts` | 3s 轮询 `file_mtimes`，clean tab 静默重载 / dirty tab 横幅提示 |
| `fuzzy.ts` | 子序列模糊匹配 + 打分（边界、连击、大小写、前缀、长度惩罚） |
| `diff.ts` | jsdiff 包 → 行对齐的 DiffRow（mod/add/del/eq）|
| `symbols.ts` | 当前文件 outline 提取（按扩展名走 regex） |
| `bookmarks.ts` | CodeMirror StateField + Decoration.line（位置随编辑漂移） |
| `commands.ts` | Command Palette 命令注册表 |
| `shortcuts.ts` | 可启用/禁用快捷键的元数据表 + `isEnabled()` 守卫 |
| `i18n.ts` | 中英扁平 key 表 + `t()` 模板替换 |
| `markdown.ts` | markdown-it 实例（anchor/task-lists 插件） |
| `highlight.ts` | Shiki 单例 + 按需懒加载语言 |
| `export.ts` | HTML / PDF 导出 |
| `editorBridge.ts` | 持有当前活跃 EditorView 引用，跨组件命令访问 |
| `treeRefresh.ts` | 文件树 invalidate 总线（重命名/删除后自动刷新） |
| `logger.ts` | 前端 → Rust 日志桥 + window.error 全局 hook |
| `plantumlHydrate.ts` | PlantUML 块异步渲染（用公共 server，需联网） |
| `mermaidHydrate.ts` | Mermaid 图表懒加载渲染（mermaid ~700KB，按需 import） |
| `localImgHydrate.ts` | Markdown 预览本地图片：`<img data-raw-src>` 重写为 `convertFileSrc()` 出来的 asset:// URL |
| `pathUtil.ts` | 轻量路径工具（`isLocalRef` / `stripFileScheme` / `dirname` / `resolveAgainst`），POSIX + Windows 兼容 |
| `format.ts` | Prettier 包装（standalone + plugin 懒加载），按扩展名走对应 parser，失败返回 null 让调用端兜底 |
| `markdownTable.ts` | Markdown 表格 keymap：Tab / Shift+Tab 跨格、Enter 加新行、对齐分隔行重排 |
| `jsonFormat.ts` | JSON / JSONC / JSON5 智能格式化：`smartFormat` / `compactJson` / `sortKeysFormat`，能解 Python `repr(dict)` 字面量 |
| `codeBlockComplete.ts` | Markdown ` ``` ` 输入后弹出语言名补全（mermaid / plantuml 优先，常用语言其次） |
| `colorPreview.ts` | CodeMirror ViewPlugin：在 hex / rgb / hsl 颜色字面量前画一个小色块 widget，仅可见行 |
| `inspectionMarkers.ts` | IntelliJ 风格右侧 strip：把 bookmarks 等位置在文件高度上等比例打点，点击跳行 |
| `islandLightTheme.ts` / `islandDarkTheme.ts` | 自带的 JetBrains-Island 风格 CodeMirror 主题（替代默认 oneDark） |
| `xmind/parse.ts` | 解析 .xmind 压缩包（fflate）→ workbook / sheets / topics 模型，兼容 v3 (content.json) 与 legacy (content.xml) |
| `xmind/edit.ts` | 把 mind-elixir 节点树写回 .xmind 压缩包，保留 XMind-only 字段（notes / labels / structureClass …）|
| `xmind/layout.ts` | XMind `structureClass` → mind-elixir Direction（right / left / side / down）映射 |

### Rust 后端

`src-tauri/src/lib.rs` 单文件包所有 `#[tauri::command]`。当前命令清单：

| 命令 | 用途 |
| --- | --- |
| `read_text_file` / `write_text_file` | 文本读写 |
| `read_binary_as_base64` / `write_binary_file` | 二进制读写（图片/PDF/音视频/hex/.xmind 用；写用于 XMind 保存等场景）|
| `list_dir` | 文件树懒加载（一层）|
| `list_workspace_files` | Goto Anything 用，递归 DFS（50k 上限）|
| `find_in_files` | Find in Files，含 NUL byte 二进制探测 + 1MB/file 上限 + 5k hits 上限 |
| `replace_in_files` | Find & Replace 全工作区批量替换（基于 `find_in_files` 命中点位） |
| `file_mtimes` | 批量 mtime 轮询（外部变更检测） |
| `path_kind` | "file" / "dir" / "missing"，drop 时分流 |
| `resolve_path` | `~` 展开 + canonicalize |
| `save_image` | 粘贴图片落盘到 `<workspace>/assets/` |
| `create_file` / `create_dir` / `rename_path` / `delete_path` | 文件树右键操作 |
| `print_window` | 触发系统打印对话框（PDF 导出） |
| `add_recent_document` | 把路径推到 OS "最近打开" 列表（macOS Dock / Windows Jump List） |
| `update_menu_state` | 重建原生菜单（语言变化或快捷键开关变化时调） |
| `read_app_state` / `write_app_state` | UI state 文件持久化（`<app_data_dir>/state.json`，stage-and-rename 原子写） |
| `frontend_log` | 前端日志桥转发到 Rust log |

**Rust 侧关键设计**：
- 所有路径过 `expand()`：先 `~` 展开、再 transparent 处理。命令签名都是 `String`，前端不传 `PathBuf`
- `IGNORED_WALK_DIRS` 硬编码 node_modules / target / dist 等，不读 `.gitignore`（要做的话引 `ignore` crate）
- 原生菜单 i18n：`MenuLabels` 25 字段，覆盖 App / File / Edit / Window 四个子菜单**所有项**包括预定义项（about / quit / cut / copy / paste 等），不靠 OS 系统语言
- `strip_macos_edit_menu_extras`：用 objc2 在 set_menu 后扫 NSMenu 把 AppKit 自动注入的 Start Dictation / Emoji & Symbols / AutoFill / Speech / Find / Substitutions / Transformations 全清掉

### 状态管理（Zustand store）

**单一 store**，约 30 个字段，按用途分组：

| 组 | 字段 | 备注 |
| --- | --- | --- |
| 标签 | `tabs / activeId / tabPositions` | tabs[]、当前 active id、cursor + scrollLine 缓存 |
| 工作区 | `workspaces / expandedDirs / compareMarkPath` | 工作区列表、文件树展开状态、对比标记 |
| 主题 / i18n | `theme / language` | |
| 视图开关 | `showPreview / previewMaximized / showSidebar / zenMode / splitEditor` | |
| 编辑器选项 | `editorFontSize / softWrap / showIndentGuides / showWhitespace / showMinimap / autoCloseBrackets` | |
| 自动保存 | `autoSave: "off" \| "onBlur" \| "afterDelay"` | |
| 快捷键 | `shortcuts: Record<id, boolean>` | 全局开关表 |
| 浮层 | `settingsOpen / gotoAnythingOpen / commandPaletteOpen / gotoSymbolOpen / findInFilesOpen` | 浮层都升到 store，让命令面板能触发（FindInFiles 同时承担 Find & Replace） |
| 状态栏 | `activeSelectionLength` | 选区字符数实时显示 |

**Tab 形状**：

```ts
interface Tab {
  id: string;            // crypto.randomUUID()
  filePath: string | null;
  content: string;       // 文本 / 二进制 data URL / 空串
  savedContent: string;  // 用于 dirty 判定
  diff?: DiffSpec;       // 双栏 diff tab
  externalChange?: string;  // 外部变更时暂存的磁盘内容
}
```

**TabPosition**（独立于 tab 数组，按 id 索引）：

```ts
interface TabPosition {
  cursor: number;        // 字符偏移
  scrollTopLine: number; // 1-based 首可见行
}
```

放在外面是因为光标频繁变动，不想触发 TabBar/TitleBar 重渲染。

**CodeMirror state 缓存**（不在 Zustand 里，模块级 Map）：

`Editor.tsx` 顶部有 `editorStateCache: Map<tabId, JSON>`。tab 切换时 Editor 卸载，把 `state.toJSON({history: historyField})` 写进 cache；下次挂载从 cache `EditorState.fromJSON` 恢复，撤销栈跨 tab 切换得以保留。`main.tsx` 订阅 store 在 tab 关闭时清缓存。

### 持久化（state.json，文件式）

**位置**：`<app_data_dir>/state.json`，由 Rust 的 `read_app_state` / `write_app_state` 命令读写
- macOS：`~/Library/Application Support/com.deditor.app/state.json`
- Windows：`%APPDATA%\com.deditor.app\state.json`
- Linux：`~/.local/share/com.deditor.app/state.json`

**为什么不再用 localStorage**：DEditor 是 ad-hoc 无签名打包，每次 build 的 codesign Identifier (`deditor-<随机hash>`) 都不同，WKWebView 把每次新签名当成"另一个 app"，导致 `~/Library/WebKit/com.deditor.app/` 里的 localStorage 在重装后无法被新进程读到。文件方式不依赖 webview 身份，重装/卸载重装都能恢复。

**Schema 仍为 v3**（之前的迁移代码保留）。`loadPersisted()` 优先 `invoke("read_app_state")`；为空则 fallback 读 localStorage v3/v2/v1（一次性迁移，老用户升级不丢标签）；下一次 `doSave` 写入文件成功后扫掉 localStorage。

**写入路径**：`write_app_state` 用 stage-and-rename（写 `state.json.tmp` → `fs::rename`）做原子写，避免半截文件。

**会持久化**（`doSave` 写入）：
- 标签元数据：`filePath / content / savedContent / cursor / scrollTopLine`
- 工作区列表 + 文件树展开状态
- 主题 / 语言 / 字号
- 视图开关：showPreview / showSidebar / previewMaximized
- 编辑器选项：softWrap / showIndentGuides / showWhitespace / showMinimap / autoCloseBrackets
- autoSave / formatOnSave
- 快捷键启用表

**不持久化**：
- diff tab（`filter(t => !t.diff)`）
- 二进制 tab 的 `content`（data URL，可能几 MB；`filePath` 留下，启动时从磁盘 rehydrate）
- 浮层 open 状态、活跃选区长度、CodeMirror history
- zenMode、splitEditor（每次启动重置）

### 关键数据流

**1. 打开文件**

```
FileTree click / Cmd+P / Cmd+O / drag
  → openFileByPath(path)
  → 按扩展名分流：
     ├─ 文本    → invoke("read_text_file") → openTab(path, content) [CodeMirror]
     ├─ 图片    → invoke("read_binary_as_base64") → data:image/...    [<img>]
     ├─ PDF     → 同上                              data:application/pdf [<iframe>]
     ├─ 音/视频 → 同上                              data:audio|video/... [<audio>/<video>]
     ├─ .xmind  → 同上                              data:application/vnd.xmind.workbook [XmindView → XmindCanvas]
     └─ hex     → 同上                              data:application/octet-stream [HexView]
```

**2. 编辑 → 保存**

```
CodeMirror updateListener
  → docChanged: store.setContent  → tab.content 变
  → selectionSet: setActiveSelectionLength + 缓存 cursor (200ms debounce)

Cmd+S
  → saveFile() → invoke("write_text_file") → markSaved (savedContent = content)

autoSave === "onBlur"  → window blur → saveAllDirty()
autoSave === "afterDelay" → store.subscribe → 1.5s debounce → saveAllDirty()
```

**3. 外部变更检测**

```
useFileWatch (App 全局)
  setInterval 3s
  → invoke("file_mtimes", { paths: 所有 named tab })
  → 比对 lastMtimes 缓存
  → 变化时 invoke("read_text_file")
     ├─ tab is clean → 静默写回 content + savedContent
     └─ tab is dirty → tab.externalChange = fresh → 横幅"重载 / 保留我的修改"
```

**4. Goto Anything**

```
Cmd+P → setGotoAnythingOpen(true)
  → modal mount → invoke("list_workspace_files", { roots: workspaces })
  → 输入 query → fuzzyMatch 每条 path → 排序 top-80 → 高亮匹配字符
  → Enter → openFileByPath(选中) → modal close
```

**5. 菜单 / 快捷键 ↔ Rust**

```
Settings 切语言 / 切某条快捷键开关
  → store.shortcuts 变 / store.language 变
  → useEffect([language, shortcuts]) → invoke("update_menu_state", {
       lang, disabledAccelerators: SHORTCUTS.filter(menu类型已禁用).map(id)
     })
  → Rust build_and_set_menu(lang, disabled)
  → strip_macos_edit_menu_extras (objc2)
```

### CodeMirror 集成

**单 view + Compartments**：每个可热切换的 extension 用独立 Compartment 包，运行时 `dispatch(compartment.reconfigure(newExt))`。当前 8 个：

| Compartment | 触发源 | 切换内容 |
| --- | --- | --- |
| `themeCompartment` | `theme` | `islandLight` / `islandDark`（自家 JetBrains 风主题，见 `lib/islandLightTheme.ts` / `islandDarkTheme.ts`） |
| `langCompartment` | `filePath` | 异步 `LanguageSupport` |
| `wrapCompartment` | `softWrap` | `EditorView.lineWrapping` / `[]` |
| `indentCompartment` | `showIndentGuides` | `indentationMarkers()` / `[]` |
| `whitespaceCompartment` | `showWhitespace` | `highlightWhitespace()` / `[]` |
| `minimapCompartment` | `showMinimap` | `showMinimap.of({...})` / `[]` |
| `autoCloseCompartment` | `autoCloseBrackets` | `closeBrackets()` / `[]` |
| `completionCompartment` | `filePath` | Markdown 文件挂 `codeBlockCompletion` + `autocompletion()`，其它文件挂默认 `autocompletion()` |

**始终挂载（不进 Compartment）**：`colorPreview()`（仅文本类文件）、`inspectionMarkers()`、Markdown 表格 keymap（仅 `.md`）。

**自定义 keymap**：在 `keymap.of(...)` 里加在默认前面。所有自定义条目（多光标 / 全选匹配 / Bookmarks）的 `run` 函数会读 store 的 shortcuts 表，禁用时返回 `false` 让按键透出。

**Bookmarks 设计**：用 `StateField<DecorationSet>` + `Decoration.line()`。每个书签是 `[pos, pos]` 0 长度 range。`set.map(tr.changes)` 自动让位置跟编辑漂移。

### 国际化（i18n）

**形式**：`Record<string, string>` 扁平表，两份（ZH / EN）。Key 用点号分组：`statusbar.lnCol`、`shortcut.nav.gotoAnything`、`cmd.file.open`。

**接口**：
- `useT()`：React hook，订阅 store.language
- `tStatic(key, vars?)`：非 React 上下文（fileio.ts、lang.ts 等）

**模板替换**：`"行 {line}, 列 {col}"` → `t(key, { line: "12", col: "5" })`

**新增 key**：必须中英两份都加，否则会落到 `tStatic` 的 fallback（直接显示 key 字符串）。grep `i18n.ts` 检查对称。

### 性能 / 资源边界

| 维度 | 限制 / 策略 |
| --- | --- |
| Goto Anything 索引 | 50k 文件硬上限；每次打开重新走 DFS（典型项目 < 50ms） |
| Find in Files | 5k hits / 1MB per file / NUL-byte 二进制探测 |
| Replace in Files | 复用 Find in Files 的命中点位（同一限制） |
| Hex View | 256 KB 上限；超过部分截断 |
| 文件 mtime 轮询 | 3 秒，每次最多查所有 named tab 的 mtime（一次 IPC 批量） |
| localStorage 配额 | 二进制 tab 不写 content；超额自动降级到元数据-only |
| Editor 重挂载 | `key={tab.id}` 每次切 tab 卸载 + mount。state.toJSON 缓存让感知上"无缝" |
| Vite chunk warning | `dist/index-*.js` 1.3MB（gzip 455KB）—— Shiki 把所有语法包打到一起，预期 |

## 已实现功能（截至 2026-05-02）

**编辑器内核**

- CodeMirror 6 + 50+ 扩展名识别（CodeMirror lang pack + Shiki 高亮同步）
- 多光标（Cmd+Alt+↑/↓ / Cmd+Shift+L / Cmd+D） + 列选（Alt+Drag） + Cmd+Click 加光标
- 折叠（foldGutter + Cmd+Alt+[/]）、缩进引导线、显示空白字符、minimap、自动换行（运行时切换）
- **切 Tab 保留撤销栈**（state.toJSON({history}) 缓存）
- Bookmarks（F2 / F8 / Shift+F8 / Cmd+Shift+F2）随编辑漂移
- 自动保存：关 / 失焦时 / 停止编辑 1.5s 后
- **JetBrains 风格 Island 主题**（自带 light / dark，替代默认 oneDark）
- **颜色字面量预览色块**（hex / rgb / hsl 行内 swatch widget）+ **右侧 Inspection Strip**（bookmark 等位置等比打点 + 点击跳行）
- **自动闭合括号 / 引号**（`autoCloseBrackets`，可在设置中关）
- **代码块 fenced 语言名补全**（Markdown ` ``` ` 后弹候选，mermaid / plantuml 优先）

**文件操作**

- 多 Tab + OS 级拖拽（拖文件打开 / **拖目录加为工作区**）
- 同名文件去重、未保存三按钮确认、Cmd+S/Shift+S 保存/另存
- 图片粘贴落盘 `<workspace>/assets/` + 光标插入 Markdown 链接
- 导出 HTML / PDF（.md 可见）
- **外部变更检测**（3s 轮询 mtime，clean 静默重载、dirty 弹横幅）
- 文件对比（Select for Compare → 另一个文件 Compare with → 双栏 diff）
- **OS 最近打开列表注入**（`add_recent_document`，macOS Dock / Windows Jump List 同步）
- **Prettier 一键格式化**（`lib/format.ts`，懒加载 parser；JS/TS/JSON/CSS/HTML/MD/YAML 等）

**预览能力**

- Markdown 分栏实时预览（仅 .md/.markdown/.mdx），编辑↔预览滚动联动
- markdown-it + Shiki + **PlantUML（需联网）+ Mermaid（懒加载）**
- **本地图片在预览里能直接显示**（`localImgHydrate`：相对路径 → asset:// URL）
- 图片 / PDF / 音视频内嵌预览
- **.xmind 思维导图**（`XmindView`，read-only 渲染 + edit 模式 mind-elixir 编辑回写，保留 XMind-only 字段如 notes / labels / structureClass）
- Office / 压缩包 / 可执行文件等二进制 → hex dump（256KB 上限）

**编辑辅助工具条**

- **MarkdownToolbar**（仅 .md）：B / I / 代码 / 链接 / 列表 / 引用 / 表格 / 分隔线 / 任务列表 / 字号 等
- **JsonToolbar**（仅 .json / .jsonc / .json5）：smart-format（容忍 JSON5 + Python `repr`） / compact / sort keys
- **Markdown 表格 keymap**：Tab / Shift+Tab 跨格、Enter 加新行、对齐分隔行重排

**导航 / 搜索**

- **Cmd+P Goto Anything**：跨工作区模糊文件搜索（fuzzy.ts，50k 文件上限）
- **Cmd+Shift+P 命令面板**：模糊搜索 + 执行（commands.ts 注册表）
- **Cmd+R Goto Symbol**：当前文件大纲（regex-based，支持 MD/JS/TS/Py/Rust/Go/Ruby/PHP/Shell）
- **Cmd+Shift+F Find in Files**：全工作区文本搜索（NUL byte 跳二进制，结果按文件分组）+ **Replace in Files**（全工作区批量替换）
- **Cmd+Alt+G Goto Line** / **Cmd+G 找下一个匹配** / Cmd+F 当前文件查找

**UI / 体验**

- 文件树侧栏：懒加载、`~` 展开、展开状态持久化、右键 (新建/重命名/删除/Reveal in Finder/对比)
- 亮/暗主题（持久化、跟随系统初始）+ 中英文 UI 切换（实时）
- **Cmd+, 设置对话框**：通用（主题/语言/字号/自动保存）+ 编辑器（开关组）+ 快捷键（每条都可禁用）
- **Cmd+K 专注模式**（Zen）+ **Cmd+\\ 分屏编辑**（同 tab 双视图独立光标/滚动）
- macOS / Windows 原生菜单栏（中英文 i18n，**objc2 清掉 AppKit 注入的 Start Dictation / AutoFill / Emoji 等**）
- StatusBar：行/列、选区字符数、EOL（LF/CRLF）、UTF-8、语言、行/字数
- 统一 Button 组件（`ui/Button.tsx`，4 variant × 4 size，pressed 状态用于切换按钮）

**架构 / 工程**

- 文件式持久化 `<app_data_dir>/state.json`（tabs / 工作区 / 主题 / 字号 / 编辑器开关组 / 快捷键表 / 自动保存模式 / ...），重装不丢；老 localStorage 自动一次性迁移
- 语言品牌 logo（Simple Icons / Lucide / Font Awesome）+ 字母 badge 兜底（`LangIcon`）
- 完整日志（Rust panic hook + 前端 error/rejection 转发，10MB 滚动）

## 路线图（按优先级，从上往下做）

**A. Sublime DNA**

- [x] **A.2 Cmd+Shift+F Find in Files**：Rust `find_in_files` 命令（plain text，1MB/file 上限，5k hits 上限）+ `components/FindInFiles.tsx` 面板，结果按文件分组、点击跳到行列
- [x] **A.3 Goto Line**：用 CodeMirror 默认绑定 `Cmd/Ctrl+Alt+G`。`Cmd+G` 留给 "find next"（Sublime / VSCode 通用）
- [x] **A.3 Cmd+R Goto Symbol**：`lib/symbols.ts` 按扩展名做 regex 提取（MD / JS / TS / Py / Rust / Go / Ruby / PHP / Shell），`GotoSymbol` modal 复用 fuzzy.ts
- [x] **A.4 Cmd+Shift+P Command Palette**：`lib/commands.ts` 注册表 + `components/CommandPalette.tsx`

**B. 编辑硬伤**

- [x] **B.1 切 Tab 保留撤销栈**：模块级 `editorStateCache` 存 `state.toJSON({history})`，mount 时 fromJSON 恢复
- [x] **B.2 文件外部变更检测**：`file_mtimes` 批量轮询 + `lib/fileWatch.ts`，clean tab 静默重载、dirty tab 显示横幅让用户选
- [x] **B.3 拖目录到窗口 = 加工作区**：`path_kind` Rust 命令 + drop 处理分流
- [x] **B.4 字体 / 主题 / 语言 / 自动保存 进设置面板**：SettingsDialog 顶部加"通用"分组（含 RadioRow + SliderRow）

**C. 编辑器质感**

- [x] **C.1 Minimap**：`@replit/codemirror-minimap`，Compartment 切换，设置里"显示右侧迷你地图"
- [x] **C.2 Split Pane** (scoped v1)：`splitEditor` toggle，同一 active tab 双视图独立光标/滚动；Cmd+\ 切换。多 pane 多 active tab 留作后续重构
- [x] **C.3 Folding**：`foldGutter()` + `foldKeymap`
- [x] **C.4 Bookmarks**：`lib/bookmarks.ts` StateField + Decoration.line（位置随编辑漂移）；F2 切换 / F8 下一 / Shift+F8 上一 / Cmd+Shift+F2 清空
- [x] **C.5 Distraction-free 模式**：`zenMode` store + Cmd+K 切换，隐藏 TitleBar / TabBar / Sidebar / StatusBar
- [x] **C.6 Indent guides / 显示空白**：`@replit/codemirror-indentation-markers` + `highlightWhitespace()`

**D. StatusBar 增强**

- [x] **D.1 光标行/列 + EOL（CRLF/LF）+ UTF-8**：StatusBar 读 `tabPositions` + content 检测
- [x] **D.2 Soft wrap 开关**：Compartment 运行时切，Settings 勾选
- [x] **D.3 自动保存 / 失焦自动保存**：`saveAllDirty()` 工具 + App.tsx 监听 blur / 1.5s debounce，三档可选（关 / 失焦 / 停止编辑后）

**E. 0.6.0 — 格式化 + 工具条**

- [x] **E.1 Prettier 一键格式化**：`lib/format.ts` 包装 prettier/standalone，按 ext 选 parser，所有 plugin 懒加载（JS/TS/JSON/CSS/HTML/MD/YAML 等）
- [x] **E.2 Markdown 表格 keymap**：`lib/markdownTable.ts`，Tab/Shift+Tab 跨格、Enter 加新行、对齐分隔行重排
- [x] **E.3 JSON / Markdown 工具条**：`JsonToolbar` (smart-format 兼容 JSON5 + Python repr / compact / sort keys) + `MarkdownToolbar`（粗斜体/列表/链接/表格/字号等）
- [x] **E.4 Find & Replace in Files**：Rust `replace_in_files` + 前端面板复用 FindInFiles
- [x] **E.5 OS 最近打开列表**：`add_recent_document` 注入 macOS Dock / Windows Jump List

**F. 0.7.0 — JetBrains 化**

- [x] **F.1 Island Light/Dark 主题**：`lib/islandLightTheme.ts` / `islandDarkTheme.ts`（替代 oneDark）
- [x] **F.2 颜色字面量行内色块**：`lib/colorPreview.ts` ViewPlugin，仅可见行渲染 hex/rgb/hsl swatch
- [x] **F.3 Inspection Strip**：`lib/inspectionMarkers.ts` 把 bookmarks 在文件高度上等比打点 + 点击跳行
- [x] **F.4 统一 Button 组件**：`components/ui/Button.tsx`，4 variant × 4 size + pressed 状态
- [x] **F.5 LangIcon**：抽出语言图标渲染（Simple Icons + Lucide + 字母 badge 兜底）
- [x] **F.6 .xmind 预览 + 编辑**：`lib/xmind/{parse,edit,layout}.ts` + `XmindView` + `XmindCanvas`，read 模式锁交互、edit 模式 mind-elixir，回写时保留 XMind-only 字段
- [x] **F.7 自动闭合括号 + 代码块语言补全**：`closeBrackets()` + `lib/codeBlockComplete.ts`
- [x] **F.8 Markdown 预览本地图片**：`lib/localImgHydrate.ts` + `lib/pathUtil.ts`，相对路径 → asset:// URL
- [x] **F.9 Mermaid 渲染**：`lib/mermaidHydrate.ts` 懒加载（mermaid ~700KB）

**0.7.0 / 0.8.0 之后续做主要是细节打磨**（StatusBar 行为、Editor 主题色微调、JsonToolbar 文案、TitleBar 视觉等）。

**其它已搁置**（按需再开）：

- KaTeX 数学公式
- 大纲（TOC）侧栏（Goto Symbol 完成后再考虑常驻面板）
- 文件树搜索框
- WYSIWYG 模式：已接入核心阅读编辑与只读模式，原生双平台验收待补，详见 [Markdown 可视化编辑接续上下文](docs/markdown-visual-editing-context-2026-09-11.md)；完整验收以实施记录为准。

## 启动 / 打包 / 清理

```sh
./scripts/start.sh                # 开发（mac/linux）：默认只清 node_modules/.vite，保留标签 / 工作区
./scripts/start.sh --no-reset     # 连 vite 缓存都不清（启动稍快）
./scripts/start.sh --reset-state  # 额外清掉 ~/Library/WebKit/com.deditor.app
                                  # （会丢标签 / 工作区 / 设置；DEditor 必须先退；只在 localStorage 状态真的坏了时用）
.\scripts\start.ps1               # Windows 等价（默认只清 .vite）
.\scripts\start.ps1 -NoReset      # Windows: 连 vite 也不清
.\scripts\start.ps1 -ResetState   # Windows: 额外清 %LOCALAPPDATA%\com.deditor.app\EBWebView

./scripts/build-mac.sh       # 出 .dmg（自动复制到 scripts/）
./scripts/build-mac.sh --universal   # arm64 + x64 通用包
.\scripts\build-win.ps1      # 出 .msi + .exe

./scripts/clean.sh           # 清 build 产物（target/dist/scripts里的安装包）
./scripts/clean.sh --all     # 上面 + node_modules + package-lock.json
./scripts/clean.sh --dry-run # 预演，不真删
```

## 关键约定

### 1. 脚本写法必须 POSIX 兼容

`scripts/*.sh` 必须在 macOS bash、macOS sh（bash --posix 模式）、Linux dash 三个环境下都能跑。

**禁用**：进程替换 `< <(...)`、bash 数组、`<<<` herestring、`=~` 正则。
**优先**：`[ ]` 而非 `[[ ]]`、`for x in dir/*.ext` 而非 `find ... | while read`。

写完用 `bash -n script.sh && sh -n script.sh && echo ok` 双校验。

第一次 `build-mac.sh` 报 `syntax error near unexpected token <` 就是因为用了 `done < <(find ...)`，已改成 for-glob 模式。

### 2. 命名

- App 显示名：`DEditor`（首字母 D 大写）
- Cargo / npm 包名：`deditor`（小写，无连字符）
- Bundle identifier：`com.deditor.app`
- 不要意外引入回 `M Editor` / `m-editor` / `m-client`（旧名，已全替换）

### 3. 加新语言支持

1. `src/lib/lang.ts` 的 `ext` 表：加扩展名 → CodeMirror loader + Shiki 名 + 图标
2. （可选）`src/lib/fileio.ts` 的 `MD_FILTER`：加扩展名（打开对话框过滤）

文件树侧默认显示**所有**非隐藏文件（`list_dir` 不再按扩展名过滤）。隐藏目录（`.git` 等）继续屏蔽；隐藏文件白名单见 `src-tauri/src/lib.rs` 的 `ALLOWED_NAMES`（`.gitignore` / `.env` 等）。

## 日志系统

- Rust 端：`tauri-plugin-log` 写到 `~/Library/Logs/com.deditor.app/deditor.log`（macOS），10MB 滚动 / KeepAll。同时输出到 stdout 和 webview console
- 装了 panic hook（`install_panic_hook`），所有 Rust panic 都会落到日志（含文件:行:列 + 消息）
- 前端：`src/lib/logger.ts` 的 `logError/logWarn/logInfo` 通过 `invoke("frontend_log", ...)` 转发到 Rust
- 全局 hook（`installGlobalLogHandlers` 在 main.tsx 调用）捕获 `window.error` 和 `unhandledrejection`
- 加新错误处理时务必在 catch 里 `logError("X 操作失败", err)`，让日志能复现问题
- 不要把每次按键这种高频事件 log 进去，只 log 关键节点（操作开始/结束/失败）

## 已知坑

### macOS DMG Finder 图标必须三步走

`tauri icon` 生成的 `.icns` 是 data-fork 格式，`DeRez` 直接读会报 `eofErr (-39)`。

正确路径（已写入 `scripts/build-mac.sh`）：

```bash
SRC_PNG="src-tauri/icons/128x128@2x.png"
TMP_PNG="$(mktemp -t deditor-pngicon).png"
TMP_RSRC="$(mktemp -t deditor-rsrc).rsrc"

cp "$SRC_PNG" "$TMP_PNG"
sips -i "$TMP_PNG" >/dev/null              # 关键：把 PNG 自身烤出图标 resource
DeRez -only icns "$TMP_PNG" > "$TMP_RSRC"  # 从烤好的 PNG 提取 icns resource
Rez -append "$TMP_RSRC" -o "$DMG"          # 追加进 dmg 的资源叉
SetFile -a C "$DMG"                        # 标记 "Has Custom Icon"
```

不要直接 `DeRez -only icns icon.icns`。备选 `fileicon` cli 或 PyObjC 都需要额外依赖。

## 关键路径

| 用途 | 路径 |
| --- | --- |
| 源 logo PNG | `deditor.png`、`dddeditor.png` |
| 应用图标全套 | `src-tauri/icons/`（icon.icns / icon.ico / 各尺寸 PNG） |
| Rust 命令 | `src-tauri/src/lib.rs` |
| Tauri 配置 | `src-tauri/tauri.conf.json` |
| 前端入口 | `src/main.tsx` → `src/App.tsx` |
| Zustand store | `src/store/editor.ts`（导出 `DEFAULT_CONTENT` 欢迎文档常量） |
| 持久化 | `src/lib/persistence.ts` → Rust `read_app_state` / `write_app_state` → `<app_data_dir>/state.json`（schema v3；首次启动从老 localStorage 迁移） |
| .dmg 最终位置 | `scripts/DEditor_<ver>_<arch>.dmg`（build-mac.sh 自动 cp） |
| .dmg 原始位置 | `src-tauri/target/release/bundle/dmg/...` |
| Cargo target（4GB+） | `src-tauri/target/`（clean.sh 删这个） |
| 持久化 state.json（macOS） | `~/Library/Application Support/com.deditor.app/state.json` |
| 持久化 state.json（Windows） | `%APPDATA%\com.deditor.app\state.json` |
| 持久化 state.json（Linux） | `~/.local/share/com.deditor.app/state.json` |
| WebView localStorage（已弃用） | `~/Library/WebKit/com.deditor.app/WebsiteData/LocalStorage/`（仅老版本残留，启动迁移后会被清掉） |
| 日志文件（macOS） | `~/Library/Logs/com.deditor.app/deditor.log`（10MB 滚动，KeepAll） |
| 日志文件（Windows） | `%LOCALAPPDATA%\com.deditor.app\logs\deditor.log` |
| 日志文件（Linux） | `~/.local/share/com.deditor.app/logs/deditor.log` |

## 想改 X 看哪里

| 任务 | 改这里 |
| --- | --- |
| 加新支持的语言 / 扩展名 | `src/lib/lang.ts` 的 `ext` 表（CodeMirror loader + Shiki id + 图标） |
| 加新文件类型分流（视频之类） | `src/lib/lang.ts` 加 `is*File()` + `src/lib/fileio.ts` 的 `openFileByPath` 分流 + `src/components/Editor.tsx` 加渲染分支 |
| 加新 Rust 命令 | `src-tauri/src/lib.rs` 加 `#[tauri::command] fn xxx(...)` + `invoke_handler![]` 注册 |
| 加新 React 组件 | 放进 `src/components/`，UI 状态如要全局共享则加进 `store/editor.ts` |
| 加新快捷键（可禁用的） | `src/lib/shortcuts.ts` 加 `ShortcutId` 枚举值 + `SHORTCUTS` 元数据 + `App.tsx` 的 keydown handler 加分支 |
| 加新命令面板命令 | `src/lib/commands.ts` 的 `COMMANDS` 数组追加，必要时加 `cmd.*` i18n key |
| 加 Markdown 插件 | `src/lib/markdown.ts` 里 `md.use(...)` |
| 加菜单项 / 改菜单标签 | `src-tauri/src/lib.rs` 的 `MenuLabels` + `build_and_set_menu`，前端 `App.tsx` 的 `menu-action` 监听 |
| 改主题色（UI） | `src/styles.css` 顶部 `:root` 和 `.dark` 的 CSS 变量 |
| 改 CodeMirror 主题 | `src/lib/islandLightTheme.ts` / `islandDarkTheme.ts` 顶部 `PALETTE` 常量 |
| 加 Markdown 工具条按钮 | `src/components/MarkdownToolbar.tsx`（用 `editorBridge` 的 `wrapSelection` / `prefixLines` / `insertText`） |
| 加 JSON 格式化算子 | `src/lib/jsonFormat.ts` 加导出函数 + `src/components/JsonToolbar.tsx` 加按钮 |
| 加 Prettier 支持的扩展名 | `src/lib/format.ts` 的 parser map |
| 加 .xmind 字段保留 | `src/lib/xmind/edit.ts` 的 `_xmind` 字段；read 模型在 `parse.ts` |
| 加颜色字面量识别 | `src/lib/colorPreview.ts` 的正则 |
| 加 Inspection Strip 标记类型 | `src/lib/inspectionMarkers.ts`（接入新的 StateField）|
| 改 Tab 形状 / store 字段 | `src/store/editor.ts` + `src/lib/persistence.ts`（v3 schema 加可选字段，read 时合并默认）|
| 改窗口大小 / 标题 / identifier | `src-tauri/tauri.conf.json` |
| 改启动 / 打包 | `scripts/` 下对应平台脚本 |
| 加前端依赖 | `npm install xxx` |
| 加 Rust 依赖 | `src-tauri/Cargo.toml`（macOS-only 用 `[target.'cfg(target_os = "macos")'.dependencies]`） |
| 调 CodeMirror 行为（运行时可切换） | `src/components/Editor.tsx` 加 `Compartment` + 对应 `useEffect` reconfigure |

## 协作偏好

### 验证数据红线（铁律）

- 适用范围：仅限 DEditor 项目空间，不作为其他项目或全局个人偏好。
- 每次验证必须自己创建测试文件或测试样例，只读取本次自行创建的测试文件或用户主动提供的文件。
- 禁止为验证主动查找、打开或读取用户已有的本地文件，包括真实文档、应用历史记录、持久化状态及其引用文件；除非用户主动提供该文件。
- 验证所需的数据必须自行构造；不能用“排查问题”“复现真实场景”等理由绕过这条红线。

### 回复风格

- **简洁直答**：问 X 答 X，不长篇铺垫；技术细节用表格/列表压缩
- **不写 emoji 到文件**（README、脚本、代码、AGENTS.md 自身）；对话里也避免
- 大块改动后给 1-2 句"做了什么 / 下一步可以做什么"收尾，不写大段总结

### 决策模式

- **探索性问题给 2-3 方案 + 主要权衡，让他选**，不直接做。例如"目录是不是太乱了"应该先列方案 A/B/C 等点头，而不是动手重构
- 一旦点了方案就直接做完，中间不要再确认细节
- 选项要明确推荐哪个 + 为什么

### 范围控制

- **不擅自重构** —— 文件多/名字怪/路径深这类美学问题，**优先加文档说明**而不是改结构
- **接受工具/框架的标准约定**（Tauri 用 src-tauri、Vite 配置在根、Cargo target 路径等）—— 改这些代价高、收益低
- 加新功能不要顺手"清理"周边代码，按要求做完为止

### 性能优化的红线 — 不能改变原始功能

**这是绝对底线。性能改动的前提是"用户行为完全等价"。**

- 改了选择器 / 缓存策略 / 并行化 / 算法 / 等等 —— 行为表面**必须与改之前完全一致**：相同输入 → 相同输出、相同顺序、相同副作用时机、相同错误处理路径
- 一旦发现某个优化会改变功能（哪怕是看似无害的"打开多文件的 tab 顺序"、"错误日志格式"、"快捷键反馈延迟"等），**先停下来跟我确认**，不要先做后报
- 不要假设"用户大概不会用这个功能"或"这个边角行为不重要" —— 行为变化必须明确征求同意
- 已经踩过的坑：
  - `openMany` 并行化曾让拖入文件 tab 顺序不确定 —— 行为变化，回滚后改成顺序保留
  - `find_in_files` walk-then-scan 改变了 hits 在密集匹配下的截断时机 —— 仍是行为变化，未确认前应该先问
  - `panic = "abort"` 让 Drop 在崩溃时不执行 —— Rust 行为变化
- 例外只有一种：**纯内部的实现细节**（比如内存中如何缓存、用什么数据结构、模块加载时机），用户不会从任何对外接口感知到差异。这种自由改

### 性能优化的报告格式

任何性能相关改动后，**必须给出对比报告**，三段缺一不可：

1. **测试前（BEFORE）** —— 具体数字，不是形容词
   - bundle 维度：入口 chunk 大小（KB / MB）
   - 时延维度：操作的实测毫秒数（用 `npm run perf:*` 套件、`cargo bench`、或贴入 DevTools 的 `DPerf.oneKey()`）
   - render 维度：重渲次数（用 `perf:react` 的 Profiler 报告）

2. **测试后（AFTER）** —— 同样的指标，同样的工具，同一台机器，**多跑几轮取稳定值**

3. **提升量（DELTA）** —— 绝对值 + 百分比 + 一句"代价是什么"
   - 例：`入口 chunk 310KB → 1.0MB（+700KB，+225%）。代价：冷启动多 ~80ms 解析；首次点击编辑器 / 首次 .md / 首次 Cmd+P 全瞬间`
   - 例：`Cmd+Shift+F 5k 文件 107ms → 36ms（-71%，2.9x）。代价：无；rayon 已经在依赖中`

跑回归测试：`npm run perf:all` —— 任何一项失败必须先解释清楚再继续。

`scripts/perf-*` 系列脚本是这套对比的工具箱，新加优化请同时加 / 更新对应的测试用例，跑 `perf:all` 把它接入。

### 开发完成后的测试要求 — 3 到 5 轮，每轮不同用例

任何开发任务（修 bug / 新功能 / 性能改动 / 重构 / 合并冲突解决）完成后，**必须跑 3-5 轮测试**，每轮使用**不同的测试用例**，覆盖不同维度：

- **轮 1**：基础正向用例（happy path）—— 最常见的用户操作流，确认主路径没坏
- **轮 2**：边界用例 —— 空输入、超长输入、null、零、极大值、Unicode / CJK、单一元素等
- **轮 3**：交互组合用例 —— 同时打开多个 / 快速切换 / 并发触发、状态相互依赖的场景
- **轮 4**（可选）：异常 / 错误路径 —— 文件不存在、IPC 失败、网络断开、权限被拒
- **轮 5**（可选）：回归用例 —— 用最近修过的相邻 bug / 历史踩过的坑作为用例，确保没复活

**每轮的报告格式：**

```
轮 X — 用例：<一句话描述>
  期望：<预期行为>
  实测：<实际行为 / 测试输出>
  结果：✅ / ❌
```

不同 task 类型对应的"不同维度"参考：

| 任务类型 | 轮 1 | 轮 2 | 轮 3 | 轮 4 | 轮 5 |
| --- | --- | --- | --- | --- | --- |
| 修 bug | 复现原报告 | 边界条件 | 多实例 / 并发 | 异常路径 | 相邻 bug 不复发 |
| 新功能 | 主路径 | 输入边界 | 与现有功能交叉 | 失败处理 | 已知坑回归 |
| 性能改动 | `perf:all` 跑通 | 极端规模（100×、10000×）| 多操作组合 soak | 资源耗尽 | 历史回归点 |
| 合并冲突 | TS check + build | `perf:all` | 双方都改过的功能各跑一遍 | （N/A）| 上次合并踩过的坑 |

**不要拿同一个用例反复跑 N 次刷验证次数** —— 那只能证明"重复执行同样的代码会得到同样的结果"，不能证明功能正确。

### 环境

- macOS Darwin Apple Silicon (`aarch64`)
- Node 22 + npm 11，registry：`https://registry.anpm.alibaba-inc.com`（阿里内部镜像）
- Rust stable，`~/.cargo/config.toml` 走 rsproxy.cn 镜像
- 已装 Xcode CLI Tools（有 sips / Rez / DeRez / SetFile / xattr）
- 第一次接触 Tauri / Rust 桌面开发，前端（React/TS）熟


## UI 开发规范与统一标准（2026-09-09）

新增或修改界面时，先复用下面的共用组件和样式。相同用途的控件必须具有相同的尺寸、字体、圆角、间距及 normal / hover / active / selected / disabled / focus 状态，不允许按文件类型再复制一套近似实现。

| 对象 | 唯一入口与规格 |
| --- | --- |
| 普通按钮 | `src/components/ui/Button.tsx`。primary / secondary / ghost / danger；sm：11px 字号、3px 10px 内边距；md：12px、5px 12px；圆角 4px。弹窗确定/取消统一 md，不允许各弹窗覆写字号、padding。 |
| 图标按钮 | Button 的 icon（24px）/ iconLg（28px），图标默认 14px。关闭统一 `FiX`；禁止以 `×`、`✕` 文本字形代替。标签关闭属于紧凑场景，允许 20px 点击框；保留未保存圆点。标签条的新建/列表入口允许 32px 整条高度，仍使用 icon 消除文字按钮 padding。 |
| 分段控件 | `src/components/ui/SegmentedControl.tsx`。高度 24px、圆角 5px、12px/600 字体、左右内边距 10px。设置选项用 radio 语义，视图切换用 pressed 语义，共享视觉规则。Markdown/HTML 通过 `PreviewModeSwitch` 绑定 store。 |
| 文件工具栏 | `.document-toolbar`；Markdown 外壳 `.md-toolbar-shell`。高度含底边框共 36px（`--toolbar-height`），左右内边距 8px，间距 4px。Markdown 内层高度为 35px，避免外壳边框额外增加 1px。 |
| 文本输入框 | `.deditor-input`：32px 高、13px 字号、6px 10px 内边距、4px 圆角。紧凑路径/搜索框增加 `.deditor-input--compact`：24px 高、12px、3px 8px。命令/文件/符号快速导航沿用大搜索框，添加 `.deditor-palette-input`。 |
| 焦点与禁用 | 输入框 focus 用 accent 边框及 1px 外环；按钮 focus-visible 用 2px accent 轮廓；分段控件使用内轮廓避免裁切，选中项用白色轮廓。禁止只设 outline:none 而无替代反馈。禁用控件透明度 0.5、not-allowed 光标，不能响应点击。 |
| 错误提示 | 需要用户关闭的提示调用 `src/lib/feedback.ts` 的 `showError()`，复用排队的 ConfirmDialog；禁止新增 `window.alert()`。局部错误使用 `.deditor-notice` + `data-tone="error"` + `role="alert"`；普通状态使用同一类 + `role="status"`。超长错误正文在弹窗内部滚动（最高 50vh），保持关闭按钮可见。原始异常仍在 catch 中用 logError 记录，不吞掉。 |
| 浮层与主题 | 弹窗遮罩使用 `--modal-backdrop`，弹窗/弹出层阴影分别使用 `--shadow-modal` / `--shadow-popup`。错误、危险按钮、成功、警告使用 `--error-text` / `--error-bg` / `--danger-fill` / `--success-text` / `--warning-bg`；拖拽指示使用 `--accent`。 |

### 实现边界

- Button 的背景、边框颜色、hover / active / disabled 由 `src/styles.css` 管理。不要在行内 style 中写背景或状态颜色，否则会覆盖 CSS 伪类。行内 style 仅用于必要的布局适配；同类控件的例外必须写明用途。
- 切换按钮用 `pressed` 同时表达视觉与无障碍状态；选中后的 hover / active 必须保留选中底色。CodeMirror 自带查找栏通过 `.cm-button` / `.cm-textfield` 适配到 sm 按钮和 compact 输入框规格，包含焦点、悬停与禁用状态；窄窗口允许换行，并为关闭按钮预留空间，不能裁掉替换操作。
- 不使用全局 input/button 选择器统一应用外观；使用 `deditor-*` / 工具栏类，避免污染 Markdown 正文、HTML iframe 和专用预览器。
- HTML 正文保留文件自身排版；代码、阅读正文与应用控件可使用不同字体。语言品牌图标及用户指定颜色属于内容，不按错误/主色 token 强制替换。
- XMind 正在独立改造，当前不调整 `XmindView.tsx`、`XmindCanvas.tsx`、`xmind.css` 的布局与专用控件。修改共用 Button / 全局 token 时需运行 XMind 相邻回归，避免间接破坏其行为。
- 所有新文案同步补齐 `src/lib/i18n.ts` 的中英文；纯图标按钮必须提供本地化 title 或 aria-label。替换关闭按钮时保留事件冒泡控制、dirty 标记及原本动作。
- 错误弹窗异步排队，必须在显示下一条消息时重置错误 tone，保留 Esc/Enter/Tab 和关闭后的焦点恢复；不要使错误提示阻断无关保存队列。

### 验证要求

除本文件已有的 3–5 轮不同用例测试要求，还需按改动覆盖：亮/暗主题、normal/hover/active/selected/disabled/focus、键盘 Tab/Enter/Esc、720px 窄窗口、切换文件类型/多标签、长错误信息和错误后继续操作。共享样式必须做浏览器实际布局/焦点检查；DOM 单测不能替代尺寸与颜色验证。

完成后运行 `npm run test:regression` 与 `npm run build`。报告分别说明修改内容、不同轮次的预期/实测/结果，以及未验证的原生平台范围；不能把 jsdom 结果宣称为 macOS/Windows 安装包验证。


## Markdown 非导出扩展接续（2026-09-12）

用户要求处理 Typora 差距，排除导出，并继续保持字体与真实 Preview 一致。最新实施见 [非导出扩展记录](docs/markdown-extended-editing-2026-09-12.md)：带脚注正文、定义和提示块直接编辑；高亮/上下标/表情简写；按文档图片目录和本地图片整理；已编辑的普通单行行内片段局部解析。隔离全量回归通过，macOS 自建样例实际编辑、菜单保存和两张图片复制已有证据。真实拼音候选、Windows、图床等边界未验收或未实现，不得计为全部 Typora 功能完成。用户随后已否定自行提交：本次不提交、不推送，不以提交作为停止条件。保护独立 XMind 修改。

图片根目录与复杂文档后续：`typora-root-url` 已统一到 Preview、阅读编辑和图片整理；修复行内图换行/基线、HTML figure 间距及整理时并发覆盖，局部解析扩大到边界明确的多行正文/引用/表格。最终隔离全量含 68 项集成通过，实际复杂样例根目录编辑/撤销及亮暗/窄窗已有证据，见 [后续验证](docs/markdown-extended-editing-2026-09-12.md)。每次输入的全文索引、真实拼音、Windows、图床等仍未完成，不能声明整体完成；本任务未执行提交或推送。

原生 IME 再次尝试已补充事件诊断：一次未记录的 ni hao → 你好及撤销中间态尚待复现；带记录测试共 95 事件、composition 为 0，仍不能计为真实拼音通过。工具拒绝单独 Shift 修饰键，系统输入菜单控制超时。诊断入口仅用于隔离快照，不在正式 main/index 中引用，详见上述验证记录末节。
