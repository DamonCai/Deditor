# macOS Dock、Finder 拖放与跨 Space 多窗口验收（2026-09-22）

起点 `17dbfb2`。主端独占实际桌面操作，本项 agent 只准备自建样例、核对实现和记录证据。没有修改产品实现，未构建或运行全套测试；不得用文件菜单/快捷键代替 Dock 点击，或用事件模拟代替 Finder 拖放。

## 自建样例与窗口归属

目录 `tests/artifacts/native-desktop-2026-09-22/` 包含：

- `window-owner-a.md`：标题 Window A，正文唯一标记 A-20260922。
- `Finder drop folder/finder-one.md`：标题 Finder One，正文唯一标记 F1-20260922。
- `Finder drop folder/finder-two.md`：标题 Finder Two，正文唯一标记 F2-20260922。

随 Git 保存的 `scripts/native-desktop-fixtures.py` 可用 `--generate --directory /tmp/deditor-native-desktop-new` 重建，已有样例拒绝覆盖。无参数逐字节检查上述默认位置的三个原始文件；若标题末尾输入后保存，使用 `--a-suffix A` / `--one-suffix B` / `--two-suffix C` 检查对应预期，撤销保存后恢复无参数检查。归属必须结合窗口标题、Window 菜单勾选项、实际标签列表和文档唯一正文，不依据窗口序号。

## 最短实际验收步骤

1. 现有窗口打开 Window A；实际右击测试应用的 Dock 图标，点击“新建窗口”。应新增一个空白窗口，原窗口仍保留 Window A。不要把菜单栏 File 或快捷键成功当作 Dock 成功。
2. Finder 前往样例子目录，选择 finder-one.md 与 finder-two.md，实际拖到新窗口的编辑区域。新窗口应出现两份标签；原窗口不应收到这两份文件。
3. Finder 前往父目录，将整个 Finder drop folder 拖到原窗口。该窗口侧栏应新增工作区目录，展开可见两个文件；目录不能当作普通文件打开。核对新窗口的标签与正文仍独立。
4. 原窗口保留 Window A，新窗口激活 Finder One 并进入系统全屏。通过 Window 菜单切回 A，确认实际跨 Space 后仍是 A 且能编辑保存；再切回 B，确认仍全屏且 Finder One 能编辑。分别撤销保存后字节校验通过，再退出 B 全屏，核对窗口数量和归属。
5. 保存并关闭本轮文档，退出隔离测试应用，避免恢复窗口积累。不要关闭或修改用户的日常应用文档。

## 实现核对与现有边界

Dock 使用 `src-tauri/src/dock_menu.rs` 的 AppKit `applicationDockMenu:`，菜单 action `newEditorWindow:` 调用独立窗口创建。之前两轮真实 Dock 连接均超时，尚不能由实现存在推断实机通过。

Finder 原生 `tauri://drag-drop` 监听明确使用当前 WebviewWindow label；逐路径 `path_kind` 判为目录时调用 `setWorkspaceByPath`，文件批次调用 `openMany`。关闭已确认时不接收拖放。此只读核对未发现确定缺陷，不代替真实事件的目标窗口验证。

上一轮 B 窗进出全屏及 controls installed/removed 日志通过，但切回 A 的截图不可用，未完成跨 Space 焦点闭环。本轮必须记录实际可見窗口/正文和编辑保存，不用单独日志或动画等待超时作为结论。

## 本轮实际结果与待办

主端再次调用 `getApp com.apple.dock` 返回 `timeoutReached`，没有实际展开/点击 Dock 新建窗口，仍未验收。通过快捷键成功创建第二窗口并打开 `window-owner-a.md`，原文未修改；该行为仅说明常规创建入口可用，不能替代 Dock 入口证据。

尝试原生全屏按钮与 Window > Enter Full Screen 后观察到尺寸变化，但随后菜单仍显示 Enter Full Screen，且 CUA 菜单状态残留，未形成可确认的进入/退出与跨 Space 焦点闭环。此结果不计作全屏或跨 Space 验收成功，也不能据此判断产品一定存在全屏故障。

Finder 仅成功连接到 Desktop，未执行实际文件或目录拖放。因此真实文件拖入的目标窗口归属、目录加入工作区仍待执行，不以实现审查或合成事件推断通过。

待办保留为三项具体动作：Dock 菜单实际点击新建窗口；Finder 两文件/目录分别拖入指定窗口并核对归属；两窗口跨 Space 全屏进出、正文输入保存及撤销精确核对。本轮仅常规快捷键第二窗口打开自建文件、样例完整性与源码路径得到确认，未新增上述三项成功结论。未新增 Windows 或真实 IME 结论。
