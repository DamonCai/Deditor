# XML 与文本高亮横向检查（2026-09-11）

用户提供的文件为 `AiModelMapper.xml`（MyBatis Mapper）。只读取了用户明确提供的该文件，未修改它；所有验证均使用自行生成的样例。

## 原因和修复

`.xml` 已有正确的XML解析器映射，并非完全没有实现XML。原开发浏览器用生成的XML复现了整页无高亮，语言加载报 `Unrecognized extension value in extension set`，提示多个CodeMirror State实例。报错编辑器仍引用旧预构建chunk，而XML语法模块引用新的共享chunk。独立缓存服务器能正常高亮同类XML，确认开发依赖缓存混用能造成这一症状。

Vite现在在首次服务页面前统一预构建语言包和legacy模式，并对CodeMirror及Lezer核心依赖去重。生产代码仍按需加载语法。修正过期语言请求的失败处理，避免快速切换文件后，旧请求失败清空新文件高亮。

横向修正：

- XML衍生格式：XSD、XSL/XSLT、XHTML、XAML、WSDL、POM、TLD、RESX、项目描述等使用XML语法；SVG作为源文本渲染时使用XML，正常打开仍保留图片预览。
- JSON5补映射，JSONC/JSON5使用容忍注释和扩展语法的JSON模式；`.mts/.cts`识别为TypeScript，其中`.mts`不再误进二进制视频列表。
- Kotlin、Scala、C#、Perl、INI、SCSS/Sass/Less、Vue/Svelte改用对应语法，替换原来的Java/C++/Shell/CSS/HTML代用映射。新增Svelte语法包。
- CSV/TSV、日志、Makefile、忽略规则使用相应的文本高亮；Diff/Patch改用Diff语法，删除行着红色、增加行着绿色。普通Text及未知类型不再被当成Shell。
- 接入已安装language-data中原先遗漏的语言和文件名识别；保持元数据轻量，解析器继续懒加载。补齐环境变量文件后缀、Dockerfile变体、CMake等文件名。
- 预览加载支持Shiki别名。没有Shiki语法但有编辑器语法的类型，使用编辑器语法和当前主题生成已转义的高亮HTML，避免再次变成无色文字。

完整扩展名及预览后备清单见 [覆盖清单](syntax-highlighting-inventory-2026-09-11.md)。源码语法和库版本依据本地已安装包；在线核对了 [Shiki语言与别名说明](https://shiki.style/languages)。

## 验证轮次

轮1 — 用例：原故障XML、生成的MyBatis Mapper、XML大写扩展名和衍生格式。
期望：XML解析器成功挂载，标签、属性、属性值分别着色，不读取DTD网络资源。
实测：修复前浏览器0个语法span并记录重复实例异常；修复后Mapper样例24个语法token，浏览器26个span。亮色标签/属性/属性值分别为rgb(0,51,179)、rgb(102,14,122)、rgb(6,125,23)，暗色分别为rgb(207,142,109)、rgb(170,169,252)、rgb(106,171,115)。
结果：通过。MyBatis标签内SQL正文属于XML文本；本次未加入MyBatis专用SQL语义解析。

轮2 — 用例：全部注册的文本扩展名，以及47份有效语言样例。
期望：每个文本类型的语法均可加载、挂载；样例产生实际语法token；代码预览有颜色。
实测：252种文本扩展名加载和挂载通过，47份生成样例的编辑器token和Shiki/编辑器后备预览检查通过，纯文本及TypeScript模块边界通过。
结果：通过。加载全覆盖不等于每种语言全部语法构造都经过验收。

轮3 — 用例：亮暗主题、连续切换类型、旧语言请求延迟失败。
期望：切换后使用新文件语法、主题颜色正确，旧请求不能清空新语法。
实测：浏览器亮色核对XML及11次不同类型切换，暗色逐个核对47份样例后无语言加载错误；每次日志对应当前文件。组件回归验证旧XML请求失败后Python的高亮DOM保持原样。
结果：通过。开发服务器完成修复后的首次预构建后，样例切换未再触发新依赖预构建或重载。

轮4 — 用例：预览别名、无Shiki语法的忽略文件、包含HTML样式字符的原始文本。
期望：别名正确加载；后备高亮保留原文和换行，不能把源文本解释为HTML节点。
实测：Shell别名及忽略文件在亮暗两种主题下均生成有色span，代码文本与输入一致，`<script>`保持转义且无script节点。初次检查发现安装版本没有gitignore语法，现已接入编辑器语法后备并通过。
结果：通过。

## 检查结果及范围

- `npm run test:syntax`：252种扩展名加载、47份语法样例及边界检查通过。
- `npm run test:regression`：114 passed，0 failed。
- `npm run build`：通过，10.62秒；保留已有大chunk提示。
- `npm run perf:lang`：18组兼容用例、40个断言通过。
- `git diff --check`：通过。

样例源码在 `tests/fixtures/syntax-highlighting.ts`；检查脚本在 `scripts/test-syntax.ts`；语言目录生成器为 `scripts/generate-language-catalog.mjs`，升级language-data后应重新运行。临时浏览器入口、缓存隔离配置和日志在被忽略的 `tests/artifacts/syntax-highlighting/`。

本次包含真实浏览器中的着色、切换及主题验证，未重新安装macOS/Windows原生包。用户文件仅用来确认格式，未将开发浏览器样例结果表述为已实测用户原生窗口。
