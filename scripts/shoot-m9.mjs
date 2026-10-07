import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { chromium } from 'playwright';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 8803;
const OUT = '/tmp/rs-m9-shots';
mkdirSync(OUT, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), 'rs-m9-'));
const server = spawn('node', ['dist/server/start.js'], {
  env: { ...process.env, REPORT_STUDIO_HOME: dataDir, REPORT_STUDIO_NO_SYNC: '1', PORT: String(PORT) },
  stdio: 'ignore',
});
await sleep(800);
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/api/projects`)).ok) break; } catch {}
  await sleep(500);
}

const SAMPLE_MD = `# Q3 经营复盘

## 结论
重点门店销售额同比下降 7.1%，缺货是可能原因之一。

## 数据
| 门店类型 | 销售额(万) | 同比 |
| 重点 | 880 | -7.1% |
| 长尾 | 1500 | +3% |

## 建议
1. 重点门店补货试点
2. 监控 9 月转化率`;

const themes = [
  [1, '经营复盘', 'ops_review_deck'],
  [2, '执行摘要', 'exec_summary_deck'],
  [3, '研究报告', 'research_doc'],
];
const results = [];
for (const [idx, themeName, themeId] of themes) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: `m9-${themeName}-${Date.now()}`, template_id: themeId, privacy_policy: 'allow_external_with_approval' }) }).then((r) => r.json());
    const pid = r.project.project_id;
    // allow_external + 批准（持久化在服务实例，跨热重启会丢——本脚本每次新建数据目录，重新批准）
    await fetch(`http://127.0.0.1:${PORT}/api/projects/${pid}/outbound/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'authorized-summary' }) });

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/#/project/${pid}/ppt`);
    await sleep(800);
    await page.fill('[data-testid="ppt-input"]', SAMPLE_MD);
    await sleep(150);
    await page.screenshot({ path: `${OUT}/form-${idx}-${themeName}.png` });
    browser.close();

    const resp = await fetch(`http://127.0.0.1:${PORT}/api/projects/${pid}/ppt/from-md`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ markdown: SAMPLE_MD, audience: '商品经营负责人', pageBudget: 6, briefPrompt: themeName }) });
    const buf = Buffer.from(await resp.arrayBuffer());
    console.log(`#${idx} ${themeName}: status=${resp.status} ct=${resp.headers.get('content-type')} len=${buf.length}`);
    if (resp.status !== 200) { console.log('  body:', buf.toString().slice(0, 200)); continue; }
    writeFileSync(`${OUT}/sample-${idx}-${themeName}.pptx`, buf);
    const zip = await JSZip.loadAsync(buf);
    const slideFiles = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
      const slideTexts = [];
    for (const name of slideFiles) {
      const xml = await zip.file(name).async('string');
      const m = xml.match(/<a:t>([^<]*)<\/a:t>/g) ?? [];
      slideTexts.push(...m.map((x) => x.replace(/<[^>]+>/g, '')));
    }
    const aiFlavor = slideTexts.filter((t) => /[\u{1F389}\u{2728}\u{1F680}\u{1F4A1}\u{2B50}\u{1F525}]/u.test(t)).length;
    console.log(`  slideFiles=${slideFiles.length} textBoxes=${slideTexts.length} aiFlavor=${aiFlavor}`);
    results.push({ idx, themeName, slideFiles: slideFiles.length, textBoxes: slideTexts.length, aiFlavor, sample: slideTexts.slice(0, 8) });
  } catch (e) {
    console.log(`#${idx} ${themeName} FAIL: ${String(e).slice(0, 200)}`);
  }
}

server.kill();
rmSync(dataDir, { recursive: true, force: true });
writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 2));
console.log('done →', OUT);
