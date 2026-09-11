import type { Sheet, Topic } from "../../src/lib/xmind/document";
import { ARROW_SHAPES, RELATIONSHIP_SHAPES } from "../../src/lib/xmind/arrows";

/** Generated, isolated pairs make native routing and arrow comparisons repeatable. */
export function round9RelationshipSheets(): Sheet[] {
  return [RELATIONSHIP_SHAPES, ARROW_SHAPES].map((values, sheetIndex) => {
    const prefix = `relationship-review-${sheetIndex}`,
      topics: Topic[] = [];
    const relationships = values.map((value, i) => {
      const a = `${prefix}-${i}-a`,
        b = `${prefix}-${i}-b`,
        y = 180 + i * 180;
      topics.push(
        {
          id: a,
          title: `起点 ${i + 1}`,
          position: { x: 80, y },
          style: {
            properties: {
              "shape-class": "org.xmind.topicShape.roundedRect",
              "svg:fill": "#E6EFF8",
              "fo:color": "#203A54",
              "fo:font-size": "18pt",
            },
          },
        },
        {
          id: b,
          title: `终点 ${i + 1}`,
          position: { x: 580, y: y + (sheetIndex === 0 ? 40 : 0) },
          style: {
            properties: {
              "shape-class": "org.xmind.topicShape.roundedRect",
              "svg:fill": "#E5F3EB",
              "fo:color": "#204F38",
              "fo:font-size": "18pt",
            },
          },
        },
      );
      return {
        id: `${prefix}-${i}`,
        end1Id: a,
        end2Id: b,
        title: value,
        style: {
          properties: {
            "shape-class": `org.xmind.relationshipShape.${sheetIndex === 0 ? value : "straight"}`,
            "arrow-begin-class": `org.xmind.arrowShape.${sheetIndex === 0 ? "none" : value}`,
            "arrow-end-class": `org.xmind.arrowShape.${sheetIndex === 0 ? "triangle" : value}`,
            "line-pattern": "solid",
            "line-width": "2pt",
            "line-color": "#348C83",
            "fo:font-size": "14pt",
          },
        },
      };
    });
    return {
      id: prefix,
      title: sheetIndex === 0 ? "联系形状" : "端点箭头",
      rootTopic: {
        id: `${prefix}-root`,
        title: sheetIndex === 0 ? "联系形状对照" : "箭头对照",
        children: { detached: topics },
      },
      relationships,
    };
  });
}

export function round9ColorSheets(): Sheet[] {
  return ["#FFFFFF", "#112244"].map((background, sheetIndex) => ({
    id: `colors-${sheetIndex}`,
    title: sheetIndex ? "深色画布" : "浅色画布",
    style: { properties: { "svg:fill": background } },
    rootTopic: {
      id: `colors-root-${sheetIndex}`,
      title: "透明填充与文字对照",
      children: { detached: [
        ["浅色填充", { "svg:fill": "#FFF4CC" }],
        ["深色填充", { "svg:fill": "#112244" }],
        ["深色填充 20%", { "svg:fill": "#112244", "svg:fill-opacity": "0.2" }],
        ["白色 alpha × 20%", { "svg:fill": "#FFFFFF80", "svg:fill-opacity": "0.2" }],
        ["无填充", { "fill-pattern": "none" }],
        ["指定文字色", { "svg:fill": "#FFF4CC", "fo:color": "#9A2250" }],
      ].map(([title, properties], i) => ({
        id: `color-${sheetIndex}-${i}`,
        title: title as string,
        position: { x: 300 + (i % 2) * 400, y: Math.floor(i / 2) * 170 },
        style: { properties: { ...(properties as Record<string, string>), "border-line-color": "#8192A3", "fo:font-size": "22pt" } },
      })) },
    },
  }));
}
