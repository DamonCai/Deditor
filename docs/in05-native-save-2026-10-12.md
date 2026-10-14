# IN-05：macOS 组词期间 Command+S

状态：已完成。原生修复、专项与工具原生检查、用户物理键盘复验和最终中文/普通 s 读盘均通过；IN-05 已从待办删除。

## 复现与定位

用户在普通隔离包明确报告物理 Command+S“会多出 s”，随后在 `DEditor IN05 Trace` 的自建 `in-05-trace.md` 再次操作并提供候选窗截图。162 条诊断记录未达到 600 条上限：#70 为 `MetaLeft` 按下；#73/#75/#77 已经把 `s` 经 `compositionupdate`、`beforeinput`、`input` 写入预编辑；#82 才收到 `KeyS / meta=true / keyCode=229`。之后四次同样追加，共五个 s。没有原生 `menu-action` 日志，磁盘仍为原始 `LEFT|RIGHT`。因此不能再归结为仅自动化输入链的现象；网页 keydown 阶段已晚于插字。

原始事件与用户截图已冻结为 `tests/artifacts/sequential-acceptance-2026-10-12/in05-diagnostic/physical-before.events.json`、`physical-before.png`。用户第一次操作后最终保存的中文正确不抵消中间态异常，也不据此猜测用户是否做过修正。

## 修复范围

`src-tauri/src/save_shortcut.rs` 安装应用内的 AppKit 本地 keyDown 监听：仅在当前 DEditor 原生窗口、无系统 sheet/modal 时，把不含 Shift/Option/Control 的 Command+S 提前交给现有原生菜单。菜单消费后不再交给 WK 输入法；没有绑定时原样继续。菜单禁用状态与窗口目标仍由原有菜单及保存链处理。退出时移除监听；无全局键盘监听、无正文过滤、无强制提交 composition、无 JS 重复保存入口。Windows 保持原逻辑。

采用 [Apple 本地事件监听 API](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/EventOverview/MonitoringEvents/MonitoringEvents.html)，只观察本应用分派中的事件；不注册系统全局快捷键。

## 验证

| 轮次 | 用例与预期 | 实测 |
| --- | --- | --- |
| 1 | 真实 AppKit 菜单收到保存及重复 keyDown，每次只执行一次 | 通过；`scripts/test-native-save-shortcut.rs`，事件只在内存中构造，不向 OS 投递 |
| 2 | 普通 s、Control/Option/Shift 组合、其它键、Unicode、非编辑窗口不提前保存 | 通过 |
| 3 | 禁用菜单不执行保存、取消绑定不消费、恢复绑定/Caps Lock 可保存 | 通过；初版测试误以为 AppKit 对禁用菜单返回 false，实际返回 true 但不执行动作，按真实语义修正断言并保留该行为 |
| 4 | 活动组词保存、写盘期间继续组词、取消组合、同任务最后输入落盘 | 既有 4 组真实组件/saveFile 专项全部通过 |
| 5 | 通用回归与原生实际写盘/历史 | `test:regression` 通过；修复诊断包逐键 n/i 后工具 Command+S 触发一次 `file_save`，无新增 s，磁盘精确为 `LEFTni|RIGHT`；一次撤销保存恢复基线，重做保存恢复 ni |

前端 `npm run build` 通过，修复诊断 macOS 包构建通过。工具 Space 后观察到提交 `ni`，未取得该轮中文选词结果，不把工具检查扩大为物理键盘组词/继续选词通过。最终物理验收必须同时核对不追加 s、候选继续可用以及最终中文落盘。

修复诊断包为 `DEditor IN05 Fixed`；工具日志冻结在 `in05-fixed/tool-after.events.json` 和 `tool-after.menu-events.json`。最终不含诊断脚本的隔离包为 `DEditor IN05 Review`，样例 `in-05-review.md`。两者独立 identifier、`bundle.fileAssociations: []`，不替换日常应用。没有重跑全 `test:all` 或 `perf:all`，不声称 Windows 或其它待办完成。

最终普通隔离包构建成功，产物 plist 已确认 identifier 正确、无文件关联；已打开 Visual 样例并请求用户按上述完整步骤复验。旧 Trace 和 Fixed 诊断进程已退出，事件证据已冻结；日常 DEditor 保持。

用户随后明确反馈“正常：不再多 s，能选你好并保存，普通 s 可输入”。按此记录物理快捷键与继续选词观察正常；但读盘时 `in-05-review.md` 为 `Input: LEFT|RIGHT`、`Plain s: LEFT|ni a hRIGHT`（73 字节，SHA-256 `5ab6483980abdaa68a0c54faaeb6c541f9e2204f8c87b67c1d4856d3ef3b86e6`），UI 两行均回到 `LEFT|RIGHT` 且 dirty。不能推断清理/撤销的具体过程，也不能将该磁盘内容称为最终中文一致。已仅请求保留“你好”和普通 s 的最终保存，不重复组词快捷键测试；IN-05 待这一步读盘后再关闭。

最终用户回复“已保存并保留内容”后，第一次读盘已有 `Input: LEFT你好|RIGHT`；随即用户完成第二行 s 的保存。最终冻结文件精确为 `# IN-05 final verification\n\nInput: LEFT你好|RIGHT\n\nPlain s: LEFTs|RIGHT\n`，74 字节，SHA-256 `c7b7e54001e21750d2396e0b0dd8cc3a9eb4d116bd3dcaa100b255f14c817017`。中文最终提交与普通 s 落盘一致证据补齐，IN-05 关闭；冻结副本和 JSON 核对结果在本轮 artifacts 的 `in05-final-verified.md` / `in05-final-verification.json`。产品修复、专项测试及本轮逐项验收记录按用户要求一并本地提交到 `feature/1.0.2`；未推送，日常应用未替换。
