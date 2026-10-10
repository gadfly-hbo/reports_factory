// P1 - 封面：森马品牌成交人群画像对比分析（含数据预览锚点）
import pptxgen from 'pptxgenjs';

export function buildSlide(pptx) {
  const t = {
    primary: '263442',
    accent1: 'B44626',
    accent2: '5A6675',
    light:   'F7F6F3',
    ink:     '242830',
    muted:   '626773',
    line:    'DEDCD6'
  };

  const s = pptx.addSlide();
  s.background = { color: t.primary };

  // 顶部装饰细线（accent1）
  s.addShape('rect', {
    x: 0, y: 0, w: 13.33, h: 0.06,
    fill: { color: t.accent1 }, line: { color: t.accent1 }
  });

  // 右上角小标 + 色块
  s.addText('SEMIR  ·  AUDIENCE PROFILE COMPARISON', {
    x: 8.5, y: 0.45, w: 4.5, h: 0.3,
    fontSize: 11, fontFace: 'Arial',
    color: 'FFFFFF', charSpacing: 6, bold: true, align: 'right'
  });
  s.addShape('rect', {
    x: 11.85, y: 0.92, w: 1.2, h: 0.08,
    fill: { color: t.accent1 }, line: { color: t.accent1 }
  });

  // 左侧主标题区
  s.addShape('rect', {
    x: 0.7, y: 2.05, w: 0.12, h: 1.4,
    fill: { color: t.accent1 }, line: { color: t.accent1 }
  });

  s.addText('对比分析报告  ·  2025.09 vs 2026.09', {
    x: 0.95, y: 1.95, w: 7.5, h: 0.35,
    fontSize: 12, fontFace: 'Microsoft YaHei',
    color: t.accent2, charSpacing: 3
  });

  // 主标题（中文，两行）
  s.addText('森马品牌成交人群', {
    x: 0.95, y: 2.4, w: 7.8, h: 0.85,
    fontSize: 44, fontFace: 'Microsoft YaHei',
    color: 'FFFFFF', bold: true
  });
  s.addText('画像对比分析', {
    x: 0.95, y: 3.25, w: 7.8, h: 0.85,
    fontSize: 44, fontFace: 'Microsoft YaHei',
    color: 'FFFFFF', bold: true
  });

  // 副标题：周期
  s.addText('2025 / 09   →   2026 / 09   年度同比', {
    x: 0.95, y: 4.2, w: 7.8, h: 0.4,
    fontSize: 16, fontFace: 'Arial',
    color: 'DEDCD6', charSpacing: 3
  });

  // 三条洞察小卡（左下）
  const tags = [
    { l: '女性主导', v: '85.87%', d: '+2.68pp' },
    { l: 'GenZ 增量', v: '15.82%', d: '+3.84pp' },
    { l: '时尚兴趣', v: '76.07%', d: '+2.81pp' }
  ];
  const tagY = 5.05, tagW = 2.45, tagGap = 0.18;
  tags.forEach((tag, i) => {
    const x = 0.95 + i * (tagW + tagGap);
    s.addShape('rect', {
      x, y: tagY, w: tagW, h: 1.05,
      fill: { color: '34465A' }, line: { color: t.accent1, width: 0.5 }
    });
    s.addText(tag.l, {
      x: x + 0.18, y: tagY + 0.1, w: tagW - 0.3, h: 0.3,
      fontSize: 11, fontFace: 'Microsoft YaHei', color: t.accent2
    });
    s.addText(tag.v, {
      x: x + 0.18, y: tagY + 0.36, w: tagW - 0.3, h: 0.45,
      fontSize: 22, fontFace: 'Arial', color: 'FFFFFF', bold: true
    });
    s.addText(tag.d, {
      x: x + 0.18, y: tagY + 0.78, w: tagW - 0.3, h: 0.25,
      fontSize: 11, fontFace: 'Arial', color: t.accent1, bold: true
    });
  });

  // 右侧「数据预览」视觉锤大数字
  s.addShape('rect', {
    x: 9.1, y: 1.4, w: 3.6, h: 5.0,
    fill: { color: '34465A' }, line: { color: t.accent1, width: 1 }
  });

  s.addText('KEY  NUMBERS', {
    x: 9.3, y: 1.55, w: 3.2, h: 0.3,
    fontSize: 10, fontFace: 'Arial',
    color: t.accent2, charSpacing: 5, bold: true
  });
  s.addText('成交人群核心变化', {
    x: 9.3, y: 1.85, w: 3.2, h: 0.4,
    fontSize: 16, fontFace: 'Microsoft YaHei',
    color: 'FFFFFF', bold: true
  });

  // 分隔线
  s.addShape('rect', {
    x: 9.3, y: 2.35, w: 3.2, h: 0.02,
    fill: { color: t.accent1 }, line: { color: t.accent1 }
  });

  // 大数字 1：女性占比
  s.addText('85.87%', {
    x: 9.3, y: 2.5, w: 3.2, h: 0.7,
    fontSize: 42, fontFace: 'Arial', color: 'FFFFFF', bold: true
  });
  s.addText('女性成交占比  ·  +2.68pp YoY', {
    x: 9.3, y: 3.18, w: 3.2, h: 0.25,
    fontSize: 10, fontFace: 'Microsoft YaHei', color: 'DEDCD6'
  });

  // 分隔
  s.addShape('rect', {
    x: 9.3, y: 3.5, w: 3.2, h: 0.01,
    fill: { color: '5A6675' }, line: { color: '5A6675' }
  });

  // 大数字 2：GenZ
  s.addText('15.82%', {
    x: 9.3, y: 3.6, w: 3.2, h: 0.7,
    fontSize: 42, fontFace: 'Arial', color: t.accent1, bold: true
  });
  s.addText('GenZ 群体占比  ·  +3.84pp YoY', {
    x: 9.3, y: 4.28, w: 3.2, h: 0.25,
    fontSize: 10, fontFace: 'Microsoft YaHei', color: 'DEDCD6'
  });

  // 分隔
  s.addShape('rect', {
    x: 9.3, y: 4.6, w: 3.2, h: 0.01,
    fill: { color: '5A6675' }, line: { color: '5A6675' }
  });

  // 大数字 3：抖音时尚
  s.addText('76.07%', {
    x: 9.3, y: 4.7, w: 3.2, h: 0.7,
    fontSize: 42, fontFace: 'Arial', color: 'FFFFFF', bold: true
  });
  s.addText('抖音时尚兴趣  ·  +2.81pp YoY', {
    x: 9.3, y: 5.38, w: 3.2, h: 0.25,
    fontSize: 10, fontFace: 'Microsoft YaHei', color: 'DEDCD6'
  });

  // 底部小标
  s.addText('品牌运营复盘  ·  成交人群对比洞察', {
    x: 9.3, y: 5.95, w: 3.2, h: 0.3,
    fontSize: 11, fontFace: 'Microsoft YaHei',
    color: 'DEDCD6'
  });

  // 底部 accent2 横条
  s.addShape('rect', {
    x: 0, y: 7.38, w: 13.33, h: 0.12,
    fill: { color: t.accent1 }, line: { color: t.accent1 }
  });

  // 底部数据源标识
  s.addText('DATA  SOURCE  ·  阿里达摩盘  ·  森马品牌成交画像', {
    x: 0.6, y: 6.95, w: 8.0, h: 0.3,
    fontSize: 9, fontFace: 'Arial',
    color: '8C97A6', charSpacing: 3
  });

  return s;
}