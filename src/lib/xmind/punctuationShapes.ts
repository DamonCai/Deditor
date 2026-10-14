/** Native punctuation topics have open strokes and never paint a filled polygon. */
export const PUNCTUATION_SHAPES = [
  'singleBookQuote', 'doubleBookQuote', 'squareBracket', 'roundBracket',
  'curlyBracket', 'squareQuote', 'doubleQuote',
] as const;
export function isPunctuationShape(shape: string): boolean {
  const name=shape.replace(/^org\.xmind\.topicShape\./,'').toLowerCase();
  return PUNCTUATION_SHAPES.some(value=>value.toLowerCase()===name);
}
export function punctuationPadding(shape: string): number {
  const name=shape.replace(/^org\.xmind\.topicShape\./,'').toLowerCase();
  return name==='singlebookquote'?64:name==='doublebookquote'?72
    : name==='squarequote'||name==='doublequote'?40:name==='curlybracket'?28:24;
}
export function punctuationPath(shape: string,w: number,h: number): string | undefined {
  const name=shape.replace(/^org\.xmind\.topicShape\./,'').toLowerCase();
  if(!isPunctuationShape(name))return;
  const d=Math.min(18,h*.25,w*.15), cy=h/2;
  if(name==='singlebookquote')return `M${d},0 L0,${cy} L${d},${h} M${w-d},0 L${w},${cy} L${w-d},${h}`;
  if(name==='doublebookquote')return [0,d*.6].map(dx=>`M${d+dx},0 L${dx},${cy} L${d+dx},${h} M${w-d-dx},0 L${w-dx},${cy} L${w-d-dx},${h}`).join(' ');
  if(name==='squarebracket')return `M${d},0 H0 V${h} H${d} M${w-d},0 H${w} V${h} H${w-d}`;
  if(name==='roundbracket')return `M${d},0 C${-d*.3},${h*.2} ${-d*.3},${h*.8} ${d},${h} M${w-d},0 C${w+d*.3},${h*.2} ${w+d*.3},${h*.8} ${w-d},${h}`;
  if(name==='curlybracket')return `M${d},0 Q${d*.4},0 ${d*.4},${h*.15} V${h*.35} Q${d*.4},${cy} 0,${cy} Q${d*.4},${cy} ${d*.4},${h*.65} V${h*.85} Q${d*.4},${h} ${d},${h} M${w-d},0 Q${w-d*.4},0 ${w-d*.4},${h*.15} V${h*.35} Q${w-d*.4},${cy} ${w},${cy} Q${w-d*.4},${cy} ${w-d*.4},${h*.65} V${h*.85} Q${w-d*.4},${h} ${w-d},${h}`;
  if(name==='squarequote')return `M${d},0 H0 V${h*.3} M${w-d},${h} H${w} V${h*.7}`;
  // Double quotes retain a readable size even on a tall multiline topic.
  const q=Math.min(7,h*.16), y=cy-q*.5;
  return [0,q*1.1].map(dx=>`M${dx+q*.8},${y-q*.5} Q${dx},${y-q*.2} ${dx},${y+q} H${dx+q*.7} V${y} H${dx} M${w-dx-q*.8},${y+q*1.5} Q${w-dx},${y+q*1.2} ${w-dx},${y} H${w-dx-q*.7} V${y+q} H${w-dx}`).join(' ');
}
