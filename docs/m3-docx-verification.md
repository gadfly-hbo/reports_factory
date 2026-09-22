# M3 DOCX 验证记录（research_report 交付物）

- 日期：2026-09-23 ｜ 里程碑：M3 ｜ 产物：[samples/research-report/report.docx](/Users/bendandebaba/DevWorkSpace/Projects/reports-factory/samples/research-report/report.docx)（研究报告样例，演示数据）
- 再生成：`node -e "import('./dist/samples/research-report.js').then(async m => { const s = await m.buildResearchSample(); const { renderReportDocx } = await import('./dist/render/docx.js'); const { writeFileSync } = await import('node:fs'); writeFileSync('samples/research-report/report.docx', await renderReportDocx(s)); })"`（需先 `npm run build`）

## 已验证（自动化，119 项测试内）

| 验证项 | 证据 |
|---|---|
| DOCX 解包为原生 OOXML | `tests/document-pipeline.test.ts`：`word/document.xml` 含 `<w:p>`/`<w:tbl>`、关键数字、节尾来源行、A4（11906×16838 twips） |
| 文档主线完整 | 同测试：问题与背景/口径与方法/主要发现/证据附录/限制与不确定性/建议 全部存在 |
| 推断不升级 | 限制与不确定性节的推断条目标待验证状态（同测试 + `tests/summary.test.ts`） |
| 图表为数值表格 | 文档中图表以数值表格呈现（A2：不做图片图表、不伪造可编辑图表） |
| 元数据中性 | docx 生成时 creator/title 中性化（`src/render/docx.ts`，隐私链一部分） |
| 跨格式一致 | 同一 spec 的 DOCX/HTML/PDF 三产物走 document 管线归一化文本 golden（`samples/research-report/golden/`），`npm run regression` 每日可复跑 |

## 人工验证（本机环境限定，用户侧执行）

- 本机（macOS）：`open samples/research-report/report.docx` 用 Pages/WPS 打开，核对：标题/正文/表格可编辑、中文不溢出、节尾来源行可读。
- **未验证（声明）**：Windows + Microsoft Word/WPS Windows 真机打开效果（C1 已批准延后；DOCX 字体指定 Microsoft YaHei/品牌 font_name 时按目标环境回退）。

## 已知边界

- DOCX 内图表为数值表格（不做图片图表）；复杂图形展示不在 DOCX 范围。
- PDF Producer 为 Chromium 引擎固有字段，隐私检查器标 not_checked（不做虚假承诺）。
- 不承诺不同 Office 版本/操作系统下文件字节一致（v1.0 §10.4）。
