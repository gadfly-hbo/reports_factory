import pptxgen from 'pptxgenjs';

const pptx = new pptxgen();
pptx.defineLayout({ name: 'W', width: 13.33, height: 7.5 });
pptx.layout = 'W';

const CN = 'PingFang SC';
const EN = 'SF Pro Text';

// Palette (no '#')
const navy = '263442';
const accent = 'b44626';
const paper = 'f7f6f3';
const panel = 'ffffff';
const line = 'dedcd6';
const ink = '242830';
const muted = '626773';
const eyebrowGrey = '758290';

// Background
pptx.background = { color: paper };

const slide = pptx.addSlide();

// Top eyebrow + short bar
slide.addText('01 / 季度核心结论', {
  x: 0.6, y: 0.42, w: 4, h: 0.3,
  fontFace: CN, fontSize: 11, color: accent, bold: true,
  charSpacing: 4
});
slide.addShape('rect', {
  x: 0.6, y: 0.78, w: 0.6, h: 0.06,
  fill: { color: navy }, line: { color: navy }
});

// Title (headline = the conclusion)
slide.addText('季度运营复盘：客流回升但客单价承压', {
  x: 0.6, y: 0.95, w: 12.13, h: 0.9,
  fontFace: CN, fontSize: 26, bold: true, color: ink
});

// Lead paragraph / sub-headline (intent)
slide.addText('本季度客流端回暖明显，会员与转化结构仍为门店贡献主力；价格侧力承压待解。', {
  x: 0.6, y: 1.95, w: 12.13, h: 0.5,
  fontFace: CN, fontSize: 13, color: muted
});

// Three metric cards
const cards = [
  {
    label: '客流',
    big: '12,400',
    unit: '人次',
    delta: '环比 +8.2%',
    sub: '进店客流'
  },
  {
    label: '转化',
    big: '21.5',
    unit: '%',
    delta: '成交转化率',
    sub: '进店到成交'
  },
  {
    label: '会员',
    big: '57',
    unit: '%',
    delta: '会员贡献销售额',
    sub: '会员销售占比'
  }
];

const cardY = 2.7;
const cardH = 3.1;
const cardW = 3.85;
const gap = 0.225;
const startX = 0.6;

cards.forEach((c, i) => {
  const x = startX + i * (cardW + gap);

  // Card panel
  slide.addShape('roundRect', {
    x, y: cardY, w: cardW, h: cardH,
    fill: { color: panel },
    line: { color: line, width: 0.75 },
    rectRadius: 0.08
  });

  // Accent short bar (max 3 accent uses across the page: one per card top label, <= 3)
  slide.addShape('rect', {
    x: x + 0.4, y: cardY + 0.45, w: 0.25, h: 0.04,
    fill: { color: accent }, line: { color: accent }
  });

  // Topic label
  slide.addText(c.label, {
    x: x + 0.4, y: cardY + 0.55, w: cardW - 0.8, h: 0.4,
    fontFace: CN, fontSize: 13, color: muted, bold: true,
    charSpacing: 2
  });

  // Big number + unit (number accent)
  slide.addText(
    [
      { text: c.big, options: { fontFace: EN, fontSize: 48, bold: true, color: accent } },
      { text: ' ' + c.unit, options: { fontFace: CN, fontSize: 16, color: ink } }
    ],
    {
      x: x + 0.4, y: cardY + 1.05, w: cardW - 0.8, h: 1.0,
      align: 'left', valign: 'middle'
    }
  );

  // Delta line (highlight)
  slide.addText(c.delta, {
    x: x + 0.4, y: cardY + 2.05, w: cardW - 0.8, h: 0.35,
    fontFace: CN, fontSize: 13, bold: true, color: navy
  });

  // Sub note
  slide.addText(c.sub, {
    x: x + 0.4, y: cardY + 2.4, w: cardW - 0.8, h: 0.35,
    fontFace: CN, fontSize: 11, color: muted
  });
});

// Footer: source + page number
slide.addText('来源：报告.md', {
  x: 0.6, y: 7.05, w: 6, h: 0.3,
  fontFace: CN, fontSize: 10, color: muted
});
slide.addText('门店运营季度复盘 · 01', {
  x: 10.0, y: 7.05, w: 2.73, h: 0.3,
  fontFace: CN, fontSize: 10, color: muted, align: 'right'
});

await pptx.writeFile({ fileName: 'page_01.pptx' });