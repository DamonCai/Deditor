# Markdown 阅读编辑快捷操作清单（2026-09-27）

本清单来自当前源码与锁定的 Milkdown/Crepe 7.22.1、CodeMirror 实现，不是从其他编辑器的说明猜测而来。`Mod` 指 macOS Command、Windows/Linux Ctrl；应用窗口级处理有些同时接受 Ctrl/Command。输入规则主要在可编辑正文文本块中生效；组合输入期间、自定义源码块、内嵌 CodeMirror 的分派不同。这里记录代码行为，不新增原生物理键盘验收结论。

## 输入即转换

序列中的「空格」是实际按空格键；不是把字符串粘贴进去，也不是输入字母“空格”。大部分规则在文本块开头匹配。符号自动配对开启时，项目会先移除自己生成的闭合符，再把列表、围栏、公式前缀交回规则处理。

| 输入序列 | 条件与作用 | 代码证据 |
| --- | --- | --- |
| `-`、`+` 或 `*` 后空格 | 当前文本块开头（可有前导空白）变无序列表；不是必须 Tab 后才成为列表 | `preset-commonmark/src/node/bullet-list.ts:89` |
| `1.` 后空格；也可其他数字 | 变有序列表，以该数字为开始序号；与紧邻前列表顺序相符时可合并 | `ordered-list.ts:96` |
| 列表项开头 `[ ]` 后空格 | 将已有普通列表项变未完成任务；典型完整逐键序列 `- [ ] ` | `preset-gfm/src/node/task-list-item.ts:114` |
| 列表项开头 `[x]` 后空格 | 变已完成任务；该即时规则只识别小写 x；不要把文件解析的 `[X]` 支持等同此规则 | 同上 |
| `>` 后空格 | 当前文本块包为引用 | `blockquote.ts:60` |
| `#` 到 `######` 后空格 | 转成对应绝对等级标题；项目移除了上游相对等级规则 | `src/lib/markdownVisual/heading.ts:6` |
| 三个反引号，可跟小写语言名，再空格 | 转围栏代码块；如三个反引号后 `js`、`mermaid`、`plantuml` 加空格。空语言可继承默认代码语言偏好 | `code-block.ts:102`；`inputAssist.ts` |
| `---` | 段首第三个连字符即可转分隔线，不要求额外空格 | `hr.ts:47` |
| `___` 后空格、`***` 后空格 | 转分隔线 | 同上 |
| `**文字**`、`__文字__` | 闭合时粗体，受单词/URL边界排除条件约束 | `strong.ts:88` |
| `*文字*`、`_文字_` | 闭合时斜体；下划线要求词边界且内容首尾非空白 | `emphasis.ts:75,93` |
| 反引号包围文字 | 闭合时行内代码 | `inline-code.ts:99` |
| `~~文字~~` | 删除线，项目替代上游规则 | `src/lib/markdownVisual/shorthand.ts:31` |
| `==文字==` | 高亮；首尾不可空白 | `shorthand.ts:25` |
| `~文字~`、`^文字^` | 下标、上标；内容不可有空白或同类分隔符 | 同上 |
| `$公式$` | 行内数学节点；内容不可再含 `$` | `crepe/src/feature/latex/input-rule.ts:10` |
| `$$` 后空格 | 语言为 `LaTeX` 的公式块 | 同上:22 |
| `:有效表情名:` | 转表情节点；反斜杠转义不会触发 | `shorthand.ts:32` |
| `:表情名前缀` | 在段首或空白/左括号后出现候选；↑/↓选候选，Enter/Tab确认，Esc关闭本次候选 | `inputAssist.ts` |
| `\|3x2\|` 后空格 | 直接建立3列、2行表格（第一行是表头）；X也可大写，行数至少2 | `preset-gfm/src/node/table/input.ts:29`；`utils/create-table.ts` |
| 顶层独立段落输入 `/` 或 `/关键词` | 打开快捷插入；支持表格、代码、Mermaid、PlantUML、任务、二级标题、无序列表、引用、分隔线；↑/↓选择、Enter插入、Esc关闭、Tab关闭后继续普通Tab分派 | `src/lib/markdownVisual/quickInsert.ts` |

引用上游文件的路径前缀为 `node_modules/@milkdown/`。图片和链接的 Markdown 文件解析/粘贴支持不等于“输入到右括号就必然转换”：当前 CommonMark composed inputrules 没有安装它导出的 `insertImageInputRule`，也没有可承诺的独立链接即时快捷规则。四个以上反引号、波浪线围栏、`[TOC]`、脚注、frontmatter 等可以作为文件/源码内容解析，但不能将它们全部列成已实现的逐键自动转换。

## Tab、层级与表格（含本轮整表缩进）

| 光标/选区位置 | Tab | Shift+Tab |
| --- | --- | --- |
| 普通正文段落 | Crepe indent 插件在选区末端插入4个空格；不是批量段落CSS缩进 | 没有对称的项目正文“删4空格”绑定，继续默认分派 |
| 普通列表项 | 下沉到前一个兄弟列表项下；首个普通项没有前兄弟时消费按键但不插空格 | 提升一级，必要时退出列表 |
| 列表项内后续段落/标题 | 正向按列表命令处理 | 只提升当前后续块，不把整个原列表项一起移动 |
| 独立任务或任务缩进项 | 无法建立普通前兄弟嵌套时增加持久化 `taskIndent`；其余可走真正列表嵌套 | 减少 `taskIndent` 或提升真实列表层级 |
| 普通单元格文字光标、部分矩形单元格选区 | 下一格；末格增加一行并进新行首格 | 上一格；首格停留 |
| **选中整个表格节点，或覆盖全部行列的单元格矩形** | **整个表格增加一级缩进，每级2em** | **整表减少一级，最低0** |
| 单元格内部有列表 | 普通Tab仍属于单元格导航，不当成列表降层 | 普通Shift+Tab仍属于单元格导航 |
| 代码/保留源码的内嵌编辑器 | CodeMirror indentWithTab 缩进代码 | 反缩进代码 |

整表缩进是本轮新增的独立表格属性，不要求将表格放进列表。`Tab` 有 composition、Ctrl/Command/Alt 与跨块选区保护；不能把任何看起来蓝色的跨段文字选区都称作选中整个表格。证据：`src/lib/markdownVisual/tableKeys.ts`、`listKeys.ts`、`node_modules/@milkdown/plugin-indent/src/index.ts`、`crepe/src/core/builder.ts`。

整表缩进在 Markdown 首个表头单元格保存 `<!-- deditor:table-indent=N -->`。这是DEditor扩展：其他标准Markdown阅读器仍能看到表格内容，但通常不保留其视觉缩进；DEditor阅读/预览以及携带数据属性与行内样式的富文本往返保留缩进。局部表格片段复制不带原整表缩进。

## 正文、列表、表格的键盘命令

| 按键 | 位置与实际动作 |
| --- | --- |
| Enter | 正文分段；普通列表拆出下一项；已完成任务拆出的新任务恢复未完成。空项/仅硬换行的项按条件退出或提升列表/引用 |
| Shift+Enter | 正文硬换行；表格内保留为 `<br>`，不离开单元格 |
| Enter（表格文字光标） | 单元格硬换行；矩形选格时先进入其头端单元格编辑，不清空矩形 |
| Mod+Enter（表格内） | 在整表之后插入普通段落并把光标移过去 |
| Backspace | 常规删除；刚触发输入规则时可撤回输入规则；空自动配对时成对删除；任务/标题/列表开头存在优先提升处理 |
| Delete（同级任务项末尾） | 条件满足时与下一任务项合并，保留一致的任务显示缩进 |
| Mod+B / Mod+I | 粗体/斜体；阅读编辑正文中的Mod+B特意不触发应用侧栏 |
| Mod+Alt+X | 删除线 |
| Mod+Alt+1…6 / Mod+Alt+0 | 转对应标题 / 普通段落 |
| Mod+Alt+7 / Mod+Alt+8 | 包为有序 / 无序列表 |
| Mod+Shift+B | 包为引用 |
| Mod+Alt+C | 建代码块 |
| Mod+] / Mod+[ | 上游注册列表下沉/提升和表格前后格命令；表内嵌列表有命令竞争，不能承诺是自定义Tab所有任务缩进语义的别名 |
| Mod+Z / Mod+Shift+Z / Mod+Y | 项目共享Markdown历史撤销/重做，不使用独立投影历史 |
| Mod+C / Mod+X / Mod+V | 正常复制/剪切/粘贴；普通文本复制为可见文本，富文本HTML另保留格式 |
| Mod+Shift+C / Mod+Shift+V | 明确纯文本复制 / 读取纯文本剪贴板并字面插入，支持正文/表格/行内源码/内嵌代码；复制要求非空选区 |
| Mod+A | 正文全选（ProseMirror基本键位）；不是自动把任意表格内文字选择变成“整表节点选择” |
| Mod+F / Mod+Alt+F | 阅读全文查找 / 打开替换栏 |
| 查找栏Enter / Shift+Enter | 下一处 / 上一处；替换输入框Enter执行单次替换 |
| 查找栏Mod+G / Mod+Shift+G / Esc | 下一处 / 上一处 / 关闭搜索 |
| ContextMenu键、Shift+F10 | 打开对应正文/表格菜单；表格菜单↑/↓及Tab循环菜单项，Esc关闭；正文菜单Tab或Esc关闭并返回编辑器 |
| 任务复选控件获得焦点后空格 / Enter | 切换完成状态 |
| 临近表格的段落边界←/→ | 项目补充进入最近表格单元格，避免浏览器直接跨过表格 |
| 行内源码Esc、边界←/→ | 关闭源码投影；Enter/Tab先关闭，再让正文/列表/表格处理该键 |
| 最后HTML行内格式边界←/→ | 在格式内/外光标亲和位置切换，不插入隐藏Markdown字符 |

证据：`MarkdownVisualEditor.tsx:198,633`，`markdownVisual/{listKeys,tableKeys,inputAssist,clipboardFormats,inlineSource,cursor,accessibility,contextMenu,tableMenu}.ts`，`SearchPanel.tsx:72`，CommonMark/GFM的 `composed/keymap.ts` 和 `core/src/internal-plugin/keymap.ts`。上游导出 `Mod+E` 行内代码键，但应用优先将它绑定为近期文件并停止传播，**默认不能把Mod+E宣传成阅读行内代码快捷键**。Mod+K是专注模式，不是插入链接快捷键。

## 自动配对与选区包裹

`inputAssist.ts` 与 `formatPairs.ts` 处理括号 `() [] {}`、单双引号，以及 `* _ 反引号 $ ~ = ^`。总开关 `autoCloseBrackets`，括号/引号及包裹选择另受 `pairBrackets`、`pairQuotes`、`wrapSelection` 控制；格式符仍受总开关。支持自动补闭合、输入自动生成的闭合符时跳过、空对成对退格、选区包裹。词内下划线/等号、被反斜杠转义的起始符、后方紧邻普通文字等情形不会一律配对。正文帮助器不在真正代码节点、保留源码、行内源码或IME组合中强行执行。

## 代码块、图表、原样保留块

- 普通代码/Mermaid/PlantUML块内源码：Tab/Shift+Tab缩进，Mod+Enter退出到后方正文；Esc关闭源码并选择块；↑/↓在首末视觉行边界退出到相邻正文。围栏代码缩进单位读取 `markdownSettings.codeIndent`。
- HTML/TOC/frontmatter等保留块源码：Tab/Shift+Tab；Esc确认关闭；↑/↓要求真正到内容首尾才退出。本轮日常深测补齐Mod+Enter返回后方正文，与普通代码块一致。
- 代码或原样块被作为整块选中时，Enter/↓到后方、↑到前方正文（必要时建可编辑段落）。
- Mermaid/PlantUML拖动手柄获得焦点时Alt+↑/↓在同父容器上下移动整图，单次撤销；不是代码文字里的Alt+↑/↓。拖动中Esc取消。图表全览Esc关闭全览。
- 内嵌CodeMirror仍安装basicSetup，包括选行/移行/多光标/括号配对/查找/折叠/补全等。文末附录列出其实际键表，受项目高优先级和窗口捕获覆盖；不表示这些上游键位均新增了实机验收。

证据：`markdownVisual/{codeView,rawView,blockExit,documentEnd,diagramDrag}.ts`；`node_modules/codemirror/dist/index.js`。

## 窗口级快捷键在阅读模式同样存在

文件菜单：Mod+N新建文件、Mod+Shift+N新窗口、Mod+O打开、Mod+Shift+O打开目录、Mod+S保存、Mod+Shift+S另存为、Mod+W关标签、Mod+E近期文件。窗口捕获：Mod+P文件导航、Mod+Shift+P命令面板、Mod+Shift+F跨文件查找、Mod+R文档符号、Mod+Shift+T重开关闭标签、Mod+,设置、Mod+K专注、Mod+反斜杠分屏。各项受快捷键偏好开关；Mod+B侧栏在阅读正文中给粗体让路。证据：`src/lib/shortcuts.ts`、`src/lib/recentFiles.ts:18`、`src/App.tsx:205`及原生菜单。

## 列表/表格对齐的确定线索

1. `src/preview.css:184` 给ul/ol `padding-left:1.65em`，li再加默认 `.15em`。这本来就是结构性列表缩进。无序标记为outside；嵌套层级由额外ul/ol产生，Tab修改层级，不是修CSS。
2. 阅读视图有`.milkdown-list-item-block > .list-item > .children > .content-dom`包装。`markdown-visual.css:116`去除包装的额外padding，`list-item`保留正文缩进；普通项目符号改用原生`::marker`，隐藏Crepe的bullet标签。编号仍通过宽1.5em、`right:100%`的绝对标签显示。这两种标签DOM不同，不能只改一个li样式就假定全列表都对齐。
3. 任务列表单独减去1.4em外边距；额外taskIndent使用每级1.8em，嵌套任务重设基准0。其目的是与复选框/任务正文对齐，和普通列表1.65em层级、整表2em不是同一概念。
4. 原先顶层表格左右margin为0、宽度fit-content、单独横向滚动；单元格padding为10px/16px，默认顶对齐，表头默认左对齐。表内的“水平列对齐/垂直单元格对齐”只改cell属性，不会挪动整个表格。
5. 本轮新增整表属性才能独立实现“选全表Tab整体右移”。若表格在列表内，还会叠加列表自身容器缩进；不应为修整表位置而强制建列表或批量给cell加空格。

本盘点未通过UI重演用户原始对齐画面；以上是可定位的实现线索，不把截图缺失时的推断写成已复现CSS缺陷。

## 内嵌 CodeMirror 实际键表补充

以下绑定由 `codemirror/dist/index.js` 的basicSetup安装（commands/search/language/autocomplete/lint各导出键表），只属于内嵌源码编辑器。项目最高优先级Esc、Tab、Mod+Enter、历史和窗口捕获命令优先；例如源码里的Mod+I选择语法父级，不是正文斜体。补全/折叠/诊断命令还要求相应语言能力或数据存在，注册键位不等于总有可执行结果。

| 按键（macOS差异括注） | 上游实际命令 |
| --- | --- |
| ←/→、↑/↓；加Shift | 按字符/视觉行移动；扩选 |
| Mod+←/→（Mac Option+←/→）；加Shift | 按词组移动/扩选 |
| Mac Cmd+←/→；加Shift | 行边界移动/扩选 |
| Home/End；加Shift | 行起止/扩选 |
| Mod+Home/End（另有Mac Cmd+↑/↓）；加Shift | 文档起止/扩选 |
| PageUp/PageDown（另有Mac Ctrl+↑/↓）；加Shift | 按页移动/扩选 |
| Alt+←/→（Mac Ctrl+←/→）；加Shift | 语法单元左右移动/扩选 |
| Alt+↑/↓ | 上移/下移代码行；与图表手柄同键但目标不同 |
| Shift+Alt+↑/↓ | 向上/向下复制代码行 |
| Mod+Alt+↑/↓ | 上方/下方加光标 |
| Alt+L（Mac Ctrl+L） | 选中行 |
| Mod+I | 选择父语法节点 |
| Mod+[ / Mod+] | 反缩进/缩进 |
| Mod+Alt+反斜杠 | 按语言缩进选区 |
| Shift+Mod+K | 删除行 |
| Shift+Mod+反斜杠 | 跳到匹配括号 |
| Mod+/ | 切换注释 |
| Alt+Shift+A | 切换块注释（绑定名为 `Alt-A`，大写A表示Shift） |
| Ctrl+M（Mac Shift+Alt+M） | 切换Tab焦点模式；项目最高优先级indentWithTab仍需按其实际分派判断 |
| Enter / Shift+Enter | 换行并自动缩进 / 对应换行命令；补全菜单可接管Enter |
| Mod+Enter | 上游空白行命令在普通代码和保留源码块均被项目“退出到正文”覆盖 |
| Mod+A | 全选内嵌源码 |
| Backspace / Delete | 后退/向前删除；空配对括号优先成对删除 |
| Mod+Backspace/Delete（Mac Option+Backspace/Delete） | 按词组删除 |
| Mac Cmd+Backspace/Delete | 删除到行边界 |
| Mod+U；Alt+U（Mac Mod+Shift+U） | 撤销/重做选区变化（不是文档共享内容历史） |
| F3 / Shift+F3；Mod+G / Mod+Shift+G | 下一处/上一处搜索匹配 |
| Mod+Shift+L | 选择所有当前匹配 |
| Mod+D | 添加下一处相同文本为选区 |
| Mod+Alt+G | 转到行 |
| Ctrl+Shift+[ / ]（Mac Cmd+Alt+[ / ]） | 折叠/展开代码 |
| Ctrl+Alt+[ / ] | 折叠全部/展开全部 |
| Ctrl+Space（Mac另有Alt+反引号、Alt+I） | 发起补全 |
| 补全菜单↑/↓、PageUp/PageDown、Enter | 移动候选、翻页、接受候选；Esc上游关闭补全，但项目Esc关闭块具有更高优先级 |
| Mod+Shift+M / F8 | 打开诊断面板 / 下条诊断（没有诊断时不产生内容能力） |

macOS还注册Emacs风格Ctrl+B/F（字符）、Ctrl+P/N（上下行）、Ctrl+A/E（行首尾）、Ctrl+D/H（前后删除）、Ctrl+K（删到行尾）、Ctrl+Alt+H（删前词组）、Ctrl+O（拆行）、Ctrl+T（交换字符）、Ctrl+V（下页）；其中应用捕获使用Ctrl或Command，因此Ctrl+E/P/K等可被近期文件/文件导航/专注命令抢先处理。这些不能与窗口级实际效果并列承诺同时生效。

普通正文基础ProseMirror仍处理平台文字导航与选择；本项目未为每一种系统编辑快捷键建立独立自定义绑定。完整绑定优先级必须按窗口捕获→阅读surface捕获→自定义DOM处理→ProseMirror/CodeMirror键表查看，不能仅因依赖包导出了函数就列为产品快捷键。

## 整表缩进的预览与复制专项

`node scripts/test-markdown-table-indent-roundtrip.mjs`：8项通过。使用真实阅读组件与表格模型、JSDOM剪贴板事件及`renderMarkdown`，覆盖首表头隐藏标记、亮暗双表独立、表头列表与空白、全表矩形/NodeSelection/普通copy/全文富文本复制、局部矩形不继承缩进、预览HTML与富文本粘回、保存重开及垂直对齐保留。预览和HTML按`calc(N * 2em / var(--md-table-font-scale, 1))`补偿表格字号，另限制缩进后的最大宽度。

这些是组件与数据往返回归，不能替代真实浏览器像素对齐、系统剪贴板跨应用或原生物理Tab验收。表格键盘行为专项与浏览器测量由本轮其他并行工作记录。
