// Page 07 / Content — 两大范本：抖音全域与微信小店原生闭环
import pptxgen from 'pptxgenjs';

export function buildSlide(pptx) {
  const t = {
    primary: '263442', accent1: 'B44626', accent2: '5A6675',
    light: 'F7F6F3', ink: '242830', muted: '626773', line: 'DEDCD6',
  };

  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };

  // 顶部小标
  s.addShape('rect', { x: 0.6, y: 0.55, w: 0.7, h: 0.06, fill: { color: t.accent1 } });
  s.addText('05  ·  TWO  REFERENCE  PLAYBOOKS', {
    x: 0.6, y: 0.7, w: 8, h: 0.35,
    fontFace: 'Arial', fontSize: 10, color: t.accent2, bold: true, charSpacing: 4,
  });

  // 大标题
  s.addText('两大范本：抖音全域 vs 微信小店原生闭环', {
    x: 0.6, y: 1.1, w: 12, h: 0.7,
    fontFace: 'PingFang SC', fontSize: 26, color: t.primary, bold: true,
  });
  s.addText('公域内部闭环（抖音）vs 跨平台原生闭环（微信）——两种最值得布局的方法论', {
    x: 0.6, y: 1.82, w: 12, h: 0.4,
    fontFace: 'PingFang SC', fontSize: 13, color: t.accent2,
  });

  // ===== 左栏：抖音全域 =====
  const lx = 0.6, ly = 2.4, lw = 5.95, lh = 4.45;
  // 卡底
  s.addShape('rect', {
    x: lx, y: ly, w: lw, h: lh,
    fill: { color: t.light }, line: { color: t.line, width: 0.75 },
  });
  // 顶部栏头主色条
  s.addShape('rect', {
    x: lx, y: ly, w: lw, h: 0.55,
    fill: { color: t.primary }, line: { type: 'none' },
  });
  // 栏头小标
  s.addText('PLAYBOOK  A', {
    x: lx + 0.25, y: ly + 0.13, w: 2, h: 0.3,
    fontFace: 'Arial', fontSize: 10, color: t.accent1, bold: true, charSpacing: 4,
  });
  // 栏头标题
  s.addText('抖音 · 公域内部全域经营', {
    x: lx + 0.25, y: ly + 0.78, w: lw - 0.5, h: 0.45,
    fontFace: 'PingFang SC', fontSize: 17, color: t.primary, bold: true,
  });
  // 路径流程 5 步
  s.addText('转化路径', {
    x: lx + 0.25, y: ly + 1.3, w: 3, h: 0.3,
    fontFace: 'PingFang SC', fontSize: 11, color: t.muted,
  });
  const douyinPath = ['短视频', '搜索复搜', '商品卡', '直播转化', '店铺复购'];
  const dpW = (lw - 0.5) / 5 - 0.05;
  douyinPath.forEach((p, i) => {
    const x = lx + 0.25 + i * (dpW + 0.05);
    s.addShape('rect', {
      x, y: ly + 1.65, w: dpW, h: 0.32,
      fill: { color: t.primary }, line: { type: 'none' },
    });
    s.addText(p, {
      x, y: ly + 1.65, w: dpW, h: 0.32,
      fontFace: 'PingFang SC', fontSize: 9, color: 'FFFFFF', bold: true,
      align: 'center', valign: 'middle',
    });
    if (i < douyinPath.length - 1) {
      s.addText('→', {
        x: x + dpW - 0.03, y: ly + 1.65, w: 0.08, h: 0.32,
        fontFace: 'Arial', fontSize: 10, color: t.accent1, bold: true,
        align: 'center', valign: 'middle',
      });
    }
  });

  // 关键数据（3 条）
  const dStats = [
    { v: '4 万亿',  k: '2025 抖音电商 GMV' },
    { v: '51%',    k: '品牌自播占比（已超达人）' },
    { v: '+45%',   k: '店播商家数同比增长' },
  ];
  dStats.forEach((d, i) => {
    const x = lx + 0.25 + i * ((lw - 0.5) / 3);
    s.addShape('rect', {
      x, y: ly + 2.2, w: (lw - 0.5) / 3 - 0.05, h: 0.75,
      fill: { color: 'FFFFFF' }, line: { color: t.line, width: 0.5 },
    });
    s.addText(d.v, {
      x: x + 0.1, y: ly + 2.25, w: (lw - 0.5) / 3 - 0.25, h: 0.4,
      fontFace: 'Arial', fontSize: 18, color: t.accent1, bold: true,
    });
    s.addText(d.k, {
      x: x + 0.1, y: ly + 2.65, w: (lw - 0.5) / 3 - 0.25, h: 0.3,
      fontFace: 'PingFang SC', fontSize: 8, color: t.muted,
    });
  });

  // 关键打法（要点列表）
  s.addText('关键打法', {
    x: lx + 0.25, y: ly + 3.1, w: 3, h: 0.3,
    fontFace: 'PingFang SC', fontSize: 11, color: t.muted,
  });
  const dActs = [
    '千川全域投放：用付费流量撬动自然流量',
    'AI 智能托管：人机协同 + 跨平台人群包',
    '店播蓝海时段：早 6–9、午 12–14 避开大主播',
  ];
  dActs.forEach((a, i) => {
    const ay = ly + 3.4 + i * 0.32;
    s.addShape('rect', { x: lx + 0.25, y: ay + 0.12, w: 0.08, h: 0.08, fill: { color: t.accent1 }, line: { type: 'none' } });
    s.addText(a, {
      x: lx + 0.4, y: ay, w: lw - 0.65, h: 0.3,
      fontFace: 'PingFang SC', fontSize: 10, color: t.ink, valign: 'middle',
    });
  });

  // ===== 右栏：微信小店 =====
  const rx = 6.78, ry = 2.4, rw = 5.95, rh = 4.45;
  s.addShape('rect', {
    x: rx, y: ry, w: rw, h: rh,
    fill: { color: t.light }, line: { color: t.line, width: 0.75 },
  });
  // 顶部 accent1 条（与左栏对比）
  s.addShape('rect', {
    x: rx, y: ry, w: rw, h: 0.55,
    fill: { color: t.accent1 }, line: { type: 'none' },
  });
  s.addText('PLAYBOOK  B', {
    x: rx + 0.25, y: ry + 0.13, w: 2, h: 0.3,
    fontFace: 'Arial', fontSize: 10, color: 'FFFFFF', bold: true, charSpacing: 4,
  });
  s.addText('微信 · 跨域公私域原生闭环', {
    x: rx + 0.25, y: ry + 0.78, w: rw - 0.5, h: 0.45,
    fontFace: 'PingFang SC', fontSize: 17, color: t.primary, bold: true,
  });

  s.addText('飞轮路径', {
    x: rx + 0.25, y: ry + 1.3, w: 3, h: 0.3,
    fontFace: 'PingFang SC', fontSize: 11, color: t.muted,
  });
  const wxPath = ['公域获新', '小店成交', '私域沉淀', '复购裂变'];
  const wpW = (rw - 0.5) / 4 - 0.05;
  wxPath.forEach((p, i) => {
    const x = rx + 0.25 + i * (wpW + 0.05);
    s.addShape('rect', {
      x, y: ry + 1.65, w: wpW, h: 0.32,
      fill: { color: t.accent1 }, line: { type: 'none' },
    });
    s.addText(p, {
      x, y: ry + 1.65, w: wpW, h: 0.32,
      fontFace: 'PingFang SC', fontSize: 9, color: 'FFFFFF', bold: true,
      align: 'center', valign: 'middle',
    });
    if (i < wxPath.length - 1) {
      s.addText('→', {
        x: x + wpW - 0.03, y: ry + 1.65, w: 0.08, h: 0.32,
        fontFace: 'Arial', fontSize: 10, color: t.primary, bold: true,
        align: 'center', valign: 'middle',
      });
    }
  });

  // 关键数据
  const wStats = [
    { v: '×2',     k: '2025 全域带货规模翻倍' },
    { v: '4.3×',   k: '品牌增速为大盘倍数' },
    { v: '−30%',   k: '部分类目获客成本低于其他平台' },
  ];
  wStats.forEach((d, i) => {
    const x = rx + 0.25 + i * ((rw - 0.5) / 3);
    s.addShape('rect', {
      x, y: ry + 2.2, w: (rw - 0.5) / 3 - 0.05, h: 0.75,
      fill: { color: 'FFFFFF' }, line: { color: t.line, width: 0.5 },
    });
    s.addText(d.v, {
      x: x + 0.1, y: ry + 2.25, w: (rw - 0.5) / 3 - 0.25, h: 0.4,
      fontFace: 'Arial', fontSize: 18, color: t.accent1, bold: true,
    });
    s.addText(d.k, {
      x: x + 0.1, y: ry + 2.65, w: (rw - 0.5) / 3 - 0.25, h: 0.3,
      fontFace: 'PingFang SC', fontSize: 8, color: t.muted,
    });
  });

  // 关键打法
  s.addText('关键打法', {
    x: rx + 0.25, y: ry + 3.1, w: 3, h: 0.3,
    fontFace: 'PingFang SC', fontSize: 11, color: t.muted,
  });
  const wActs = [
    '送礼物 / 一起买 / 点赞买降低决策门槛',
    '公众号种草 → 企微沉淀 → 视频号直播拔草',
    '私域 UGC 反哺公域：晒单视频 CTR 优于硬广',
  ];
  wActs.forEach((a, i) => {
    const ay = ry + 3.4 + i * 0.32;
    s.addShape('rect', { x: rx + 0.25, y: ay + 0.12, w: 0.08, h: 0.08, fill: { color: t.accent1 }, line: { type: 'none' } });
    s.addText(a, {
      x: rx + 0.4, y: ay, w: rw - 0.65, h: 0.3,
      fontFace: 'PingFang SC', fontSize: 10, color: t.ink, valign: 'middle',
    });
  });

  // 底部洞察条
  s.addShape('rect', {
    x: 0.6, y: 7.0, w: 12.13, h: 0.35,
    fill: { color: t.primary }, line: { type: 'none' },
  });
  s.addText('结论：抖音适合"公域内部跑通全链路"的样本，微信小店适合"有私域基础 + 高复购品类"的样本——两条路不要互斥。', {
    x: 0.7, y: 7.0, w: 12.0, h: 0.35,
    fontFace: 'PingFang SC', fontSize: 11, color: 'FFFFFF', valign: 'middle',
  });

  // 页码徽章
  s.addShape('ellipse', { x: 12.55, y: 7.43, w: 0.3, h: 0.3, fill: { color: t.accent1 } });
  s.addText('07', {
    x: 12.55, y: 7.43, w: 0.3, h: 0.3,
    fontFace: 'Arial', fontSize: 9, color: 'FFFFFF', align: 'center', valign: 'middle', bold: true,
  });

  return s;
}