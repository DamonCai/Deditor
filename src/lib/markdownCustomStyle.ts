const scope = ':is(.md-surface.md-document, .md-surface .md-document)';
const properties = /^(?:color|background-color|line-height|letter-spacing|word-spacing|text-align|text-indent|text-decoration(?:-color|-line|-style|-thickness)?|white-space|overflow-wrap|word-break|margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?|border(?:-(?:top|right|bottom|left))?(?:-color|-style|-width|-radius)?|max-width|width)$/;
/** Document-only appearance rules; no font replacement, external assets or global selectors. */
export function markdownCustomStyle(source: string): string {
  if (!source.trim() || source.length > 32768 || typeof CSSStyleSheet === 'undefined') return '';
  try {
    const sheet = new CSSStyleSheet(); sheet.replaceSync(source);
    const render = (rules: CSSRuleList): string => Array.from(rules).map(rule => {
      if (rule.type === CSSRule.STYLE_RULE) {
        const style = rule as CSSStyleRule;
        const declarations = Array.from(style.style).filter(name => properties.test(name)).map(name=>`${name}:${style.style.getPropertyValue(name)}${style.style.getPropertyPriority(name) ? ' !important' : ''}`).join(';');
        if (!declarations) return '';
        // :is preserves selector lists without splitting commas inside selectors.
        const selector = style.selectorText.replace(/(^|[\s,])(body|html|:root|\.md-document)(?=[\s,>+~.#[:]|$)/g, '$1.md-document');
        return `${scope} :is(${selector}), ${scope}:is(${selector}) {${declarations}}`;
      }
      if (rule.type === CSSRule.MEDIA_RULE) return `@media ${(rule as CSSMediaRule).conditionText} {${render((rule as CSSMediaRule).cssRules)}}`;
      return '';
    }).join('\n');
    return render(sheet.cssRules);
  } catch { return ''; }
}
