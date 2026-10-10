// deck.mjs — 汇总所有页面并渲染 deck.pptx
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

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE'; // 13.33 × 7.5
pptx.title = '国内电商平台流量趋势与公私域打法研究';
pptx.author = 'Reports Factory';
pptx.company = 'Reports Factory';

[p01, p02, p03, p04, p05, p06, p07, p08, p09].forEach((fn) => fn(pptx));

await pptx.writeFile({ fileName: 'deck/deck.pptx' });
console.log('OK · deck.pptx generated');