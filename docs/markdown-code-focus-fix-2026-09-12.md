# 代码块点击保持外观（2026-09-12）

范围：用户两张截图中，普通代码块点击进入编辑后隐藏行号、改变高亮/字体，并出现虚线焦点框和语言/复制浮层的问题。截图内容只作为显示样例，没有执行其中代码。

## 修改

- 阅读代码编辑使用与静态预览相同的 Shiki 语法和主题；保留 CodeMirror 的输入、选区、语言功能及共享历史，禁用另一套默认高亮覆盖。
- 字体、行距、行号、换行、缩进及窄窗内边距保持一致，去掉点击后的焦点外框。行号为显示装饰，不写入原文。
- 普通代码点击/悬停不显示语言与复制浮层；右键代码块或键盘聚焦控件时仍可使用。图表原有源码切换入口保留。
- 修正共享预览的制表符设置优先级，以及关闭行号时末尾空行没有占位的问题，避免点击后产生高度差。
- 保留已有块高度保护及工作区并行的方向键退出修改。

## 验证

- 真实浏览器先复现原实现：点击后字体变为 monospace、出现 dotted outline、浮层 opacity=1，行号被隐藏。
- 自建 `tests/markdown-code-focus-review.html` 对照真实 Preview：截图同款 TypeScript 点击前后均高 60.75px，长行/空行/制表符样例均高 220px；亮暗主题、行号开关、换行及窄窗均实看核对。960px 窄窗中换行样例两侧高 234.75px，不换行两侧高 121px。
- 普通点击后浮层 opacity=0、outline 为 none；右键后语言输入获得焦点、浮层 opacity=1。
- 真实按键 Enter 后输入注释，原文精确增加新行和注释；按历史边界撤销两次后原文逐字恢复。单纯点击与设置切换核对原文不变。
- `npm run test:markdown-code-focus`：12 组主题/语言/空行/选区及修改恢复检查；已接入 `test:all`。
- 106 阅读集成、32 代码行数、8 Enter 历史、4 特殊块操作组通过；TypeScript 和生产构建通过，保留已有打包提示。未执行整套 `test:all`，不代表并行工作整体验收。

本次未重新打包原生应用，未新增 macOS/Windows/真实 IME 验收；未提交推送。临时验证浏览器及开发服务结束时关闭。

## English

Ordinary fenced code now retains the preview's font, syntax colors, line numbers and layout when focused. Clicking no longer reveals a focus outline or toolbar; language/copy controls remain available through a context click or keyboard focus. Verified real browser edits and exact undo, light/dark and wrapping cases, targeted regressions, the reading integration suite and production build. Native application validation was not repeated.
