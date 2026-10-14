# C05 图片剪贴板补充检查（2026-09-12）

范围仅阅读编辑的 `image/png` 剪贴板链路。使用自建 1×1 PNG；文件操作均为明确的模拟 IO。没有使用用户文件、提交或推送。

## 复现与修复

现有 CrepeBuilder 已接入 Milkdown upload，所以位图粘贴不是缺少入口。旧版在 `alpha beta gamma` 中选中 `beta` 粘贴 PNG，会在选区前插入图片，但仍保留 `beta gamma`。原因是上游上传完成后固定 `replaceWith(pos, pos, fragment)`，没有替换原选区。

新增 `imageClipboard.ts` 接管不含 HTML 的图片文件粘贴。先保存文件，成功后才按原选区插入；期间追踪前文编辑导致的位置移动。编辑原待替换范围、切模式/标签、切只读或销毁实例会取消该次正文插入。失败保留原文与选区。插入前后分隔历史组，因此一次撤销只撤图片插入，保留上传等待期间的独立正文编辑。HTML 多格式事件保持既有富文本链路；普通文本、源码编辑器及 XMind 没有接入此插件。

产品文件仅 `src/lib/markdownVisual/imageClipboard.ts` 与 `src/components/MarkdownVisualEditor.tsx`（新增插件接入与失活取消事件）。取消发生在文件保存后时，已保存的图片资源可能留下未引用文件；本轮没有加入自动删除资源的逻辑。

## 具体证据

`scripts/test-markdown-image-clipboard-audit.mjs` **8 组通过**：

1. 段落中间图片插入位置、PNG 字节/目录/文件引用、模拟保存、一次撤销、重做及组件重建。
2. 选中文字粘贴图片替换选区；旧版失败对照已实际执行。
3. 上传延迟时前文继续输入、光标移到文末，插入仍落回映射后原位置；撤销保留期间输入。
4. 上传期间直接修改待替换文本，晚到结果取消，不吞新文字。
5. 模拟文件保存失败不修改原文、选区，也不残留上传占位文字。
6. 暂停 Markdown 并切 HTML/XMind 标签时上传完成，不修改任何文档内容（组件与 store 隔离测试）。
7. 图片文件与 `text/html` 并存时，不上传位图，按富文本粘贴；可精确撤销。

TypeScript 检查与差异格式检查通过。日志在 `tests/artifacts/image-clipboard-audit.log`。

8. 三张 PNG 同时粘贴到空文档、文末及文字选区，三张引用按顺序保留；一次撤销、重做与组件重建一致。旧循环插入在空文档只剩最后一张（实际失败 `1 !== 3`），已改为单次 Slice/Fragment 替换整个原选区，异步映射逻辑未变。

## 固定快照浏览器

独立快照 `/var/folders/ls/ffs5872n5pz2yk47_m92ylvc0000gn/T/deditor-png-clipboard-y2j37ra6`，样例 `tests/markdown-image-clipboard-review.html`，5199 服务。

浏览器工具本次可用。用浏览器剪贴板 API 写入自建 `image/png`，真实键盘选中 `beta` 后 Cmd+V：保存请求为 `/generated/assets/image-5ae2fe98-1512-4d0b-a704-336d1e1c5755.png`，字节与自建 PNG 完全相同；图片显示完成且 `naturalWidth=1`。正文保留 `alpha ` 和 ` gamma`，选中的 `beta` 被图片替换。Cmd+Z 一次恢复 `Before\n\nalpha beta gamma\n\nAfter\n`，图片数归零。快照哈希和读取值见 `tests/artifacts/image-clipboard-audit-snapshot.json`。

该浏览器页模拟保存并将图片 URL 映射到自建 data URL，不能当作真实磁盘写入/原生截图剪贴板验收。未新增 Windows、macOS 系统截图剪贴板或真实文件落盘结论；C05 中的文本拖动、外部文件拖入也不在本次范围。自己的浏览器标签与 5199 服务已关闭。

最后多图修正晚于上述单图浏览器快照；该修正由真实组件专项覆盖，未新增多图系统剪贴板或浏览器多图验收结论。最终 8 组专项、TypeScript 与差异格式检查通过。
