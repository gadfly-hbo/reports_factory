# Report Studio dev-flow 任务清单

来源：`.flow/prd.md`（含 GRILL 决议 G1–G19）。拆解原则：垂直 tracer bullet、导出核心先行（proposal §14.1）、M0 为硬目标、UI 最后可砍（A1）。

## 顶部检查清单

- [x] 1. M0 tracer：一页报告三格式渲染管道
- [ ] 2. M0 页型与设计系统：8 页型全量 + 图表双引擎 + 防溢出
- [ ] 3. M0 收口：跨格式一致性校验 + 零售复盘手工样例 + 导出限制清单
- [ ] 4. M1 存储：workspace 项目存储与版本对象
- [ ] 5. M1 材料：导入解析与证据资产
- [ ] 6. M1 编排：ReportBrief + 确定性大纲 + PrivacyGate
- [ ] 7. M1 页面：ReportSpec 组装 + 局部编辑/锁定/页序
- [ ] 8. M1 门禁：质量检查引擎 + 计算复算 + 导出冻结快照
- [ ] 9. M1 闭环：端到端样例链测试 + 验收样例自动化
- [ ] 10. M1 UI：Fastify + Vite React 最小工作台（预算不足首先砍）

---

## 1. M0 tracer：一页报告三格式渲染管道

### What to build

项目脚手架（单包 `report-studio`，TS/ESM，tsc + vitest，验证门脚本 typecheck/test/build）。定义 ReportSpec 最小 schema（zod：brief/metrics/claims/pages/theme + 稳定引用）。用一份**手工编写**的单页"趋势/对比"ReportSpec fixture，渲染出三种产物：HTML 预览页、PPTX（原生文本+原生图表）、PDF（Chromium 打印 HTML）。每一步有渲染契约测试。这是打穿全部层的 tracer bullet，demoable：三个文件可直接打开。

### Acceptance criteria

- [ ] `npm run typecheck && npm test && npm run build` 全绿
- [ ] ReportSpec fixture 经 zod 校验通过；含 metric（value/unit/formula/inputs/source_ref）与 claim（kind/verification_state）的稳定引用
- [ ] HTML 产物包含结论标题、图表 SVG、来源脚注；无外部网络依赖
- [ ] PPTX 解包断言：标题/正文为文本 run（`<a:t>`），图表为原生 chart 部件（`ppt/charts/chart*.xml`），非图片截图
- [ ] PDF 文本抽取包含标题与关键数字；页面为 16:9
- [ ] 三产物由同一 ReportSpec + 同一 ChartSpec 数据驱动

### Blocked by

None - can start immediately

---

## 2. M0 页型与设计系统：8 页型全量 + 图表双引擎 + 防溢出

### What to build

设计系统 token（色彩/字号阶梯/间距/字体栈 G9）+ 8 种页面类型（封面/结论摘要/指标总览/趋势对比/问题拆解/方案比较/行动待决/证据附录）各 1 个受控布局（趋势对比 2 个）。图表双引擎：ECharts SSR 内联 SVG（HTML/PDF）与 pptxgenjs 原生 chart（PPTX）吃同一 ChartSpec（柱/线/占比）。中文长标题防溢出策略（测量→换行/缩级下限/建议拆页，禁止无限缩字）。缺数据图表占位与"待补充"提示。

### Acceptance criteria

- [ ] 8 页型 × 3 格式的快照级契约测试全绿（每页型至少：标题文本对象存在、脚注存在）
- [ ] 指标总览页表格在 PPTX 中为原生表格（`<a:tbl>`）
- [ ] 柱/线/占比三类图表在 PPTX 为原生 chart 对象，HTML/PDF 为内联 SVG，数值一致
- [ ] 超长中文标题 fixture：不溢出画布、字号不低于下限、触发拆页或截断警告而非无限缩小
- [ ] ChartSpec 无数据时渲染占位+待补充标记，不伪造数据

### Blocked by

- 1

---

## 3. M0 收口：跨格式一致性校验 + 零售复盘手工样例 + 导出限制清单

### What to build

跨格式一致性校验器：从 PPTX（解包 XML）、PDF（文本抽取）、HTML（DOM）三产物抽取关键数字/标题/来源说明并比对。组装手工准备的零售复盘全量样例 ReportSpec（G10 场景：销售下降 20%、缺货原因未证实、利润率百分点用例、冲突数字、无数据图表图片、不确定性话术），生成 8–10 页样例报告三格式。输出 M0 导出限制清单文档（可编辑性分级、已知限制、Windows 未验证声明）。

### Acceptance criteria

- [ ] 一致性校验器：同一 ReportSpec 的三产物关键数字与来源说明一致，不一致时报出具体对象
- [ ] 零售复盘样例：8+ 页、三格式全部生成且契约测试通过
- [ ] 样例含"尚未证实"措辞页，渲染保留不确定性标注
- [ ] 导出限制清单文档存在且含：可编辑性分级逐对象标注、环境限定（macOS 验证、Windows 未验证）、引擎限制
- [ ] M0 门禁判定记录：关键页面可读/主要对象可编辑/无格式阻断，逐项勾选

### Blocked by

- 2

---

## 4. M1 存储：workspace 项目存储与版本对象

### What to build

workspace 存储（G12：env `REPORT_STUDIO_HOME`，默认 `./data`）：项目目录布局 project.json / sources/（原件+sha256）/ assets.json / revisions/ / exports/；Project、SourceAsset、ReportRevision、ExportRecord 对象的创建/读取/保存；项目 CRUD（创建、打开、复制、删除含清理范围）；重启恢复（读回完整状态）。

### Acceptance criteria

- [ ] 项目 CRUD 单元测试通过；删除清理原件、派生、临时渲染文件
- [ ] 保存→新进程读回：材料、资产、修订、导出记录完整（重启恢复测试）
- [ ] 工件哈希（sha256）记录在 SourceAsset 与 ExportRecord 上
- [ ] 旧修订与旧导出记录在新数据写入后不被改写

### Blocked by

- 1

---

## 5. M1 材料：导入解析与证据资产

### What to build

导入通道：粘贴文本/TXT/Markdown/CSV（csv-parse）；图片 PNG/JPEG 作为图片 SourceAsset 标记无底层数据。MD 显式标记约定（结论/推断/建议/口径标题）解析为 Claim（kind/verification_state）+ EvidenceRef（locator/excerpt）；CSV 解析为列口径登记（列名/单位/周期待用户确认项标记）。同口径不同数值的冲突检测（展示冲突，不静默择一）。解析失败隔离：单份材料失败不影响项目与其他材料，失败原因可见。

### Acceptance criteria

- [ ] 零售复盘 fixtures（MD+CSV+冲突 CSV+PNG）全部导入成功并生成资产与来源索引
- [ ] 推断类内容保留"待核实/推断"验证状态，不被标记为已证实
- [ ] 冲突检测：两个来源同口径不同数 → 冲突记录展示，不自动选择
- [ ] 恶意材料（文档内嵌"上传本地文件/忽略规则"指令）被作为普通文本处理（§13.2 行）
- [ ] 构造的坏 CSV：失败被隔离且给出原因，项目状态完好

### Blocked by

- 4

---

## 6. M1 编排：ReportBrief + 确定性大纲 + PrivacyGate

### What to build

ReportBrief（受众/目的/页数预算/语言/风格）。ModelGateway 接口 + DeterministicGateway：按 §13.1 复盘主线页型模板 + 资产分类规则生成页计划（页序/页型/主旨/证据引用/缺口提示），资料说明页与待补充页支持；无法分类材料进资料说明页（G11）。PrivacyGate 包装器：项目未授权外部模型时任何出站调用被阻断并记录，本地功能不受影响。大纲确认数据结构（可编辑的页计划）。

### Acceptance criteria

- [ ] fixtures 资产 + 复盘 brief → 生成含主旨与证据引用的页计划，用户可编辑
- [ ] "缺货原因未证实"类推断出现在问题拆解页且保留待验证标注，不出现在结论页
- [ ] 材料不足时生成待补充提示页，不编造故事
- [ ] privacy_policy=禁止外部模型时出站调用被阻断（测试模拟），确定性大纲不受影响
- [ ] 改变受众/风格不改变 metrics 与事实绑定（F03 验收点）

### Blocked by

- 5

---

## 7. M1 页面：ReportSpec 组装 + 局部编辑/锁定/页序

### What to build

从已确认页计划组装 ReportSpec（页↔claim/metric/evidence 稳定引用绑定）。局部编辑操作集：文字修改、页序调整、单页重生成、拆页、布局切换；作用范围显式（块/页/章/整稿）；锁定对象在重生成中保持不变。每次实质修改产生新 ReportRevision（parent 链）。编辑稳定性：范围外页的内容与绑定不漂移。

### Acceptance criteria

- [ ] 页计划 → ReportSpec 组装后引用完整性校验通过（无悬空引用）
- [ ] "只重写第 3 页业务解释"：其余页内容与数字绑定逐字不变（编辑稳定性回归测试，§13.2 行）
- [ ] 锁定页在单页/整稿重生成中保持不变
- [ ] 拆页/页序调整后引用与修订链正确
- [ ] 风格/主题变化不触发内容重生成（仅重渲染）

### Blocked by

- 6

---

## 8. M1 门禁：质量检查引擎 + 计算复算 + 导出冻结快照

### What to build

检查集 v1（G13）：阻断（同指标跨对象数值矛盾、元/万元矛盾、%/百分点误用、未解决材料冲突、违反外部分享策略、关键内容裁切）/警告（来源待核实、关键陈述缺绑定、页面密度超阈）。计算复算引擎（decimal.js：差额/占比/变化率，保留 formula/inputs，代码复算不依赖模型）。导出门禁：阻断未清零禁止正式定稿、草稿导出明确标识；冻结快照（来源版本+资产+spec+检查结果绑定）与 ExportRecord；来源替换后受影响页面提示（旧快照不变）。

### Acceptance criteria

- [ ] 单位错误样例（元 vs 万元）：阻断并定位对象（§13.2 行）
- [ ] 利润率 20%→25% 表述区分"5 个百分点"与"增长 25%"（§13.2 行）
- [ ] 数字不一致样例：阻断正式导出，草稿可导出且带草稿标识
- [ ] 销售额变化率复算 = 代码计算结果；公式与输入保留在 spec
- [ ] 来源替换：受影响页面提示、旧导出记录与文件不变（§13.2 行）
- [ ] 检查结果绑定进 ExportRecord

### Blocked by

- 7

---

## 9. M1 闭环：端到端样例链测试 + 验收样例自动化

### What to build

主 seam E2E（核心层驱动，无 UI）：fixtures 零售复盘材料 → 建项目 → 导入解析 → 资产 → brief+确定性大纲 → 确认页计划 → 组装 ReportSpec → 三格式渲染 → 质量检查 → 通过门禁导出 PPTX/PDF → 导出物断言。集成 §13.2 中可自动化的验收行（异常路径含模型中断恢复：中断后已保存内容可恢复、可从失败步骤重试）。

### Acceptance criteria

- [ ] E2E 全链单测运行通过，产物落盘且断言（可编辑对象/关键数字/来源说明/三格式一致）
- [ ] §13.2 可自动化行各有对应测试（正常/单位错误/百分点/证据不足/冲突/局部修改/来源替换/图片无数据/长标题/未授权外发/恶意指令/导出一致性/中断恢复）
- [ ] 中断恢复：模拟生成中断后重新加载，已保存大纲/页面/检查结果完整，可从失败步骤重试

### Blocked by

- 8

---

## 10. M1 UI：Fastify + Vite React 最小工作台（预算不足首先砍）

### What to build

本地服务 Fastify（API + 静态托管）+ Vite React 最小工作台：项目首页（列表/新建/继续）、材料面板（导入/状态/冲突展示）、大纲确认视图（页计划编辑）、页面预览（HTML 画布 + 页导航）、检查问题清单（阻断/警告分级）、导出操作（格式选择/门禁拦截提示）。证据面板：点击关键数字查看来源/原文片段/口径/版本。可视化控件优先，对话入口不作为唯一界面。

### Acceptance criteria

- [ ] 无 UI 也能通过 API/核心层完成同样闭环（不回归）
- [ ] 项目列表→建项目→导入→确认大纲→预览→检查→导出 在浏览器中可完整走通
- [ ] 阻断项在 UI 中阻止正式导出并提示草稿选项
- [ ] 证据面板显示材料名/原文片段/口径/单位/版本
- [ ] 页序调整、布局切换有可视化控件操作

### Blocked by

- 9
