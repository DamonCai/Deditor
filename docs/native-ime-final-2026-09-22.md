# 中文输入专项第三轮整合（2026-09-22）

基线 b613403，三个 agent 分别负责 Markdown 组合导航、保存快捷键路由和 XMind 输入目标生命周期，主端进行整合审查、构建及原生操作。只使用自建文件，未替换日常应用。

## 本轮修复

1. Markdown 的组合结束收尾帧会覆盖滚动容器外的目录导航。将明确指针操作释放锚点的监听移至当前 ownerDocument，销毁时对称移除。修前受控反例 scrollTop 2984 被改为 2525，修后保持目录目标；没有取消组合或过滤文字。详见[组合导航](ime-implementation-audit-2026-09-22.md)。
2. XMind Enter 提交标题后转焦画布，blur 在 React 更新前再次提交同一草稿。提交前同步设置结束标记，阻止重复回调；新会话恢复正常，取消仍不提交。原模型已去重，本轮没有复现丢字或双次历史。详见[标题输入目标](xmind-composition-target-2026-09-22.md)。

新增 `test:markdown-composition-navigation` 与 `test:xmind-composition-target`，均接入 test:all。没有改变系统候选窗实现、输入法文字过滤或文件打开限制。

## 整合验证

- 5 组组合导航、7 组 Markdown 导航、4 组组合保存通过。
- XMind 新专项包含 9 次组合期间的相机/布局/字体/按键变化，验证输入框身份、焦点、选区和草稿保持，最终仅提交一次；后续 blur 提交及 Escape 取消通过。原有 119 项 XMind 与 round21 的 2 项保存/归档回归通过。
- 107 项阅读集成、前端构建、独立 `DEditor IME Final Review.app` macOS debug 构建通过。未把这些定向运行写作完整 test:all 或 perf:all。

## 修复包原生操作

自建文件均在 `tests/artifacts/native-ime-final-2026-09-22/`（忽略目录）。

- Markdown：在 `LEFT|RIGHT` 处逐键 n/i 后点击目录 `Bottom target`。最终标题保持视口顶部，系统本次将预编辑拼音提交为 ni；保存全文严格等于基线仅插入 ni。一次撤销保存恢复完整基线，重做保存和关闭重开严格等于 `navigation.saved.md`。这次普通包操作没有旁听 composition 事件，不能单凭 ni 外观认定每个系统事件的顺序；对应旧诊断包真实 composition 日志与组件失效反例单独记录。
- 第一个目录样例标题位于文末、尾部空间不足，不能滚到顶端，因此未以它判定定位失败或成功。后补 40 段尾部空间再验证上述顶部位置。第一个样例最终已逐字节恢复其原始副本。
- XMind：在 IME child 标题末尾逐键 nihao + Space 得到“你好”，Enter 提交保存。归档仅 content.json 的该标题变为 `IME child你好`，其他字段和所有其他归档成员一致。一次撤销保存整份归档逐字节等于基线；重做保存、关闭重开及新一轮 n/i、Escape 取消后归档严格等于 `xmind.saved.xmind`。
- 上述测试文档关闭，隔离测试包退出。没有改用户文档或系统输入源。

## 仍然不能判通过的证据边界

显式 Super_L+s / Super_R+s 非组合时都产生 meta-keydown；活动 ni 组合时两种写法仍先收到 `ni s` 的 composition/input，再收到 meta-keydown，详见[保存记录](native-composition-save-2026-09-22.md)。系统截图快捷键同样先写入 ni#，不是有效整屏截图；Screenshot、Preview 的 CUA 连接超时，Raise 后应用截图仍不含系统候选面板。旧诊断文档已取消组合、保存并逐字节恢复本轮基线，诊断包已退出。

因此本轮完成了两处确定代码问题的修复及相应验证，但没有取得 IN-03/04/06 的系统候选窗视觉位置或 IN-05 的可信物理快捷键序列，不能把这 4 项移为已完成。已通过异步问题请求用户提供实际键盘观察，尚无回复。当前待办仍 8 类 29 项，中文 4 项属于实机验收缺证据，不能改称 4 个已知产品缺陷。
