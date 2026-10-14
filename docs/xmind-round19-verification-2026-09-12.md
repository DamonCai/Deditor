# XMind 第十九轮：原生整段拖动与深层混合折叠

整体未完成。当前真实剩余项需要可用桌面或 Windows 环境；不得用自动测试替代原生验收。

## 原生整段拖动补齐

使用已验证 Review20 和新建 `/tmp/deditor-xmind-round19/segment-edit.xmind`，仅三个主题和一条手动直角联系线。在原生 95% 画布选中联系，从虚线手柄坐标 (698,534) 拖到 (698,594)，整段水平线下移，两个端点未变。

Cmd+S 后归档仅 `flexibleControlPoints` 变化，其他 JSON、端点、样式、资源均相等。一次 Cmd+Z 再保存恢复原始归档精确字节；Cmd+Shift+Z 重做保存、关闭重开后保持移动后的路径。证据 `native-segment-drag-save.xmind`，SHA-256 `105a1db4d81485fd4365629c9bd94a7c3cf8c8e78ca79baae785527e9ae45435`。

继续真实 IME 时工具明确返回 Mac 已锁定，整段拖动的新保存结果尚未被原版重读，候选浮窗仍未捕获。锁定发生在新输入动作前；先确认磁盘与已保存拖动证据相等，再用精确进程路径结束 Review20，避免后台占用。没有终止用户正式 DEditor 或其他应用；原版此前已退出。

## 深层组合发现与修复

自建 `richNestedSheet()` 覆盖 16 种结构、4 种标题/字号/图片/0–6 标签组合、展开和交替折叠，共 128 种情况。修复前 4 种失败均为左右鱼骨图：较宽的折叠原因主题向左越过斜骨起点，碰到前一同侧分支的深层文字/标签。

浏览器真实复现：左头 `r-1-1-0` 和 `r-3` 的可见区域相交；不是测试臆造。间距现按整个原因子图的实际左边界计算，水平平移主题、分组、内部线段和斜骨端点，仍保留上下两侧独立占位与主轴顺序。

修复后 128 种均无主题视觉区域重叠，源模型不变。浏览器左右镜像、展开及一次撤销通过；720×640 暗色画布无页面横向溢出，工作表栏 37px，随后恢复窗口尺寸。

## 检查与证据

- 核心 109 项，组件 142 项、完整 `test:all` 通过；固定快照 `/private/tmp/deditor-xmind-native-round19-review21`。不包括工作区同时进行的后续 Markdown 修改。
- 性能基准通过：1,001 主题与 1MB 附件、10,000 个控制点路由。测量值见 `perf-review21.log`。
- `combination-before.log`、`combination-after.log`、`combination-results.json`、`core-review21.log`、`all-review21.log`、`source-review21.json`、`build-review21.log` 位于 `tests/artifacts/xmind-round19/`。
- 已生成两份原生待验收样例 `/tmp/deditor-xmind-round19/rich-leftHeaded.xmind` 与 `rich-rightHeaded.xmind`，各自为单工作表文件。新包构建成功，锁屏时未启动。

## 下一步必须补齐

1. 桌面可用后，用新 Review21 逐份打开左右深层鱼骨样例，核验混合折叠、展开/撤销、保存/重开；每份关闭、最后退出包。
2. 原版通过 Finder 打开 `segment-edit.xmind` 验证整段移动后的路径和固定端点，再对照新深层鱼骨文件；逐份关闭、退出原版。
3. 真实 IME 候选窗口定位、其他原生交叉组合及 Windows 验收仍不能标通过。


Review21 包位于 `/tmp/deditor-xmind-review21-app/DEditor XMind Review21.app`，SHA-256 `e50e97fda7df7655305665ce234dba76ab033b4274523dd8bc21b4d0ccdce6ae`。构建输出与固定源码清单再次一致；此包尚未原生冷启动验证，不得把构建成功计为原生通过。正式应用未替换。
