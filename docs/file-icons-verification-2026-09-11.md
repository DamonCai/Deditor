# 文件图标统一与验证（2026-09-11）

## 选择与范围

将文件图标统一为 Material Icon Theme 5.38.1，本地打包 SVG，运行时不请求网络。查询时官方 Marketplace 显示 Material Icon Theme 为 35,514,033 次安装，另一主流方案 vscode-icons 为 24,534,317 次安装；该比较支持选择 Material，不代表对所有图标主题做了完整排名。

- [Material Icon Theme Marketplace](https://marketplace.visualstudio.com/items?itemName=PKief.material-icon-theme)
- [vscode-icons Marketplace](https://marketplace.visualstudio.com/items?itemName=vscode-icons-team.vscode-icons)
- [Material Icon Theme 官方仓库](https://github.com/material-extensions/vscode-material-icon-theme)

文件树、标签栏及使用 LangIcon 的列表共用映射。优先精确文件名，再匹配最长复合后缀，再用语言或文件类别兜底。JSX/TSX、声明与测试文件、package.json、tsconfig、Dockerfile、环境配置等采用主题提供的专用图标。根据 DEditor 的实际文件识别规则，将 `.dot` 修正为 Word、`.key` 归为演示文稿；补充 Office 宏文件、动态库等类别。XMind 使用自建思维导图符号，并非官方品牌标志；缺乏对应图标的类型显示中性文档图标。

生成器为 `scripts/generate-file-icons.mjs`，通过 `npm run generate:file-icons` 重建。生成数据包含 1,377 个扩展名映射、2,135 个文件名映射和 200 个语言映射。643 个上游 SVG 共 532,239 字节，保留 MIT 许可于 `public/licenses/Material-Icon-Theme-MIT.txt`。仅打包文件图标，不改变目录图标。

## 验证

1. 映射与边界：29 个样例覆盖 XML、大小写、Windows 路径、JSX/TSX、复合后缀、配置文件、二进制类别、XMind 和未知类型。检查项目全部 346 个注册扩展名均能解析到存在的本地资源，并验证亮暗主题资源。
2. 资源与回归：643 个 SVG 均可解析、有 viewBox、不含脚本或外部资源引用，许可证存在。组件回归 116 项通过；语法回归覆盖 252 个文本扩展名和 47 个自建语法样例，通过。TypeScript 检查和生产构建通过，保留现有构建包体警告。
3. 实际浏览器：仅使用自建文件数据，在 720px 宽测试应用中检查真实 FileTree、TabBar 和图标组件。亮暗主题分别查看；89 个图像全部加载，无损坏资源，图标尺寸为现有的 14px/16px。验证 TOML 亮暗资源切换、文件树选中态、Enter 打开 JSX 文件，以及包含 7 项的标签下拉菜单。浏览器错误日志为空。

可重建的浏览器样例和原始日志位于被忽略的 `tests/artifacts/file-icons/`，不会自动随 Git 迁移。本次验证覆盖浏览器与生产构建，未重新安装 macOS/Windows 原生安装包；不将原生平台显示计为已验收。

## 离线资源专项检查

用户补充要求完全无网可用后，执行 `npm run test:file-icons -- --dist`，通过以下检查：

- 643 个主题 SVG 和 1 个 XMind SVG 均无外部 href/src、外部 CSS 引用或 XML 实体依赖；允许的 SVG 引用仅指向文件内部的 `#id`。
- 644 个图标和许可文件在 `dist` 中与源文件逐字节一致；Tauri 的 `frontendDist` 确实指向该目录。正式应用使用内置资源，无运行时 CDN、下载步骤或浏览器缓存依赖。
- 生成仅允许 `file:` 图片、禁止网络连接的静态验证页 `tests/artifacts/file-icons/offline.html`，供本地手动核验。

尝试通过浏览器工具打开该磁盘验证页时，工具的 URL 安全策略拒绝了 `file:` 地址；遵守拒绝，未尝试绕过。故本次未完成断网浏览器或原生应用的界面实测，以上离线结论依据资源依赖及生产打包检查，不能将该界面实测记为通过。
