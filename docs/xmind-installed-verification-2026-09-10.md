# 已更新用户实际使用的 DEditor

原因：此前只构建独立验证版，用户截图仍来自旧的 /Applications/DEditor.app，因此仍显示阅读/编辑、独立保存和长布局提示。

本轮已将 release 构建安装到 `/Applications/DEditor.app` 并重启。安装二进制与构建产物 SHA-256 一致：`2be43dd639c5da7d26888a11139b1ea72c67be1ae572223d314b801e07c68532`。

更新前程序与会话备份：`/var/folders/d8/w647vs_x40311xyhc20rq1s80000gp/T/deditor-before-update-uk4q_plj`。退出前后各备份一次 state.json；未清理会话数据。旧版本保留在备份目录。

轮 1 — 时间轴专项回归
  期望：布局兼容提示不阻止主题直接编辑，普通保存保留时间轴结构。
  实测：新增 timeline compatibility 测试通过；完整回归 46 passed, 0 failed。
  结果：通过。

轮 2 — 通用编辑与保存边界回归
  期望：中文、Escape 取消、旧阅读偏好、旧 XML 只读、未失焦保存、取消关闭、另存为、保存失败保留修改均正常。
  实测：46 项回归中的对应边界/组合/异常用例全部通过。未增加额外保存实现。
  结果：通过。

轮 3 — 实际安装版原生操作与磁盘验证
  期望：从原文件复制的四页文档，第三页时间轴可以直接 F2 编辑并 Cmd+S 保存。
  实测：在 /Applications/DEditor.app 打开 timeline-edit-check.xmind，选中“03 时间轴”，F2 把“Q1 · 发现”改为“Q1 · 正式版编辑成功”，未失焦时 Cmd+S。重新用 zipfile 读取磁盘 content.json，标题与原生画面一致，四个工作表及 org.xmind.ui.timeline.horizontal 保留。
  结果：通过。

构建：npm run tauri build -- --bundles app 完成，包含 tsc / Vite；既有大包提示保留。Windows 未原生验证。

证据：`tests/artifacts/xmind-installed-edit/timeline-saved.png`、`timeline-edit-check.xmind`、`regression.log`、`release-build.log`。

圈出的长文字是应用的布局兼容提示，不是主题，原本不可作为主题编辑；现在只显示小图标及悬停说明。时间轴布局本身仍未完成 XMind 原生视觉一致性修复，本次只验证直接编辑和统一保存，不宣称视觉一致。
