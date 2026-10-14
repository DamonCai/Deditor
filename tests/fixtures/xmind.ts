import { zipSync, strToU8 } from "fflate";
import type { Sheet } from "../../src/lib/xmind/document";
export function sampleSheets(): Sheet[] {
  return [
    {
      id: "sheet-main",
      title: "产品设计",
      theme: {
        map: {
          properties: {
            "svg:fill": "#FAFBFD",
            "multi-line-colors": "#5385C5 #68A389 #D79B65 #A17FC0",
          },
        },
        centralTopic: {
          properties: {
            "svg:fill": "#344D6C",
            "fo:color": "#FFFFFF",
            "fo:font-size": "24pt",
            "shape-class": "org.xmind.topicShape.roundedRect",
          },
        },
        mainTopic: {
          properties: {
            "fo:font-size": "17pt",
            "svg:fill": "#F0F4FA",
            "shape-class": "org.xmind.topicShape.roundedRect",
          },
        },
        subTopic: {
          properties: {
            "fo:font-size": "14pt",
            "shape-class": "org.xmind.topicShape.underline",
          },
        },
      },
      rootTopic: {
        id: "root",
        title: "DEditor\n思维导图体验",
        structureClass: "org.xmind.ui.map.unbalanced",
        customExtension: { keep: ["unknown", 123] },
        notes: {
          plain: { content: "保留这条备注" },
          realHTML: { content: "<b>保留这条备注</b>" },
        },
        children: {
          attached: [
            {
              id: "read",
              title: "原样阅读",
              children: {
                attached: [
                  {
                    id: "colors",
                    title: "主题与分支颜色",
                    style: {
                      id: "custom-style",
                      properties: {
                        "fo:color": "#2563A0",
                        "fo:font-weight": "bold",
                        "line-width": "2",
                      },
                    },
                  },
                  { id: "structures", title: "逻辑图 / 组织图 / 括号图" },
                  {
                    id: "image",
                    title: "嵌入图片",
                    image: {
                      src: "xap:resources/sample.svg",
                      width: 130,
                      height: 70,
                    },
                  },
                ],
              },
              boundaries: [
                {
                  id: "boundary",
                  range: "(0,1)",
                  title: "布局与外观",
                  style: { properties: { "svg:fill": "#DCECF9" } },
                },
              ],
            },
            {
              id: "edit",
              title: "直观编辑",
              notes: { plain: { content: "双击编辑；Tab 新建子主题" } },
              labels: ["键盘", "拖拽"],
              children: {
                attached: [
                  { id: "keyboard", title: "Tab / Enter / F2" },
                  { id: "undo", title: "撤销与重做" },
                  { id: "drag", title: "拖拽改变层级" },
                ],
                callout: [{ id: "callout", title: "不重置画布" }],
              },
            },
            {
              id: "safe",
              title: "可靠保存",
              markers: [{ markerId: "priority-1" }],
              children: {
                attached: [
                  { id: "preserve", title: "保留未知字段" },
                  { id: "assets", title: "保留图片和附件" },
                ],
                summary: [{ id: "summary-topic", title: "无损往返" }],
              },
              summaries: [
                { id: "summary", range: "(0,1)", topicId: "summary-topic" },
              ],
            },
            {
              id: "local",
              title: "离线使用",
              children: {
                attached: [
                  { id: "private", title: "文档不上传" },
                  { id: "performance", title: "本地渲染" },
                ],
              },
            },
          ],
          detached: [
            {
              id: "floating",
              title: "自由主题\n保持原始坐标",
              position: { x: 450, y: 420 },
              style: {
                properties: {
                  "svg:fill": "#FFF5DD",
                  "shape-class": "org.xmind.topicShape.roundedRect",
                },
              },
              children: {
                attached: [{ id: "floating-child", title: "独立子树" }],
              },
            },
          ],
        },
      },
      relationships: [
        {
          id: "rel",
          end1Id: "read",
          end2Id: "edit",
          title: "同一个画布",
          controlPoints: { "0": { x: 8, y: 9 } },
        },
      ],
    },
    {
      id: "sheet-org",
      title: "组织结构",
      rootTopic: {
        id: "org-root",
        title: "项目组",
        structureClass: "org.xmind.ui.org-chart.down",
        children: {
          attached: [
            {
              id: "design",
              title: "设计",
              children: {
                attached: [
                  { id: "ux", title: "交互" },
                  { id: "visual", title: "视觉" },
                ],
              },
            },
            {
              id: "dev",
              title: "研发",
              children: {
                attached: [
                  { id: "frontend", title: "前端" },
                  { id: "backend", title: "后端" },
                ],
              },
            },
            {
              id: "qa",
              title: "质量保障",
              children: { attached: [{ id: "test", title: "测试" }] },
            },
          ],
        },
      },
    },
  ];
}
export function sampleArchive(sheets = sampleSheets()) {
  return zipSync({
    "content.json": strToU8(JSON.stringify(sheets)),
    "metadata.json": strToU8(JSON.stringify({creator:{name:'DEditor synthetic review',version:'10'},
      dataStructureVersion:'3',layoutEngineVersion:'5',custom:true})),
    "manifest.json": strToU8(JSON.stringify({'file-entries':Object.fromEntries(
      ['content.json','metadata.json','resources/sample.svg','attachments/keep.bin'].map(name=>[name,{}]))})),
    "resources/sample.svg": strToU8(
      '<svg xmlns="http://www.w3.org/2000/svg" width="130" height="70"><rect width="130" height="70" rx="10" fill="#5385C5"/><path d="M24 35H106M65 16V54" stroke="white" stroke-width="3"/></svg>',
    ),
    "attachments/keep.bin": new Uint8Array([0, 255, 12, 23]),
  });
}
