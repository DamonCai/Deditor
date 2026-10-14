# XMind 内部名字显示清理

针对画布上的 `task-done`、`task-half`、`star-red`、`priority-*`、`org.xmind...` 等内部名称，以及额外占行的 Notes/Link 说明文字进行修复。

## 修改

- 标记转换为 SVG 图标：优先级数字圆标、任务完成/进度、彩色星标/旗标；未知扩展标记使用通用符号。
- 备注和链接使用图标，悬停/辅助技术提供中英说明，不再作为画布文字行重复显示。
- 布局近似提示收为信息图标和简短提示，不展示结构 ID；格式面板的未知布局显示“原文件布局”，原始值保留。
- 标记行纳入尺寸计算，多标记自动换行；真实主题标题、标签、备注内容不做删改。
- 原始 markers / notes / href / structureClass 保留在文档模型中，保存时仍可往返。

## 验证

| 轮次 | 用例与期望 | 实测 | 结果 |
| --- | --- | --- | --- |
| 1 | 已知标记显示为图标，真实标签保留，修改标题后原始标记与备注仍保留 | 检查完成/半完成、优先级、星标、未知标记、备注和链接；保存重开后的 markers/notes/labels 相等 | 通过 |
| 2 | 空、单个、31 个未知标记在菱形内正确占位；用户主动写下的同名标题和标签不能被误删 | 图标行数、宽度和高度包含关系通过；标题中的 task-done、标签中的 star-red 原样保留 | 通过 |
| 3 | 阅读/编辑切换不重新泄漏 ID；未知结构选项不显示类名；查看不修改文件内容 | SVG 绘制文字不含内部 ID，图标存在可读的辅助标签，视图切换后文件仍 clean | 通过 |
| 4 | macOS 原生画面核验 | 新编译 Marker Review 应用中查看专用样例和用户原文件的逐字节副本；原文件副本放大 113%，M1/M2 显示完成及进度图标，M3 显示备注图标。亮/暗界面均核对 | 通过 |

命令结果：`npm run test:xmind` 27 项通过，`npm run test:regression` 42 项通过，`npm run build` 和 Tauri debug app 打包成功。构建仍有原有的大 chunk 警告。

原生测试应用：`src-tauri/target/debug/bundle/macos/DEditor Marker Review.app`，identifier `com.deditor.marker-review`。没有覆盖 `/Applications/DEditor.app`。

截图位于 `tests/artifacts/xmind-indicator-review/`：

- `native-symbols.png`：完成、进度、优先级、星标/旗标、未知标记、备注/链接以及真实标签。
- `native-symbols-dark.png`：暗色应用界面，导图继续采用文件自己的白色画布。
- `original-markers-detail.png`：原文件副本交付分支放大检查。

窄窗口拖动触发 UI 工具的 `noWindowsAvailable`，没有把该项计为原生验证完成；Windows 安装包未验证。本次不声称图标位置或整个导图与 XMind 像素级一致。
