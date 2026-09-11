import { PUNCTUATION_SHAPES, isPunctuationShape, punctuationPadding } from './punctuationShapes';
import { ADVANCED_SHAPES, FLOWCHART_SHAPES, advancedShapeScale, flowContentScale, referenceSymbol } from './shapePaths';

export const TOPIC_SHAPES = [
  'roundedRect', 'rect', 'ellipse', 'diamond', 'underline', 'ellipserect.compact',
  'circle.compact', 'doubleunderline', 'parallelogram', 'hexagon', 'roundedhexagon', 'ellipticrectangle',
] as const;
export const ALL_TOPIC_SHAPES = [...TOPIC_SHAPES, ...ADVANCED_SHAPES, ...PUNCTUATION_SHAPES, ...FLOWCHART_SHAPES] as const;

export function shapeName(shape: string): string {
  const name = shape.replace(/^org\.xmind\.topicShape\./, '').toLowerCase();
  return name === 'ellipserect.compact' ? 'pill' : name;
}

/** Shape-specific room around the already padded content rectangle. */
export function shapeSize(shape: string, width: number, height: number) {
  const name = shapeName(shape);
  if (isPunctuationShape(name)) return { width: width + punctuationPadding(name), height };
  if(referenceSymbol(name))return {width:Math.max(width,80),height:height+80};
  const flowScale=flowContentScale(name);
  if(flowScale)return {width:width*flowScale[0],height:height*flowScale[1]};
  const advancedScale = advancedShapeScale(name);
  if (advancedScale) return { width: width * advancedScale, height: height * advancedScale };
  if (name.startsWith('circle')) {
    const diameter = Math.hypot(width, height) + (name==='circle.double'?16:0);
    return { width: diameter, height: diameter };
  }
  if (/ellipse|oval/.test(name)) return { width: width * Math.SQRT2, height: height * Math.SQRT2 };
  if (name === 'diamond') return { width: width * 2, height: height * 2 };
  if (name === 'pill') return { width: width + height, height };
  if (name === 'hexagon') return { width: width + height * 0.5, height };
  if (name === 'roundedhexagon' || name === 'ellipticrectangle') return { width, height: height / 0.6 };
  if (name === 'parallelogram') return { width: width + height * 0.6, height };
  return { width, height };
}

export function shapePolygon(shape: string, w: number, h: number): [number, number][] | undefined {
  const name = shapeName(shape);
  if (name === 'diamond') return [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]];
  if (name === 'hexagon') {
    const cut = Math.min(w / 4, h / 4);
    return [[cut,0],[w-cut,0],[w,h/2],[w-cut,h],[cut,h],[0,h/2]];
  }
  if (name === 'roundedhexagon') return [[w/2,0],[w,h*0.2],[w,h*0.8],[w/2,h],[0,h*0.8],[0,h*0.2]];
  if (name === 'parallelogram') {
    const slant = Math.min(w * 0.2, h * 0.3);
    return [[slant, 0], [w, 0], [w - slant, h], [0, h]];
  }
}

export function strokeDash(pattern?: string): string | undefined {
  if (pattern === 'dot') return '1 3';
  if (pattern === 'dash') return '5 3';
  if (pattern === 'dash-dot') return '6 3 1 3';
}

/** Curved top/bottom with straight sides, as in the native basic shape palette. */
export function ellipticRectanglePath(w: number, h: number): string {
  return `M0,${h*0.2} Q${w/2},${-h*0.2} ${w},${h*0.2} V${h*0.8} Q${w/2},${h*1.2} 0,${h*0.8} Z`;
}
