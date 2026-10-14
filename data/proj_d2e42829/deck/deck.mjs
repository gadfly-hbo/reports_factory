import pptxgen from 'pptxgenjs';
import { buildSlide as p01 } from './pages/page_01.mjs';
import { buildSlide as p02 } from './pages/page_02.mjs';
import { buildSlide as p03 } from './pages/page_03.mjs';
import { buildSlide as p04 } from './pages/page_04.mjs';
import { buildSlide as p05 } from './pages/page_05.mjs';
import { buildSlide as p06 } from './pages/page_06.mjs';
import { buildSlide as p07 } from './pages/page_07.mjs';
import { buildSlide as p08 } from './pages/page_08.mjs';
import { buildSlide as p09 } from './pages/page_09.mjs';
import { buildSlide as p10 } from './pages/page_10.mjs';
import { buildSlide as p11 } from './pages/page_11.mjs';

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';  // 13.33 x 7.5 inch
pptx.defineLayout({ name: 'SEMIR_W', width: 13.33, height: 7.5 });
pptx.layout = 'SEMIR_W';

pptx.title = '森马天猫官旗人群画像诊断报告';
pptx.author = 'Reports Factory';
pptx.company = 'SEMIR';

p01(pptx);
p02(pptx);
p03(pptx);
p04(pptx);
p05(pptx);
p06(pptx);
p07(pptx);
p08(pptx);
p09(pptx);
p10(pptx);
p11(pptx);

await pptx.writeFile({ fileName: 'deck/deck.pptx' });
console.log('✅ deck.pptx 已生成');