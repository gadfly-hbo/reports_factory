/**
 * 设计 token（最小集，M0 tracer 用；完整设计系统在页型全量切片扩展）。
 * 字体不打包文件（proposal §11.3）：HTML/PDF 走系统字体栈，PPTX 指定本机
 * 已有字体名并依赖目标环境回退。
 */
export const slide = {
  widthPx: 1280,
  heightPx: 720,
  widthIn: 13.333,
  heightIn: 7.5,
};

export const tokens = {
  color: {
    ink: '#1F2733',
    muted: '#5B6570',
    accent: '#1D4ED8',
    accentSoft: '#E8EDFB',
    grid: '#E5E9F0',
    surface: '#FFFFFF',
  },
  font: {
    stack: `"PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif`,
    pptx: 'Microsoft YaHei',
  },
  size: {
    kicker: 13,
    headline: 34,
    body: 16,
    footnote: 12,
  },
};

export const pageTypeLabels: Record<string, string> = {
  cover: '封面',
  summary: '结论摘要',
  metrics_overview: '指标总览',
  trend: '趋势对比',
  issue_breakdown: '问题拆解',
  option_comparison: '方案比较',
  action_items: '行动与待决',
  evidence_appendix: '证据附录',
};
