# Markdown 提交前完整验证

日期：2026-09-11。用户要求完成开发后全面测试、整体更新 README 和上下文，并提交推送；无需再次确认。本文记录此次待提交版本的结果，不将未验证的平台交互计为通过。

## 提交与验证范围

Markdown 阅读编辑采用 Milkdown 7.22.1 / ProseMirror，源码及块源码使用 CodeMirror，独立文档层保留未编辑范围，每标签会话统一跨模式撤销。入口、保存、工具条、查找、目录、只读和中英文文案均已接入。具体实现及早期 UI 证据见 [实施记录](markdown-visual-editing-verification-2026-09-11.md)。

提交目标为 `origin/feature/0.9.0`。测试从 Git 暂存区导出独立目录，重新执行 `npm ci`，不依赖工作目录中同时进行的 XMind 改动。只纳入 Markdown 功能、文档、依赖锁文件和必要回归；独立 XMind 任务的其他未提交文件留在原工作区。此提交包含已存在的一个 XMind 折叠按钮位置修复及对应回归，以及一个布局浮点误差断言修正，原因见下文。

## 完整自动化结果

以下均在待提交快照执行，退出码为 0：

| 项目 | 结果 |
| --- | --- |
| `npm ci` | 干净依赖安装成功，锁文件可复现安装 |
| `npm run test:markdown-visual` | 24 项通过，其中包括 14 组无修改保真样例 |
| `npm run test:markdown-visual:integration` | 12 项通过，运行时异常收集为空 |
| `npm run test:regression` | 117 项通过，0 失败 |
| `npm run test:xmind` | 70 项通过 |
| `npm run test:export` | 12 项通过 |
| `npm run test:syntax` | 252 个文本扩展名加载；47 个自建样例及纯文本/边界验证通过 |
| `npm run test:file-icons` | 29 个映射用例、346 扩展名、643 个打包 SVG 及授权文件、644 个图标外链检查通过 |
| `npm run perf:all` | 全部 13 组性能脚本完成，包括 8 项 Rust IPC 基准 |
| `cargo test --release --manifest-path src-tauri/Cargo.toml -- --test-threads=1` | 15 项通过，0 失败 |
| `npm run build` | TypeScript 与生产构建通过 |
| `bash -n` / `sh -n` | 3 个启动、构建、清理脚本语法均通过 |

`npm run test:all` 已汇总上述七个功能套件，本次连续运行约 33 秒；性能套件约 122 秒。性能测试包含模拟环境，并非所有数据都来自原生 UI。2000 段 Markdown 的文档层加载约 152.7 ms、目标编辑约 2.7 ms；store/组件压力测试中 1000 次输入的 p95 约 0.38 ms，500 次切标签约 1.15 ms；10000 次混合动作 p95 约 0.69 ms，打开/关闭 1000 标签后没有标签残留。这些数值仅为本机本次观察，不能换算成真实 IME 或完整阅读页面输入延迟。

## 本次测试发现并修复

1. **原生历史事件路由**：源码 CodeMirror 原先会先消费 `beforeinput(historyUndo)`，绕过 Markdown 共用历史。改在内容 DOM 捕获阶段路由到会话历史并阻止私有栈处理。增加真实 EditorHost 保留实例的“阅读修改→源码修改→连续两次撤销”测试，以及 HTML 私有历史和当前编辑器归属隔离测试，均通过。模拟 beforeinput 事件通过不代表系统原生菜单已经实测。
2. **XMind 下方标签与折叠按钮重叠**：干净快照回归暴露旧实现用主题框高度定位按钮。采用工作区已有的 `nodeVisualBounds(n).height` 修复，并增加标签/按钮边界断言，回归通过。
3. **XMind 浮点边界断言**：丰富主题布局测试的左边界采用精确比较，右边界已有浮点容差。为左边界补齐相同的 `1e-7` 容差。此前测试进程停在最后一个断言；修正后完整 70 项正常结束。没有将进程停滞归因为未经证实的运行时缺陷。

早期工作目录组件回归为 118 项，包含独立 XMind 任务未提交的新用例；本次正式提交快照为 117 项，两者不可混用。

## UI 复验与原生构建

本次从待提交快照启动浏览器隔离页面，再次执行：阅读标题输入→切源码→追加文字→两次 Cmd+Z，显示的源文本恢复初始内容，包括列表符号、表格对齐、引用定义与末尾空格；切到只读后，所有可见正文及内嵌 CodeMirror 的 contenteditable 都为 false。

前一阶段已实际检查表格输入和 Tab 增行、任务框、跨标记查找、目录、图片 alt/本地路径、公式/Mermaid/PlantUML、MDX 保留块、HTML 修改撤销、XMind 修改撤销，以及亮色和 720 像素深色布局，详见实施记录。浏览器页面的保存按钮仅保存内存快照；集成测试对文件写入参数进行断言，两者均不是原生文件保存的替代证据。

最终暂存区快照执行 `npx tauri build --config tests/markdown-native-review.conf.json --bundles app` 成功，生成 `src-tauri/target/release/bundle/macos/DEditor Markdown Review.app`。这是编译和打包证据，未计为原生交互通过。

## 环境、告警与尚未验证范围

- 本机自动化使用 macOS、Node 23.11.1；依赖中的 nanoid 6 提示其支持 Node 22/24/26，安装、功能测试和构建仍成功。README 建议使用 22 或 24；本轮未将这些版本记为实测。系统默认旧 Node 无法启动 Vite，显式使用上述 Node 后启动正常。
- 既有组件回归夹具有重复 createRoot 告警，断言全部通过；新 Markdown 集成夹具收集运行时异常并要求为空。生产构建仍提示部分既有及可视编辑块超过 500 KB，未将这些告警隐藏或作为性能合格依据。
- 隔离 Markdown macOS 应用的原生 UI 控制连接多次超时，因此真实中文输入法、系统菜单、保存/另存/自动保存、关闭重启完整链路仍未验收。Windows 环境不可用。不得写成“完整双平台验收通过”。
- 仍需继续实际验收所有表格行列控件、图片/链接浮层、复杂粘贴、长阅读页面输入与多标签内存。MDX 是整篇源码保留，不是 JSX 可视化编辑；结构调整允许规范化被修改的块。
- 测试只使用自建样例及隔离应用 identifier，未读取或重置正式用户文档/状态。临时日志位于 `/tmp/deditor-markdown-release-logs/`；快照位置记录在 `/tmp/deditor-markdown-release-location`，均不属于 Git 交付。截图和安装包同样不会随 Git 同步。

## 文档更新

README 已按当前代码整体重写：四种 Markdown 模式、保真与 MDX 边界、七种导出、其他文件能力、快捷键、依赖启动/打包、完整测试入口、真实状态文件位置、日志和授权说明。删除未经证实的固定性能/体积、Office 导入及许可证表述。AGENTS 和 Markdown 上下文同步本次实施及后续验收范围；独立 XMind 验收不因此标为完成。

## 本机日志校验

以下 SHA-256 对应最终测试日志；日志留在上述临时目录，不承诺随代码同步。

- `install.log`：`9c6c09d3ccabfda49dc57989f05859ab02d5e25d9afa52470a7563bb3f19df77`
- `functional.log`：`d40e7aff576bc54a07c740f09a6468bdd554ff2a9bb8c3c6b872c536f3056354`
- `performance.log`：`adc7158ada793b068afa369c8255cdbd51b836e4cb99c10327db9fb9e62fadad`
- `rust.log`：`61e23d7209f5e9529ef76be6ed239333232709ac8131f8e8567ad9c73129d0f0`
- `build-final.log`：`af7ef7f97920d339cb50718cb8a0e9e7a1ea8fcee81be336527f5b9b759a6c55`
- `native-build.log`：`c6b19b36c82ebb88ac0053abff6fdec581766db4aaddd8c0e8390a7391b2d3a1`
