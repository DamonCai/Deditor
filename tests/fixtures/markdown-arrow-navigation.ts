export const arrowNavigationMarkdown = '* 和  阿斯 ` 水电`\n* <span style="color: red">彩色列表</span>\n* sdf&#x20;\n* \\\n&#x20; 换行后仍可输入\n';

export const arrowNavigationContextMarkdown = "# 长文编辑回归\n\n# 第二个标题\n\n* 普通列表\n* [引用文字][guide] 和 <kbd>Ctrl</kbd>\n" + arrowNavigationMarkdown.replaceAll("&#x20;", " ") + "\n后续正文。\n\n[guide]: https://example.com \"自建引用\"\n";

export const basicEditingMarkdown = '# 基本操作回归\n\n* 普通列表\n* [引用文字][guide] 和 <kbd>Ctrl</kbd>\n* 和  阿斯 ` 水电`\n* <span style="color: red">彩色列</span>\n* \n\n[guide]: https://example.com "自建引用"\n';
