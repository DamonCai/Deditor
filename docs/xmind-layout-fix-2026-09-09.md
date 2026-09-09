# XMind 文字边界与鱼骨图修复验证

2026-09-09。针对用户指出的菱形文字越界和鱼骨图结构错误，修改 DEditor 渲染代码，并重新编译 macOS 原生应用验证。

## 修改

- `src/lib/xmind/scene.ts`：统一测量标题、标签、备注/标记文字；为图片和各文字行计算内容区域。菱形、椭圆按实际形状包住内容矩形，胶囊形状增加两端留白。
- `src/components/XmindCanvas.tsx`：文字、图片和编辑输入框使用上述内容坐标；辅助文字使用与测量一致的字体并换行；测量考虑斜体字形边界。
- 鱼骨图使用独立布局：一条主轴、上下交替的斜骨、沿斜骨逐项接入的横向细分支。下划线节点接底边，深层子树保留层级，支持左右鱼头以及折叠。结构选择使用 XMind 原生的 `org.xmind.ui.fishbone.leftHeaded` 标识。
- `scripts/test-xmind.ts` 新增 4 项回归用例，检查形状内部包含关系、斜骨与细分支几何、空/单/奇数/多分支、镜像、深层长文字及折叠恢复。

## 原生验证环境

- Xmind 26.04.01341。
- DEditor 0.9.0，本次源码编译的 `src-tauri/target/debug/bundle/macos/DEditor XMind Review.app`，独立 identifier `com.deditor.xmind-review`。
- 同一个 `tests/artifacts/xmind-native-review/complex-styles-verified.xmind`，4 个工作表、112 个主题。没有通过缩短样例文字、删除分支来规避问题。
- 样例 SHA-256：`c614dd391e8347ff9b2ffadbbf0b55267727b89080ba3a4892fc592670c211c3`。

## 四轮验证

| 轮次 | 用例及期望 | 实测 | 结果 |
| --- | --- | --- | --- |
| 1：原问题 | 菱形/椭圆文字完全在形状内部；鱼骨显示真正的主轴、斜骨和横向细分支 | macOS 原生窗口查看综合样式，放大到 111% 检查形状文字；鱼骨 17 个主题完整呈现，并与 XMind 同文件对照 | 通过 |
| 2：边界 | 长标签、中英文、多行、斜体不越界；鱼骨空、单、奇数、多分支和镜像布局坐标有效 | 新增包含关系和几何断言通过；0/1/3/8 条原因分支、深层长标题、左右镜像均通过 | 通过 |
| 3：交互组合 | 工作表切换、搜索定位、缩放、折叠/展开、亮暗界面和窄窗口不破坏导图 | 原生窗口执行空格折叠字体分支，再展开恢复三项明细；切换综合样式/鱼骨、搜索菱形、放大和适应窗口均正常；窄窗口截图宽 768px | 通过 |
| 4：相邻回归与构建 | 原有编辑保存、撤销、异常保存和多标签行为保持有效；能编译原生应用 | `npm run test:xmind`：25 项通过；`npm run test:regression`：41 项通过；`npm run build` 及 Tauri debug app 打包成功 | 通过 |

构建仍有现有的 Vite 大 chunk/混合导入警告，没有构建错误。此次验证范围为 macOS 原生测试版；未验证 Windows 安装包。与 XMind 的间距、标记图标、关系线等仍有既有差异，本报告仅确认这次文字边界和鱼骨结构修复。

## 截图

截图均来自实际原生窗口，位于 `tests/artifacts/xmind-layout-fix/`：

- `deditor-shapes-detail.png`：修复后的形状文字，111% 放大。
- `deditor-fishbone.png`：修复后的鱼骨图。
- `xmind-fishbone.png`：XMind 同文件鱼骨基准。
- `deditor-overview.png` / `xmind-overview.png`：综合样式。
- `deditor-fishbone-dark.png` / `deditor-fishbone-narrow.png`：深色界面和窄窗口。
