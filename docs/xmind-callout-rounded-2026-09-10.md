# 批注与圆角分支核对（2026-09-10）

范围：用户截图标记的“改动1”批注尖尾、“改动2”架构分支连线。参照用户提供的 XMind 原生画面；在实际安装版 DEditor 中打开 complex-styles-original.xmind 的“01 综合样式”检查。本轮没有重新捕获 XMind 窗口，不将截图不同缩放下的目测作为逐像素一致结论。

## 修改

- 批注使用自身填充色绘制三角尖尾，连接到父主题边界；没有显式边框时不加外框。批注遵循文件中的相对位置，支持上下左右四个方向。
- 后代继承所属分支的连线颜色与线型；读取 roundedElbow 时不受大小写影响。
- 圆角分支共享竖干，连到下划线主题底部，只有竖干上下端转圆角；中间分支直接接入。主主题到中心主题仍遵循其曲线设置。

## 验证

| 轮次 | 场景 | 预期 | 实际 |
| --- | --- | --- | --- |
| 1 | 左右方向的多级分支与三个兄弟主题 | 同色、同一竖干、首尾圆角、中间直接接入、末端落到下划线 | 通过；安装版 Architecture 放大检查确认 |
| 2 | 批注位于父主题上、下、左、右 | 按原始坐标定位，尖尾为闭合填充路径，不越过主题边界 | 通过；安装版 Quality 的粉色气泡与尖尾确认 |
| 3 | 修改批注文字、标准保存、重新解析、折叠展开 | 内容和坐标保存，尖尾保留，输入原始归档不被修改 | 核心与界面回归通过 |

32 项 XMind 核心测试、56 项回归测试通过；正式 Tauri 应用构建通过。构建有现有 bundle 体积提示，无构建失败。git diff --check 通过。

## 安装与截图

实际应用：/Applications/DEditor.app。构建与安装后的二进制 SHA-256 一致：`1989986c33bd304c2299966bc772732517afdfd7b6a0a5b816a98171efd022d2`。

更新前应用与状态备份：`/var/folders/d8/w647vs_x40311xyhc20rq1s80000gp/T/deditor-callout-final-backup-vd5y7_83`。

- [修改前](../tests/artifacts/xmind-callout-rounded/before.png)
- [分支修改后](../tests/artifacts/xmind-callout-rounded/after-architecture.png)
- [批注修改后](../tests/artifacts/xmind-callout-rounded/after-callout.png)
- [用户参照](../tests/artifacts/xmind-callout-rounded/user-comparison.png)

本轮实测截图来自安装后的应用，窗口标题与标签确认是 complex-styles-original.xmind；只做定位、缩放及查看，没有编辑或保存该原文件。结论仅覆盖上述两项；标签胶囊、图标位置及其他结构不在此结论内。
