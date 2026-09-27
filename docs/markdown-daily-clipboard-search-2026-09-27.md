# 日常复制、剪切、查找替换连续工作流（2026-09-27）

本轮按用户要求检查快捷操作的实际效果，使用真实 `MarkdownVisualEditor`、Milkdown/ProseMirror 文档与历史、项目 SearchPanel、DOM copy/cut/paste/keydown 事件。测试文件为 `scripts/test-markdown-daily-clipboard-search.mjs`。环境是 Node + JSDOM；仅 OS 剪贴板与 Tauri 文件 I/O 使用自建替身，不读用户文件或历史。输入走组件实际 `handleTextInput`，必要时回退 ProseMirror 插入事务；不是静态检查键位是否注册。

## 确认并修复：替换命中开头导致格式丢失

自建正文：

```markdown
plain cat **cat** *cat* `cat` [cat](https://example.com)
```

Ctrl/Cmd+Alt+F 打开替换，查找 `cat`，替换 `dog`，点击全部替换。修复前 DOM 的粗体、斜体、行内代码和链接全部消失，持久化 Markdown 变为 `plain dog dog dog dog dog`。

原因是 `MarkdownVisualEditor.tsx` 的 `replaceMatches` 用 `resolve(match.from).marks()` 读取替换样式；在标记边界，这会读取前一个文本节点的样式。修复改从实际被替换的首字符所在 `nodeAfter.marks` 获取，再回退 `marks()`。替换仍是字面文本，不重新解析 Markdown，也不改搜索范围、分组历史或替换顺序。

修复后完整源码是 ``plain dog **dog** *dog* `dog` [dog](https://example.com)``。单次替换分别覆盖粗体首字符、粗体中间、粗体后普通文字、从粗体跨到普通文字、带 title 链接及删除线边界；其中跨格式命中按首个命中字的样式应用于替换文字。正则捕获、替换里的字面星号、单次撤销与重做均核对精确源码。

## 完成的实际操作链

| 工作流 | 核对内容 |
| --- | --- |
| 混合粗体/代码部分剪切→Ctrl/Cmd+Z→Shift+Z→中文 emoji 输入→保存→连续撤销 | 可见复制文字、HTML marks、删除范围、后续光标及精确源字节 |
| 跨段落至两条列表选区，普通复制与 Shift+C，再富文本粘贴、撤销、重做、保存 | 两种复制的文字一致；列表、粗体及代码结构保持 |
| 普通 Markdown 粘贴和 Shift+V 字面粘贴，再输入和连续撤销 | 普通路径生成格式，字面路径保留符号；一次撤销先移除后续输入，再移除粘贴 |
| 表格首列两格剪切、撤销、重做，在邻格 Shift+V 粘贴 Tab/换行 | 只清空选格，保留表格与其他格；字面 Tab/换行不拆表、不增加单元格 |
| 搜索第二个命中→Escape→直接输入→保存→撤销重做 | 焦点回到编辑器，直接输入替换最后所选命中，不误写第一处 |
| 零命中/非法正则→Escape→直接输入 | 原光标位置保留，原文与精确撤销保持 |
| 混合格式全部替换→Escape→续写→两次撤销 | 每种格式保持，续写与替换独立恢复 |
| 正文、任务项、普通列表、表头和数据格同词替换 | 精确源文本与原有列表/表格/复选框结构保持 |
| 查找输入框内 Shift+C/V、组合输入期间 Ctrl+F | 不误触正文剪贴板，不在组合期间打开查找；关闭后仍能在原光标输入 |
| 6 类格式边界逐个替换与 Ctrl/Cmd 撤销重做 | 实际命中文字的格式保持，包括无格式文字不继承前一个粗体 |
| 正则捕获替换与字面格式符号 | 捕获展开正确、已有粗体/链接保留、未添加新格式层 |
| 删除最后命中→Escape→直接输入→连续撤销 | 替换按钮禁用后焦点仍在查找框，Escape 返回正文；新输入和删除均可恢复 |

## 验证结果与边界

- 新增脚本：**12 组通过**，DOM、ProseMirror 结构、剪贴板载荷、最终 Markdown 和替身写盘内容逐项断言；Ctrl/Command 等循环包含在组内。
- 既有 `node scripts/test-markdown-search-audit.mjs`：**12 组通过**，包括 Unicode、非法正则恢复、搜索面板行为与代码内定位等回归。
- 初跑保留了真实替换格式丢失失败；另有测试选择器和选区搭建问题已修正：Crepe 有辅助表格，检查应限定 `tbody[data-content-dom]`；任务复选框使用 `role=checkbox`；跨格式范围应一次性建立，避免先放光标触发行内源码展开后继续使用旧坐标。

父任务另外观察到 Home→Shift+End 后复制包含尾部 `**`。当前实现中，空选区进入格式文本会自动投影为 `deditor_inline_source`；其文本就是可编辑原始 Markdown，普通复制会复制实际选中的源码字符，HTML 带 `data-md-inline-source`。这是与渲染态格式选区不同的路径。本轮未改此交互，也未把它认定为已修复缺陷；判断是否违背预期需要保留操作后的真实选区与可见源码范围。

本脚本挂载阅读组件而非完整 App；能确认阅读 surface 的 Ctrl/Cmd+F、Alt+F、Z/Shift+Z 与正文/查找输入框作用域，不能声称验证了窗口捕获层的 Cmd+E、Cmd+K 或 OS 物理按键分派。浏览器像素、系统剪贴板跨应用和原生 WebView 验收由主任务另行记录。本轮没有启动服务、操作 UI、提交或推送。
