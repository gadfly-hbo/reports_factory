// 多口径核对：报告里 37/23/37 能否对上
import JSZip from 'jszip';
import { readFileSync, existsSync } from 'node:fs';
const files = [
  ['/tmp/rs-m9-shots/sample-1-经营复盘.pptx', 37, 36],
  ['/tmp/rs-m9-shots/sample-2-执行摘要.pptx', 23, 21],
  ['/tmp/rs-m9-shots/sample-3-研究报告.pptx', 37, 37],
];
for (const [f, oldReport, latest] of files) {
  if (!existsSync(f)) { console.log(f, 'MISSING'); continue; }
  const zip = await JSZip.loadAsync(readFileSync(f));
  const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
  let aT = 0, rPr = 0, texts = [];
  for (const name of slides) {
    const xml = await zip.file(name).async('string');
    const at = (xml.match(/<a:t>/g) ?? []).length;
    aT += at;
    rPr += (xml.match(/<a:rPr/g) ?? []).length; // 每个 run 的属性 = 真实文本 run 数
    texts.push(...(xml.match(/<a:t>([^<]*)<\/a:t>/g) ?? []).map((x) => x.replace(/<[^>]+>/g, '')));
  }
  console.log(`${f.split('/').pop()}: slides=${slides.length} <a:t>=${aT} a:rPr=${rPr} nonEmpty=${texts.filter((t)=>t.trim()).length} | 报告=${oldReport} 最新=${latest}`);
}
