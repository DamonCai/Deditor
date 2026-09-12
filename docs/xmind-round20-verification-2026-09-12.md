# XMind 第二十轮：标题宽度与换行

用户要求继续到完成。本轮接续时原生控制工具再次明确返回 Mac 锁定，因此继续处理已有原版证据支持的标题差异；没有重新启动原生应用。

## 确认的差异与修复

第十八轮相同标签归档的截图中，原版 `标签省略与超出三行` 为一行，本地拆为两行；原版 `Native Review20 symmetric up` 为一行，本地亦曾提前换行。读取本机已安装原版的声明式规则，普通标题默认最大宽度为 300；本地此前按中心/其他层级使用 260/210。现统一默认 300，继续保留已有显式宽度，不将显示缺省值写入源文件。

另复现按字符换行将 `alpha bravo charlie` 拆成 `alpha bravo c` / `harlie`。原版文本样式为 `white-space: break-spaces` 和 `overflow-wrap: break-word`。本地现优先空白、连字符和东亚文字边界，超长连续词再拆分；使用字素簇保留组合表情，避免中文闭标点单独出现在行首。SVG 文本保留空白，与测量一致，边界标题使用同一换行规则。

## 验证

- Review22 核心 111 项、组件 142 项及完整 `test:all` 通过。
- 新增测试覆盖各层级默认 300、显式窄宽度、显示策略不写回原文，普通词/超长词、多个空格、空行、中文标点和家庭组合表情。
- 浏览器 `?probe=native-title-width` 确认根主题、长英文及长中文明细各一行，显式窄宽度仍换行；`alpha bravo charlie delta echo` 在窄宽度下显示为 `alpha bravo ` / `charlie delta ` / `echo`，无拆词。
- 1,001 主题/1MB 附件、10,000 控制点性能基准通过，日志 `perf-review22.log`。128 个深层组合随核心回归通过。
- 固定快照 `/private/tmp/deditor-xmind-native-round20-review22`，与并行的后续 Markdown 工作隔离。源码清单 `tests/artifacts/xmind-round20/source-review22.json`。首次仅宽度版本的完整测试保留为 `all-width-only.log`；首次构建主动中止以纳入拆词修复，记录为 `build-width-only-interrupted.log`，不计完整构建通过。

## 原生继续点

使用 Review23 最新包（包含 Review21 深层鱼骨、Review22 标题和后续标签字素修复），逐份验证：

1. `/tmp/deditor-xmind-round20/title-width-edit.xmind`：中英文标题显示、输入/保存/重开，对照原版；原始副本 `title-width-original.xmind`。
2. `/tmp/deditor-xmind-round19/rich-leftHeaded.xmind` / `rich-rightHeaded.xmind`：深层图片标签与混合折叠、展开/撤销、保存/重开，原版对照。
3. `/tmp/deditor-xmind-round19/segment-edit.xmind`：原生整段拖动已完成，继续原版重读移动后的固定端点与路径。
4. 真实 IME 候选窗口、其他原生交叉组合及 Windows 仍未验收。

每份验证后关闭文档，确认关闭状态后退出应用；避免恢复窗口堆积。整体仍未完成，构建和浏览器通过不等于原生通过。

## 组合字符标签补充及最终待验包

继续检查省略规则时，回退字体测量复现标签被截为 `👨‍👩‍👧‍👦👨‍👩‍…`，末尾是不完整组合。现标签与标题共用字素簇分割，保持家庭表情、肤色、国旗和组合重音完整，源标签全文不变。新增回归先失败后通过；日志 `label-grapheme-before.log` / `label-grapheme-after.log`。浏览器 `?probe=unicode-labels` 显示四类完整组合及省略号，键盘 Enter 打开标签编辑器，焦点与 30 个家庭表情全文均确认。

- Review23 固定快照：`/private/tmp/deditor-xmind-native-round20-review23`；112 核心 / 142 组件、完整回归、性能与构建通过。源码清单与工作区 8 个 XMind 文件哈希逐项相同。
- 测试包：`/tmp/deditor-xmind-review23-app/DEditor XMind Review23.app`。
- 二进制 SHA-256：`f6b4e50359f9382053b4486a120e280b369561fc46e14a08a5386634f17833e7`。
- `tests/artifacts/xmind-round20/` 中 `all-review23.log`、`perf-review23.log`、`build-review23.log`、`build-review23.json` 与 `source-review23.json` 保留证据。性能中位数：10 次布局 103.98ms、10 次保存 3.74ms、万控制点路径 15.69ms。
- Review22 成功包同样保留，二进制 SHA-256 `d0a4f6a9313b31a776b58d5b5d7b1999db80faa4a991af35492cbc9b0939beb1`；后续原生验收以 Review23 为准。
- 附加原生输入：`/tmp/deditor-xmind-round20/unicode-labels-edit.xmind` 与对应 `-original.xmind`，由自建样例生成。

原生工具在本轮再次明确报告 Mac 锁定，已请求解锁，未收到解除后实测证据。Review22/23 均未启动；主进程检查确认本任务测试应用及原版 XMind 均已退出。不能把新包构建和浏览器通过计作原生验收。剩余项仍按上表继续。

等待解锁后再次检查仍明确锁定；本轮独立浏览器验证页和预览服务亦已关闭。解锁后从 Review23 原生继续点恢复，无需重复运行已经通过且源码未变的完整回归。

## 解锁后的原生推进（2026-09-12 上午）

本轮用户说“搞吧”后重新检查已解锁，Review23 包哈希相符，立即恢复真实 UI。

- 标题：根中文与长英文标题保持单行，较长英文按单词分两行。F2 进入主题编辑，改为 `Native Review23 title width saved`，未离焦 Cmd+S、关闭重开通过。归档仅该标题变化，其他 JSON / ZIP 载荷完全一致。SHA-256 `85b261a2438bd134717917b9cd6f359cb7cbc38fcf75d54c4449700823f72fe5`。随后 Finder 指定文件被原版读取，截图确认保存标题、中文单行、英文按词换行及图片/标签，无修复提示。
- 整段联系：原版成功读取 `/tmp/deditor-xmind-round19/segment-edit.xmind`，115% 截图完整显示保存后的八段控制点路线、底部横段、起点与终点，未报修复；第十九轮实际拖动→保存/撤销/重做/重开→原版读取链路补齐。
- 组合字符标签：Review23 原生截图保留完整家庭/肤色表情及省略号；实际坐标双击家庭标签打开含 30 个组合表情的全文字段，追加 ` Native labels Review23`，未离焦保存、关闭重开通过。归档仅此标签追加，组合字符与附件完整保留。SHA-256 `3dcdb7a7fb28bc8af260661256f45d024c06052491953e39a3ecfc4a13c20a10`。该保存结果原版重读仍待完成。
- 左/右深层鱼骨：两者原生混合折叠初始 12 个可见节点，展开 `r-3` 后 17 个；实际画布完整截图确认宽主题与相邻分组不再遮挡。一步撤销加保存均恢复原文件精确字节，重做保存与关闭重开保留 17 个可见节点；归档仅删除目标主题的 `branch: folded`，图片、标签、边界与其他字段不变。
- 左鱼骨保存 SHA-256 `1ee960543bd21322b1b5bdece2ebba83c039f56727046c7f74fac902750adce1`；右鱼骨保存 SHA-256 `53e6adfd2ee70ddd9b81da74e5786af26bca093571562dd3dd1387d9fa9f823e`。两份均被原版按确切路径成功载入，无修复提示；原版 AX 可读标题、标签、分组和折叠计数，但画面仅显示部分，适应画布菜单未改变视图，坐标操作返回 `noWindowsAvailable`。因此只记原版成功读取，不计完整画面比对通过。
- 原生文件打开面板选择 `.xmind` 后 Open 禁用；应用内文件树正常打开。固定快照确认 filters 已含 `xmind`，rfd macOS 将所有扩展合并进 `setAllowedFileTypes`，不是 Windows 式仅选中第一个筛选项。仍须在稳定原生会话确认禁用原因，暂不贸然改共享 fileio。
- 操作期间检测到并行“开发markdown”任务也在进行原生验证，Finder 路径变为该任务的 `/tmp/deditor-native-final-review/review.md`。这可能造成部分窗口/输入冲突，未当作产品缺陷；停止操作该共享 Finder 对话框，先继续不依赖原生界面的工作。

上述自建文件快照与 `native-review23-verification.json` 位于 `tests/artifacts/xmind-round20/`。屏幕证据位于本任务工具记录，没有伪称已保存成 PNG。两批均关闭测试文档，Review23 已退出；原版键盘退出未生效时使用应用菜单“退出 Xmind”，进程检查确认退出。真实 IME 候选窗口、原版剩余完整画面、打开对话框、Windows 等继续未验收。源码未改，无需重复已通过的完整回归。

## 本轮原生闭环最终状态

- **标题、组合字符标签、左右深层鱼骨及整段联系保存结果的原生 / 原版闭环已补齐。** 原版标签样例 150% 全图显示完整组合表情加省略号，实际双击全文编辑器确认 30 个家庭表情和 `Native labels Review23` 后缀。
- 原版左右深层鱼骨最终均在 **62%** 完整显示，确认 25 个总主题（含已折叠后代）、已保存的展开状态、三个嵌套分组、图片和标签，且无修复提示。之前的“原版全图操作受阻”已解决。
- 排查期间原版菜单失焦后 Return 曾产生一个自建的“分支主题 5”；未保存到磁盘。发现恢复的未保存窗口后，核对确属该误触新增主题，关闭并选择不保存，再从确切文件重新载入。最终全图来自 25 主题且无“已编辑”标记的干净文件；两个已保存归档哈希仍与原生保存证据完全一致。
- **原生打开对话框通过。** CUA 普通点击可能未真正选择文件，导致 Open 持续禁用；调用 UI 明示的文件项 `Open Finder item` / `打开“访达”项目` 动作后正常载入。原版自身 Cmd+O 路径也成功打开标签 / 左鱼骨。无需更改已包含 XMind 的过滤配置，不把工具选择失败列为代码缺陷。
- 真实 IME 浮窗仍未通过。逐键 `nihao`、Ctrl+Space、Caps Lock（已恢复）及 Ctrl+Alt+Space 后，仍为英文直输和字面空格；系统输入法菜单 / SystemUIServer / Dock 操作超时，另遇活动应用切换冲突及 ScreenCaptureKit 错误。没有用粘贴中文替代候选窗口验证。全部草稿取消，IME 测试文件与原始归档字节相同。
- Windows 真机环境仍未提供，跨平台原生验收不能在此 Mac 上计通过。
- 本轮没有再改 XMind 运行时代码。最终清单 7/8 文件与 Review23 固定快照一致；唯一差异为并行 Markdown 任务修改了 `scripts/test-regression.mjs` 中两处 Markdown 测试断言，已逐行核对没有改 XMind 部分。112 核心 / 142 组件及完整构建结果仍明确归属 Review23 快照，不混称并行工作区的新全量验收。
- 最后一批关闭测试文档，等待关闭状态持久化，再由应用菜单退出 Review23 和 XMind；主进程检查确认两者均退出。未安装正式应用，未提交推送，没有覆盖并行 Markdown 改动。

整体仍不能标为全部完成：当前环境剩余明确未验收点为真实候选窗口定位和 Windows 原生验收。此前已覆盖范围不代表任意第三方模板像素完全一致。
