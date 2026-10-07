import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<html><head><meta charset="utf-8"></head><body style="font-family:'PingFang SC'">
<h1>会员运营月报（演示数据）</h1>
<p>本月会员复购率 41%，会员贡献销售额占比 57%。新会员注册 1,860 人，环比下降 4%。</p>
<p>库存周转天数 46 天；滞销 SKU 占比 18%，集中于配饰类目。</p>
</body></html>`);
await page.pdf({ path: 'tests/fixtures/materials/m10-sample-cn.pdf', format: 'A4' });
await browser.close();
console.log('pdf fixture written');
