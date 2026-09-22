import * as echarts from 'echarts';
import type { ChartSpec } from '../schema/report-spec.js';
import { chartPalette, fontStack, palette } from './theme.js';

/** 图表缺数据：占位提示，不渲染图表（proposal §4.2：缺数据不伪造） */
export function isChartEmpty(chart: ChartSpec): boolean {
  return chart.series.length === 0 || chart.series.every((s) => s.data.length === 0);
}

/**
 * ChartSpec → 内联 SVG（HTML 预览与 PDF 共用；SSR 渲染，无网络无 canvas）。
 * PPTX 端不经过本函数——同一 ChartSpec 喂给 pptxgenjs 原生 chart。
 */
export function renderChartSvg(chart: ChartSpec, width = 720, height = 420): string {
  if (isChartEmpty(chart)) {
    throw new Error(`chart ${chart.chart_id} has no data; render placeholder instead`);
  }
  const ec = echarts.init(null as unknown as HTMLElement, null, {
    renderer: 'svg',
    ssr: true,
    width,
    height,
  });
  const labels = chart.series[0]!.data.map((d) => d.label);
  const baseTextStyle = { fontFamily: fontStack, color: palette.text };

  const option: echarts.EChartsCoreOption = {
    animation: false,
    textStyle: baseTextStyle,
    grid: { left: 56, right: 24, top: 48, bottom: 36 },
    tooltip: { show: false },
    legend: {
      top: 4,
      right: 8,
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { ...baseTextStyle, fontSize: 12, color: palette.muted },
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { ...baseTextStyle, fontSize: 12, color: palette.muted },
    },
    yAxis: {
      type: 'value',
      axisLabel: { ...baseTextStyle, fontSize: 12, color: palette.muted },
      splitLine: { lineStyle: { color: palette.border } },
    },
    series: chart.series.map((s, i) => ({
      name: s.name,
      type: chart.type === 'line' ? 'line' : 'bar',
      data: s.data.map((d) => d.value),
      barMaxWidth: 28,
      itemStyle: { color: chartPalette[i % chartPalette.length] },
      lineStyle: chart.type === 'line' ? { width: 2.5 } : undefined,
    })),
  };

  if (chart.type === 'pie' || chart.type === 'donut') {
    (option as Record<string, unknown>).series = chart.series.map((s, i) => ({
      name: s.name,
      type: 'pie',
      radius: chart.type === 'donut' ? ['42%', '72%'] : '72%',
      center: ['50%', '56%'],
      label: { ...baseTextStyle, fontSize: 12 },
      data: s.data.map((d) => ({
        name: d.label,
        value: d.value,
        itemStyle: { color: chartPalette[(i + s.data.indexOf(d)) % chartPalette.length] },
      })),
    }));
    (option as Record<string, unknown>).xAxis = undefined;
    (option as Record<string, unknown>).yAxis = undefined;
    (option as Record<string, unknown>).grid = undefined;
  }

  if (chart.title) {
    (option as Record<string, unknown>).title = {
      text: chart.title,
      left: 8,
      top: 4,
      textStyle: { ...baseTextStyle, fontSize: 14, fontWeight: 600 },
    };
  }

  ec.setOption(option);
  const svg = ec.renderToSVGString();
  ec.dispose();
  return svg;
}
