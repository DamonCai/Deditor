# 全屏窗口按钮验证

## 当前实现

普通窗口继续使用 macOS 原生标题栏按钮；全屏以 AppKit 标准窗口控件组成常驻按钮组，沿用普通窗口的尺寸和间距。隐藏系统分离标题栏以避免顶部重复按钮；退出全屏和进入专注模式时恢复原生层。关闭、退出全屏和退出后最小化的动作保持原来的原生路径。

## 本次修复：三个标记时有时无

之前只更新容器的 hover 判断并要求重绘，没能可靠同步三个原生控件各自缓存的图案。原生离屏测试复现了退出 hover 后图案仍保留的问题。此前依据日志判断绘制成功不充分，不能作为三枚标记视觉同步的证据。

现在根据实际指针是否位于整组按钮内，统一同步三个控件的 highlighted 状态，然后整组刷新。移入、移出和组内移动均重新校准；即使组状态没有变化，也重新同步各个控件并刷新缓存，修复原生子按钮自身 tracking 改写状态后的不同步。先更新全部控件，再显示整组，避免逐个显示中间状态。

已删除 `_mouseInGroup:` 私有回调和绘制诊断日志；使用 NSControl 的公开状态和刷新接口。全屏按钮工厂可能返回内部控件类型，因此不通过运行时 NSButton 类型筛选来跳过子控件。

## 原生图像测试

`src-tauri/examples/window_hover.rs` 直接包含生产窗口模块，使用同一个 FullscreenButtonsView 创建原生控件并离屏绘制 PNG。它不抓取桌面，也不打开用户文档或使用编辑器持久化状态。

执行：

```sh
cargo run --manifest-path src-tauri/Cargo.toml --example window_hover
```

轮 1 — 用例：未悬停 → 悬停 → 移出 → 再次悬停。
  期望：悬停图像改变；两次未悬停图像完全相同；两次悬停图像完全相同。
  实测：PNG 字节比较全部通过；图像检查确认三个控件一起出现关闭、最小化、缩放标记，一起消失。
  结果：通过。

轮 2 — 用例：逐一把三个子按钮的状态改为与整组相反，再次同步（6 个组合）。
  期望：鼠标仍在组内时恢复三枚标记；鼠标不在组内时清掉任何单独残留的标记。
  实测：3 个 hover 修复和 3 个 idle 修复均与对应基准 PNG 完全相同。输出 PASS: enter/exit/re-enter and all 6 individual-widget recovery cases。
  结果：通过。

轮 3 — 用例：既有 UI 回归及 TypeScript/Vite 构建。
  期望：相邻功能无失败，前端编译成功。
  实测：41 passed, 0 failed；npm run build 成功，仅有既有的大 chunk 提示。
  结果：通过。

样例图像：

- [未悬停](../tests/artifacts/window-hover/idle.png)
- [悬停](../tests/artifacts/window-hover/hover.png)
- [移出](../tests/artifacts/window-hover/idle-again.png)
- [再次悬停](../tests/artifacts/window-hover/hover-again.png)

范围：本次原生图像验证在 macOS 上进行，覆盖生产按钮容器的绘制与状态同步；离屏窗口未进入系统全屏空间，所以绿色控件显示缩放符号。该测试不等同于全屏动画或绿色按钮悬停菜单的截图验收。Windows 和其它 macOS 版本未实测。原生代码更新需要重启开发进程；已安装版需重新打包。
