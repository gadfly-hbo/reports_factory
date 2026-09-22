/**
 * 设计系统 token —— 采用 JuanerAI Prism 棱镜设计语言（全局规范默认基线）。
 * 语义色固定含义（Colors）：green 已确认 / amber 待复核·待验证 / red 风险 /
 * teal 信息 / violet 建议。状态绝不只用颜色表达，必须同时带文字。
 * 字体不打包文件：HTML/PDF 走系统字体栈，PPTX 指定字体名依赖目标环境回退。
 */
export const slide = {
  widthPx: 1280,
  heightPx: 720,
  widthIn: 13.333,
  heightIn: 7.5,
};

export const palette = {
  bg: '#f5f7fa',
  surface: '#ffffff',
  surface2: '#f9fafb',
  surface3: '#eef2f6',
  text: '#17202a',
  muted: '#5d6b7d',
  soft: '#8a96a6',
  border: '#dce3ea',
  borderStrong: '#c2ccd8',
  primary: '#155e75',
  primarySoft: '#e2eff3',
  primaryInk: '#0c3b4a',
  teal: '#0f766e',
  tealSoft: '#dff3f0',
  green: '#156f43',
  greenSoft: '#e5f6ed',
  amber: '#8f6100',
  amberSoft: '#fff3cf',
  red: '#ba3030',
  redSoft: '#ffe6e6',
  violet: '#6d4fc2',
  violetSoft: '#efebfb',
};

export const fontStack =
  'Inter, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif';
export const pptxFont = 'Microsoft YaHei';

/** 图表分类色板：主色墨青起，克制扩展 */
export const chartPalette = ['#155e75', '#0f766e', '#8a96a6', '#8f6100', '#6d4fc2'];

export const statusVisual: Record<string, { fg: string; bg: string; label: string }> = {
  confirmed: { fg: palette.green, bg: palette.greenSoft, label: '已确认' },
  needs_review: { fg: palette.amber, bg: palette.amberSoft, label: '待复核' },
  unverified: { fg: palette.amber, bg: palette.amberSoft, label: '待验证' },
  pending: { fg: palette.muted, bg: palette.surface3, label: '待决' },
};

export const fontSize = {
  kicker: 13,
  headlineBase: 34,
  headlineFloor: 24,
  body: 16,
  footnote: 12,
  coverTitle: 44,
  coverSubtitle: 20,
  coverMeta: 13,
};

export const pptxFontSize = {
  kicker: 11,
  headlineBase: 26,
  headlineFloor: 18,
  body: 13,
  bullet: 13,
  table: 12,
  footnote: 10,
  coverTitle: 40,
  coverSubtitle: 18,
  coverMeta: 12,
};

import type { PageType } from '../schema/report-spec.js';

export const pageTypeLabels: Record<PageType, string> = {
  cover: '封面',
  summary: '结论摘要',
  metrics_overview: '指标总览',
  trend: '趋势对比',
  issue_breakdown: '问题拆解',
  option_comparison: '方案比较',
  action_items: '行动与待决',
  evidence_appendix: '证据附录',
};
