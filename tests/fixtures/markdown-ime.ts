/** Self-created text for native pinyin composition and viewport checks. */
export const imeMarkdown = "# 中文输入法滚动测试\n\n" + Array.from({ length: 25 }, (_, index) => {
  const n = index + 1;
  return `## 第 ${n} 节\n\n这是第 ${n} 段中文输入测试。候选字确认时页面不应跳动。\n\n`;
}).join("");
