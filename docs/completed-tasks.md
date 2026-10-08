# 已完成事项与验收记录

更新：2026-10-08。以下范围已从[当前待办](pending-tasks.md)移除，供追溯使用；同一功能尚缺的具体场景只在当前待办中列出。

| 已完成范围 | 记录 |
| --- | --- |
| SOAK-01/02：修复后台表格销毁未取消挂载动画回调；原生 47 分 5.866 秒、374 轮内容和关闭资源断言通过，另有 880 次真实大图拖动与 10 分钟进程内存采样；记录实际峰值和回收范围，不称任意时长无泄漏 | [非 Windows 接续](mac-closeout-2026-10-08.md) |
| CLIP-01：钉钉便签真实往返的标题、粗体、链接和中文保留；斜体/表格降级与独立标准 HTML 对照逐字节相同，按接收端边界归档，不称全部格式通过 | [非 Windows 接续](mac-closeout-2026-10-08.md) |
| SPELL-01/02：Mac 产品亮暗正文和表格通过 Option+右键实际系统 quick 建议，仅更正所选 quikc；保存、单次撤销和重开逐字节恢复原文，未修改系统词典 | [非 Windows 接续](mac-closeout-2026-10-08.md) |
| EXT-01：Windows 原生 DEditor 产品上传按钮经隔离 PicGo Core 3.1.0 的真实 `/upload` 服务，把自建 PNG 上传至 Litterbox 一小时临时图床；首次 HTTP 412 失败后再次操作成功取得 HTTPS 链接，替换 Markdown 本地引用，Ctrl+S 落盘并关闭重开在 WebView2 再次显示图片。远程引用与原 PNG 分别核对，临时链接不代表永久图床服务或账户验收 | [Windows PicGo 闭环](picgo-windows-2026-10-08.md) |
| WIN-01/02/03：Windows WebView2 自建 Markdown 含中文、英文、emoji 的实际编辑、Ctrl+S 磁盘内容、Ctrl+Z/Ctrl+Shift+Z 结果，以及 Windows 文件面板打开/另存中文路径，源文件与另存文件逐字节一致 | [Windows 原生验收](windows-acceptance-2026-10-08.md) |
| WIN-05：两个 Windows 原生窗口分别持有已存文件上的未存中文草稿和未命名中文/emoji 草稿；全部进程退出再重启后，两窗标签、内容归属正确，随后分别保存 | [Windows 原生验收](windows-acceptance-2026-10-08.md) |
| WIN-06：DEditor 原生保存自建 XMind，核对 content.json、其它 ZIP 条目和第二工作表字段；原版 XMind 实际打开并显示新根标题、分支和图像 | [Windows XMind 验收](windows-acceptance-2026-10-08.md) |
| SPELL-03/04：修复 WK 段落重新检查后词典接受词红线再现；最终产品样式隔离原生包增词、继续编辑、亮暗、删词恢复通过，115字节原文一致；系统建议菜单于 10 月 8 日补齐，见上行 | [原生拼写收尾](native-spelling-closeout-2026-09-27.md) |
| XM-01/02/03：原版自建紧凑形状/圆角、显式白字、亮暗 smart 主题对照；修复胶囊/菱形 canonical 宽度、菱形比例、紧凑圆图片折行。119 XMind、8 宽度及72圆形组合等通过；不称所有主题逐像素一致 | [XMind 原版对照](xmind-closeout-2026-09-27.md) |
| PlantUML 失败后清理已加载标记，允许同节点重试；恢复后清理错误样式，5 秒超时及重试回归通过。EXT-04 后续闭环见下行 | [重试状态修复](plantuml-retry-fix-2026-09-22.md) |
| EXT-04：真实 PlantUML 响应经测试代理延迟尾段触发产品 5 秒超时，实际点击重试后再次远程 HTTP 200 恢复，正文不变；修复取消后同节点无法重载及关闭首视图误中断共享请求。属于明确传输故障注入，不称上游自然故障或原生验收 | [外部服务收尾](external-services-closeout-2026-09-27.md) |
| EXT-02：真实产品 HTML 预览中的远程 HTTPBin iframe 完成输入、选择、提交和服务器回显；内置 Chromium 验证 | [远程 iframe](external-iframe-2026-09-22.md) |
| EXT-03：真实产品编码/hydrate 经默认 PlantUML 服务一次返回 100 消息 SVG，首尾及全部消息核对；Node fetch + JSDOM，不新增原生 UI 结论 | [远程 PlantUML](external-plantuml-2026-09-22.md) |
| 修复 Markdown 组合结束后的目录定位回跳、XMind 标题 Enter/blur 重复提交；定向回归、107 阅读集成、119 XMind、生产/独立 macOS 构建和原生保存撤销重开通过。系统候选窗及物理快捷键仍留待办 | [中文输入第三轮整合](native-ime-final-2026-09-22.md) |
| 原生菜单保存活动拼音后继续选词，dirty/再次保存/单次撤销重做/重开精确保真；4 组真实组件保存竞态回归加入 test:all。物理 Command+S 前置输入序列仍保留 IN-05 | [组合期间保存](native-composition-save-2026-09-22.md) |
| IN-01：本轮三段原生批量/分批格式输入、首轮完整事件与保存重开无重复闭合符，七种格式符及选区替换十变体通过；按有界复现结论收口，历史首次异常原因仍未确定 | [本轮输入核查](native-input-followup-2026-09-22.md) |
| IN-03/04 已验证范围：真实组词左右移动后取消保真；组词滚动后在原位置提交中文、保存、单次撤销/重做及重开精确一致。候选窗口位置仍保留在待办 | [组合输入与滚动证据](ime-implementation-audit-2026-09-22.md) |
| MAC-04：两原生窗口跨全屏 Space 往返，进入/退出稳定状态由原生 API 和实际截图核对；不扩大为逐帧动画或多显示器 | [原生窗口观测与验收](native-desktop-acceptance-2026-09-22.md) |
| MAC-05：全屏 A 与普通 B 的窗口菜单焦点往返、分别输入保存/撤销，三份自建文件逐字节恢复基线 | [原生窗口观测与验收](native-desktop-acceptance-2026-09-22.md) |
| CLIP-04：主实时预览分隔线原生正反向改宽，不新增正文选区；松手后正文拖选恢复，保存原文逐字节一致并关闭退出 | [原生事件诊断与最终复验](native-pane-resize-diagnostic-2026-09-22.md) |
| IN-02：Markdown 真实逐键拼音 nihao + Space 提交“你好”，保存仅增加该文本；未提交拼音取消、单次撤销恢复完整基线、重做保存及关闭重开精确一致。XMind 标题同样完成真实拼音提交、取消、保存、单次撤销/重做及重开，content.json 逐次核对；候选窗口视觉定位仍列 IN-06 | [原生输入验收](native-input-acceptance-2026-09-22.md) |
| Excel粘贴空表头与已有表格拆表修复；真实Excel矩阵及Word富文本往返、保存/撤销/重做/重开 | [原生剪贴板复验](native-clipboard-drag-2026-09-22.md) |
| 阅读光标事务、保留块上下文复用和万条搜索导航优化；本地 HTML 资源转换、打开错误提示及 Mermaid 大小门槛修复；原生资源交互/保存撤销重开与上下文更新闭环 | [性能与功能限制检查](markdown-performance-audit-2026-09-22.md) |
| 退出末字丢失、取消/重试/慢写盘关闭竞态、关闭后异步编辑；配对独立偏好与系统拼写入口 | [并行收尾](closeout-2026-09-22.md) |
| Mermaid/PlantUML 拖动排序、单次撤销；Command+E 近期文件、重启保留与目标编辑器焦点 | [图块与近期文件](diagram-recent-files-2026-09-22.md) |
| XMind 跨文件资源/联系/内部链接复制、大附件重开与原版读取 | [剪贴板闭环](xmind-clipboard-fix-2026-09-12.md) |
| XMind 透明根分支穿字修复，形状几何与有限次连续编辑/归档历史验证 | [XMind 收尾](closeout-xmind-2026-09-22.md) |
| 表格末格 Tab 增行后紧接输入的撤销边界 H-TAB-01 | [表格功能补齐](markdown-editing-features-2026-09-19.md) |
| 阅读搜索/替换、历史对比/全览、图表全览/自适应高度、动态 HTML 预览、全局搜索跨模式定位 | [历史对比](markdown-history-overview-2026-09-20.md)、[图表](markdown-diagram-overview-2026-09-20.md)、[HTML](preview-restrictions-audit-2026-09-20.md)、[搜索](global-search-modes-audit-2026-09-21.md) |

内嵌源码 Cmd+S/Z 字母化已定位到本机自动化与拼音输入链，ABC 下保存/撤销/重开通过，已从“已确认编辑器缺陷”移除；真实 IME 验收仍保留。测试应用已退出；日常应用未替换。构建、自动化、原生包各自的准确范围以链接记录为准。

## 本次进一步拆出的完成部分

| 已完成范围 | 证据 |
| --- | --- |
| 阅读括号/引号自动配对、选区符号包裹及三个独立偏好；输入、跳过闭合符、成对退格和偏好持久化 | [写作设置收尾](closeout-writing-2026-09-22.md) |
| 链接卡片编辑已接入；确认/取消后的焦点与光标恢复、继续输入、保存及分步撤销已有组件自动化覆盖 | [IN08 连续操作测试](../scripts/test-markdown-round3-inline.mjs)、[卡片选区实现](../src/lib/markdownVisual/linkSelection.ts)；最后完整 test:all 通过见[性能检查](markdown-performance-audit-2026-09-22.md) |
| 文件链接从真实悬浮卡片在应用内打开，包括 file、绝对和相对路径 | [文件链接原生验证](markdown-file-links-fix-2026-09-13.md) |
| 新建窗口的文件菜单/快捷键、独立文档与保存、关闭/重启恢复、窗口列表 | [新建窗口验收](new-editor-window-2026-09-21.md) |
| 系统拼写 Alt/Option 右键入口及中英文提示；浏览器/组件确认应用不拦截系统菜单 | [拼写菜单入口](closeout-shortcuts-2026-09-22.md)；实际系统菜单于 10 月 8 日补齐，见本轮记录 |
| XMind 96 组形状几何、500 次混合修改和归档、51 个历史版本、千节点 50 步浏览器输入/撤销/重做 | [XMind 收尾](closeout-xmind-2026-09-22.md)；不扩大为原版像素一致或长期内存结论 |

产品及验收提交：`c2adcee`、`5df2aef`、`494209d`。历史记录中的“未提交”描述的是当时状态，不代表这些修复仍未提交。

## 2026-09-22 新一轮四项处理

| 已完成范围 | 证据 |
| --- | --- |
| 格式符空选区自动配对、闭合跳过、成对退格及偏好开关；保存连续输入、原文保真与撤销；实际浏览器和 macOS 逐键保存通过 | [配对记录](markdown-format-pairs-2026-09-22.md)；原生批量输入一次额外闭合符观察仍保留核查 |
| 独立应用词典与当前文档忽略词管理、增删/重试/跨窗口更新/另存为继承；浏览器实时装饰与原文保真、macOS 实际增词落盘及重启/文档隔离 | [词典记录](spelling-dictionary-2026-09-22.md)；原生红线增删效果已于9月27日完成，见[后续复验](native-spelling-closeout-2026-09-27.md) |
| 大文档共享源 AST、只渲染目录 token、首次就安装最终 NodeView 工厂，减少重复整页重建；千节三轮初始化中位10.70→7.65秒、标题编辑1011→300ms | [重复基准](markdown-large-document-performance-2026-09-22.md) |
| 100KB/1MB 三位置输入、超过8标签冷恢复、300围栏/主题、千/万行历史实际DOM与导航、5000文件磁盘搜索；DiffView 行复用减少全展开导航开销 | [真实界面性能覆盖](markdown-real-ui-performance-2026-09-22.md)；1MB阅读正文仍有234–280ms成本，不宣称任意规模无卡顿 |

## 2026-09-22 紧急并行收尾

| 已完成范围 | 证据 |
| --- | --- |
| 链接真实悬浮入口修改/取消/删除、焦点与反向选区恢复、续写、保存/分步撤销/重开；修复修改网址丢标题与合法 file 地址被清空，原生亮暗保存/撤销/重做/重开与实际本地打开通过 | [链接卡片](urgent-link-card-2026-09-22.md) |
| 两原生窗口近期文件同步、已有/新开标签就绪后直接编辑和保存撤销；Markdown↔XMind连续保存/独立撤销重做、源字节与ZIP内容校验、XMind重开 | [混合文档及多窗口](urgent-mixed-windows-2026-09-22.md) |
| 已观察的普通文本事件被DOM observer合并时仍正确跳过生成闭合符；composition/粘贴/未知来源保持字面输入；内部缓存超限完整回退不截断正文 | [配对核查](urgent-format-pairs-2026-09-22.md)；首次原生偶发观察仍保留核查 |

本次相关回归、类型检查、生产及独立macOS构建通过；测试文档保存关闭、测试应用退出，未替换日常应用，按既有授权本地提交不推送。完整范围与限制见[本次总记录](urgent-closeout-2026-09-22.md)。
