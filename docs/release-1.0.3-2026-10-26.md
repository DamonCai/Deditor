# DEditor 1.0.3 macOS 重新发布

本轮按用户要求保留版本号 `1.0.3`，更新源码、重打同名标签及 macOS Apple Silicon DMG。先合入远端 `04b2d9d`，保留 Windows 启动拖放修复、UTF-8 打包修复及安装说明。原远端标签指向 `6be28a8`；其标签对象保存在本地 `refs/codex-backups/1.0.3-before-updater-republish`，旧 DMG 和发布 JSON 保存在被忽略的本轮发布证据目录中。

## 本次改动

- 应用菜单和设置页新增 GitHub 正式版更新检查；按系统和架构选择安装包。
- 下载使用临时文件，大小和 SHA-256 均通过后才保留目标文件，由用户手动安装。
- 平台打包脚本生成绑定最终安装包的 `.build.json`，用于比较同版本构建时间。旧发布信息不足时提示待核对。
- macOS 未配置签名身份时使用完整应用包的 ad-hoc 签名；构建后校验资源签名及 DMG，避免只有链接器签名的包通过交付。
- Windows 打包测试样例补入元数据生成器和当前版本附件检查；本轮未在 Windows 重跑或重新打包，发布中的 Windows EXE 沿用原附件，尚不含本次更新入口。

## 交付包

- 文件：`DEditor_1.0.3_aarch64.dmg`
- 架构：Apple Silicon / arm64
- 构建时间：`2026-10-26T20:13:53+08:00`（Asia/Shanghai）
- 大小：`12112462` 字节
- SHA-256：`f635dd81d9e22b99f3d1d48388d4f7ba95fe7e6319f7697371aace57aed5df50`
- 配套：`DEditor_1.0.3_aarch64.dmg.build.json`
- 应用：`DEditor` / `com.deditor.app` / `1.0.3`；保留正式文件关联。
- 签名：ad-hoc，未做 Apple 公证。安装步骤见 [开发与维护](development.md#发布说明)。

## 验证

| 范围 | 预期 | 实测与结果 |
| --- | --- | --- |
| 合并后的现行基线 | 更新功能与远端修复共同通过 | `test:all` 通过：16 个文本用例、4 种块、4,675 语义对照、7 组阅读组件、表格生命周期、5 轮拖放分派、4 轮更新弹窗、47 项 macOS Rust 测试及生产构建 |
| 正式 macOS 包 | 正确版本、标识、架构和完整资源签名 | 平台脚本构建成功，完整应用包通过 `codesign --verify --deep --strict` |
| 最终安装包 | CRC 有效，内容与构建匹配，元数据绑定准确 | `hdiutil verify` 通过；DMG 只读挂载核对包内签名、Info.plist 和可执行文件 SHA-256；JSON 的大小与 SHA-256 匹配最终 DMG |
| 真实更新数据源 | Rust 后端能够读取 GitHub 正式版 | 发布前直接调用 `check_for_updates` 通过，识别原 1.0.3 附件及缺少构建元数据的状态；发布后需核对新附件和 JSON，并检查同版本构建状态 |

发布保留 [1.0.3 Release](https://github.com/DamonCai/Deditor/releases/tag/1.0.3)，替换 DMG 并上传配套 JSON，说明中明确 Windows 旧附件范围及 macOS 未公证安装步骤。发布后核对远端 `main`、标签、附件 SHA-256 与构建元数据。

本轮没有安装或启动正式应用，不读取已有文档或持久化状态。包结构、签名和后端联网验证不等于原生安装升级、物理输入法或跨屏验收；原生待办以 [pending-tasks](pending-tasks.md) 为准。
