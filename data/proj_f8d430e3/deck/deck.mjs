// deck.mjs - 汇总所有页面并生成 deck.pptx
import pptxgen from 'pptxgenjs';
import { buildSlide as p1 } from './pages/page_01.mjs';
import { buildSlide as p2 } from './pages/page_02.mjs';
import { buildSlide as p3 } from './pages/page_03.mjs';
import { buildSlide as p4 } from './pages/page_04.mjs';
import { buildSlide as p5 } from './pages/page_05.mjs';

const pptx = new pptxgen();
pptx.defineLayout({ name: 'W', width: 13.33, height: 7.5 });
pptx.layout = 'W';
pptx.title = '森马品牌成交人群画像对比分析';
pptx.company = 'Semir Brand';

p1(pptx);
p2(pptx);
p3(pptx);
p4(pptx);
p5(pptx);

await pptx.writeFile({ fileName: 'deck/deck.pptx' });
console.log('deck.pptx 已生成');