# 主实时预览分隔线原生诊断

基线 `3a4e2db`。此前 x614 和 x612 拖动没有可靠改变宽度；没有事件命中证据，不能据此判定产品或工具失效。本任务只诊断自建 `tests/artifacts/native-clipboard-drag-2026-09-22/divider-source.md`，不读取正文进日志。

## 独立诊断包

`scripts/prepare-native-pane-resize-diagnostic.mjs` 复制现有前端产物后，向副本注入 `tests/diagnostics/native-pane-resize.ts`。不改 `src/`、`dist/`、Vite 配置或产品入口，普通构建不包含诊断模块。清单记录来源路径/index SHA-256，不将其视为整个前端与 HEAD 一致性的证明。

```sh
PATH=/Users/damon/.nvm/versions/node/v24.16.0/bin:$PATH node scripts/prepare-native-pane-resize-diagnostic.mjs
PATH=/Users/damon/.nvm/versions/node/v24.16.0/bin:$PATH npm run tauri -- build --debug --bundles app --config tests/artifacts/native-pane-resize-2026-09-22/tauri.diagnostic.json
```

仅主 agent 执行原生构建与 UI。配置使用独立产品名称 `DEditor Divider Diagnostic`、独立 identifier，beforeBuildCommand 为空，防止普通前端构建覆盖诊断副本。首次挂载即写 `events.json`，右下角显示真实 client bounds。启动后只打开自建样例，切到主实时预览，再拖动显示中线 x 的中点。若 UI 工具坐标不是 WebView client 坐标，用日志中的 screenX/clientX 与实际截图校正，不反复猜测1–2像素。

## 一次真实拖动后的判断

```sh
node scripts/read-native-pane-resize-diagnostic.mjs
```

日志包含：真实事件的 isTrusted、pointerId/type/isPrimary、button/buttons、client/screen 坐标、target、elementFromPoint、actual handle/parent bounds、捕获调用和结果、lostpointercapture、事件处理后 dragging/body 标记、区域宽度与选区长度。只观察并包装捕获函数以记录调用；不阻止事件、不修改坐标、不 dispatch 鼠标事件、不更改编辑器状态。辅助面板 pointer-events:none。

- 没有 trusted down：原生动作尚未投递到此 WebView，不计验收。
- trusted down 点在 bounds 外或 target 为正文：未命中；按实际坐标修正后重复。
- 命中但没有 capture-call：查 React/事件入口、button/isPrimary 与模式/面板激活。
- capture-error 或立即 lostcapture：按错误/时序查捕获、卸载、失焦；不盲目删除保护。
- 正常捕获后 move.buttons 不含左键：日志证明按钮状态，核实实际按住过程；不能把合成 move 当持续拖动。
- 捕获与左键 move 正常：比较事件后区域宽度，定位 state→布局是否未更新或被覆盖。

诊断记录会强制读取布局，不用于性能结论。确定问题后仅修对应产品路径并跑分隔线专项；最终须在不含诊断模块的普通隔离包真实复验：左右改变宽度、拖动不新增文本选区、松手后正文可重新拖选、自建源文保存字节不变。测试文档保存关闭、退出隔离实例后方可完成收尾。若没有可确定产品缺陷，仍需以事件和几何证据记录实际动作边界，不能仅交本准备说明宣布通过。

## 首次原生诊断结果

主端实际 CUA `drag([730,400],[900,400])`，截图宽1229而 WebView viewport1280，工具已做坐标换算。18条记录保存在 `events-first-native-drag.json`：

1. trusted pointerdown 的 clientX=760.416687，splitter 实际范围[758,762)，target与elementFromPoint均为splitter，button=0、isPrimary=true、**buttons=0**。
2. setPointerCapture(1)成功，随后gotpointercapture；真实pointermove的clientX=937.5、capture=true，但**buttons仍为0**。
3. `beginPaneResize` 的 `!(event.buttons & 1)` 命中，立即finish→releasePointerCapture→lostpointercapture；最后pointerup。
4. 左区域宽514px始终未变，选区长度0，无mousedown事件。证据明确排除本次命中失败和比例state/layout问题；宽度计算没有执行。

这是原生自动化投递序列的实际观察，不等同于物理鼠标按住过程的button flags已经验证。下一步先重复真实拖动确认序列，再决定是否需兼容此buttons=0的辅助功能事件路径；不无条件移除正常拖动丢失左键时的保护。

## 有界兼容实施

根据已观察的 trusted 原生序列，`beginPaneResize` 仅在初始主指针左键 down 的 buttons=0 且 `hasPointerCapture` 确认成功时记录本次例外。后续 buttons=0 必须仍持有同一指针捕获才允许更新。正常 buttons=1 开始的鼠标序列仍在失去左键时结束；buttons=2、未成功捕获、捕获丢失均不会放行。pointerup/cancel、lostpointercapture、blur、卸载及handle断开继续清理。捕获方法抛错也清理已安装的选区保护与监听器。

产品只改 `src/lib/paneResize.ts`。原8组生命周期专项全部保留，增加4组：零按钮捕获序列、捕获/按钮必要条件、各种结束路径、捕获抛错清理。`node scripts/test-pane-resize.mjs` 12组通过，日志 `pane-resize-tests.log`，差异检查通过。单测模拟的是已观察事件字段，用于分支与生命周期回归，不作为原生证据。

未宣称物理鼠标或所有平台均已复现该异常字段。最终普通包与原生重复拖动仍由主端验收；诊断副本未被本子任务重新覆盖运行中的版本。

旧诊断包第二次反向真实拖动也命中：down clientX760.416687，move clientX645.833313，buttons均0，捕获成功后提前释放，左宽仍514；两次完整日志另存 `events-two-native-drags-before.json`（33条）。这确认双向重复同因。

日志解释修正：`event:after` 实际是 window capture 回调后的 microtask。在 WebKit 中此 microtask 可能早于 React 冒泡处理器执行（seq20早于capture-call seq21即为证据），不能凭它宣称事件全链已处理。明确capture调用/返回、下一事件以及 `geometry:pointerup-frame` 的最终几何共同构成结论；本次没有仅凭microtask快照归因。


## 普通最终包原生闭环（CLIP-04 完成）

主端重新构建生产前端与不含诊断模块的普通隔离 macOS 包后，以真实 CUA 拖动复验：

- 正向 `[612,400] → [790,400]`，源码/预览边界约611→786px。
- 反向 `[788,400] → [470,400]`，边界约786→464px。
- 两次改宽均没有新增正文选区，Undo保持disabled，未产生文档编辑。
- 松手后实际在预览正文 `[501,240] → [854,240]` 拖选，AX精确显示选择“段落01：拖动主实时预览分隔线，应改变左右宽度且”，确认选择保护已释放。
- Cmd+S、Cmd+W关闭自建样例，再Cmd+Q退出普通测试包。`divider-source.md` 与 `.original` 逐字节一致，SHA-256：`2507db0a99c2f50da7104420a72e6498b9c4a6cf7d228fcdfb00a0a16b610918`。

因此 CLIP-04 的实际改宽、正文选择保护/释放及源文保真已完成，从待办移除。之后尝试携带已有正文选区重新命中4px手柄时坐标不稳，**不新增“原生已有选区保留”通过结论**；该分支仅有既有专项测试证据。也不扩展为物理鼠标、Windows、多显示器或跨视口持续拖选已验收。
