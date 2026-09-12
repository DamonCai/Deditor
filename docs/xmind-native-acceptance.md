# XMind 剩余原生验收

此流程用于接续真实 IME 和 Windows 验收。生成样例、构建成功、归档校验通过都不能代替真实操作及候选窗口定位。只操作脚本生成的工作副本；每个样例验证完关闭文档，再退出测试版 DEditor 与原版 XMind。

## 准备与隔离

在仓库根目录运行，目标目录必须不存在，父目录必须存在；Windows PowerShell 同样适用：

```sh
npx tsx scripts/xmind-native-acceptance.ts prepare tests/artifacts/xmind-native-acceptance
npm run test:all
npm run tauri -- build --no-bundle --config tests/xmind-native-acceptance.conf.json
```

Windows 从 `src-tauri/target/release/deditor.exe` 启动；若设置了 `CARGO_TARGET_DIR`，使用对应目录。独立 identifier 隔离正式应用持久化，禁用文件关联。无需安装或覆盖正式版。记录实际可执行文件 SHA-256，并与生成目录中的源码哈希清单核对；源码有变化必须重新生成到新目录、重新构建，不沿用旧验收结论。

`baselines` 是不可编辑基线；`working 中文 #` 是原生打开、另存和重开的工作副本，包含中文、空格及井号路径。`expected` 是精确修改预期，不能为了让校验通过而改动。原版读取检查在 DEditor 保存后进行；若要尝试原版编辑，应先另复制副本。

## 六个用例

| 用例 | 原生操作及保存预期 | 额外画面检查 |
| --- | --- | --- |
| title | F2 编辑 `Native Review20 symmetric up` 为 `Native acceptance title saved`；未离焦 Ctrl+S | 根中文与缺省英文宽度；130 宽度的长文本按词换行 |
| ime | 根主题使用真实拼音组合输入 `你好世界`，完成组合后保持主题编辑状态 Ctrl+S | 约 10%、100%、400% 下显示真实候选列表；记录光标与候选位置；Enter/Esc 不触发新增/提前结束编辑。不能粘贴或直接设置中文 |
| labels | `Label 1` 的完整家庭表情标签末尾追加 ` Native acceptance labels` | 四类组合字符省略完整；进入编辑仍保留全部 30 个组合字符 |
| leftHeaded | 选择第四个主分支 `r-3` 并展开；Ctrl+Z 后保存应与基线字节一致，再重做保存 | 混合折叠、深层分组、宽主题、标签和图片不互相遮挡 |
| rightHeaded | 同上 | 原版适应画布后检查完整左右结构及展开状态 |
| multisheet | 第一张表根主题改为 `Native acceptance multisheet saved` | 另一张工作表、自由主题、概要、边界、备注、联系和附件保留 |

每次保存后关闭、重开，并由原版 XMind 读取同一确切文件，确认没有修复提示。另存结果也应使用同一校验。可复用基线新复制的样例验证 Windows 文件拖入、Ctrl 快捷键、WebView2 字体、100%/150%/200% 系统缩放和应用亮暗主题；所有测试操作与环境设置变更必须记录并在结束后恢复。

示例校验（替换用例名和保存路径）：

```sh
npx tsx scripts/xmind-native-acceptance.ts check tests/artifacts/xmind-native-acceptance title "tests/artifacts/xmind-native-acceptance/working 中文 #/title.xmind"
```

校验检查预期修改、每个其余 JSON 字段、所有 ZIP 条目及附件字节，且拒绝被改动的基线和预期文件。`archive: PASS` 只证明保存归档；输出明确保留 `nativeUI/chineseCandidates: NOT_ASSESSED`。实际候选位置和原版画面须单独留证，不能因文件名含 Windows 或生成平台是 Windows 就计为原生验收通过。

## 当前状态

macOS Review23 已完成的原生证据见第二十轮记录。此处新生成的六个样例属于后续复现材料；真实中文候选定位及 Windows 全流程仍未通过。
