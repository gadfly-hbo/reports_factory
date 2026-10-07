import { chromium } from 'playwright';
const url = 'file:///Users/bendandebaba/DevWorkSpace/Projects/reports-factory/prototype/m10-ui-demo.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url);
await page.waitForTimeout(400);
const shots = [
  ['page-edit', null], ['projects', null], ['upload', null], ['understand', null],
  ['framework', null], ['generate', null], ['publish', null], ['settings', null],
];
for (const [view] of shots) {
  if (view === 'projects') { await page.click('#btnNewProject'); }
  else if (view === 'settings') { await page.click('[data-goto="settings"]'); }
  else { await page.click(`#stepNav .nav-item[data-step="${view}"]`); }
  await page.waitForTimeout(350);
  await page.screenshot({ path: `/tmp/m10-demo/${view}.png`, fullPage: true });
}
// 交互态：生成中/失败面板 + 批准对话框
await page.click('#stepNav .nav-item[data-step="generate"]');
await page.waitForTimeout(200);
await page.click('#btnRunGen');
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/m10-demo/generate-running.png', fullPage: true });
await page.click('#stepNav .nav-item[data-step="publish"]');
await page.waitForTimeout(300);
await page.click('#btnPrivacyCheck');
await page.waitForTimeout(1300);
await page.click('#btnApprove');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/m10-demo/publish-approve-dialog.png', fullPage: false });
// 框架编辑态
await page.keyboard.press('Escape');
await page.click('#stepNav .nav-item[data-step="framework"]');
await page.waitForTimeout(300);
await page.click('#btnConfirmFw').catch(()=>{});
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/m10-demo/framework-locked.png', fullPage: true });
await browser.close();
console.log('done');
