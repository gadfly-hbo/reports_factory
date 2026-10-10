/* Report Studio UI-GATE 原型脚本 —— 纯演示：全部数据为合成，不连接任何后端。 */
'use strict';

/* ---------------- 工具 ---------------- */
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---------------- 演示数据 ---------------- */
const DECK = {
  name: 'Q3 复盘：增长与效率',
  pages: [
    { t: '封面：Q3 复盘 —— 增长与效率', type: '封面', src: '需求描述', body: '管理层汇报 · 2026 年 10 月 · 汇报人：运营组' },
    { t: '目录', type: '目录', src: '提案 v2', body: '1 关键数据总览 · 2 收入拆解 · 3 对比分析 · 4 用户增长与留存 · 5 交付效率 · 6 问题与改进 · 7 Q4 展望' },
    { t: 'Q3 关键数据总览', type: '图表', src: 'Q3销售数据.xlsx', body: 'Q3 收入 4,820 万元，环比 +12.4%；毛利率 61.8%，环比 +1.2 个百分点。' },
    { t: '收入拆解：三条产品线', type: '图表', src: 'Q3销售数据.xlsx', body: '产品线 A 2,610 万（+15%）、B 1,390 万（+8%）、C 820 万（+9%）；A 线贡献增量的大头。' },
    { t: '与 Q2 及去年同期对比', type: '对比', src: 'Q3销售数据.xlsx', body: '收入同比 +21%，环比 +12%；对比表按季度列示收入、毛利、交付周期三项。' },
    { t: '用户增长与留存', type: '图表', src: '用户漏斗.csv', body: '新增注册 3.9 万，月留存 46%；9 月分群留存高于整体 4 个百分点。' },
    { t: '交付效率：从 5 天到 2 天', type: '内容', src: '交付周报.docx', body: '平均交付周期由 Q1 的 5.1 天降至 2.0 天；返工率由 12% 降至 6%。' },
    { t: 'Q4 目标与时间表', type: '内容', src: '需求描述', body: 'Q4 收入目标 5,500 万元；10 月完成定价调整，11 月上线自助看板，12 月复盘。' },
  ],
};

const OUTLINE_V2 = {
  version: 2,
  pages: [
    { t: '封面：Q3 复盘 —— 增长与效率', type: '封面', intent: '点明汇报范围与结论基调', src: '需求描述' },
    { t: 'Q3 关键数据总览', type: '图表', intent: '一张图给出收入/毛利/交付三项总指标', src: 'Q3销售数据.xlsx' },
    { t: '收入拆解：三条产品线', type: '图表', intent: '说明增长主要由哪条线贡献', src: 'Q3销售数据.xlsx' },
    { t: '与 Q2 及去年同期对比', type: '对比', intent: '环比与同比放一张表，给管理层参照系', src: 'Q3销售数据.xlsx' },
    { t: '用户增长与留存', type: '图表', intent: '新增与留存趋势，标注 9 月分群异常点', src: '用户漏斗.csv' },
    { t: '交付效率变化', type: '内容', intent: '交付周期与返工率两个数字讲效率', src: '交付周报.docx' },
    { t: '问题、风险与改进动作', type: '内容', intent: '从纪要提炼 3 个问题与对应动作', src: '复盘纪要.md' },
    { t: 'Q4 目标与时间表', type: '内容', intent: '目标数字与 10-12 月里程碑收尾', src: '需求描述' },
  ],
  questions: [
    '第 5 页用户留存缺少 9 月分群数据，口径按周留存还是月留存？',
    '交付效率一节是否点名具体团队，还是只讲整体数字？',
    'Q4 目标是否已有定好的数字基线，还是由我按 Q3 数据给建议值？',
  ],
};

const OUTLINE_V1 = {
  version: 1,
  pages: OUTLINE_V2.pages.slice(0, 6).map((p, i) => i === 5 ? { ...p, t: '问题与风险' } : { ...p }),
  questions: [],
};

const ATT_OK = [
  { name: 'Q3销售数据.xlsx', size: '86 KB', status: 'ok', detail: '已提取 4,213 字' },
  { name: '复盘纪要.md', size: '12 KB', status: 'ok', detail: '已提取 1,986 字' },
];
const ATT_IMG = { name: '旧版封面.png', size: '420 KB', status: 'img', detail: '已生成图片描述' };
const ATT_PARSING = { name: '交付周报.docx', size: '33 KB', status: 'parsing', detail: '' };

const PROJECTS_INIT = ['Q3 复盘 PPT', '新品发布会介绍', '读书会分享'];

/* ---------------- 状态 ---------------- */
const state = {
  scene: 'empty',
  view: 'chat',
  running: false,
  pageBadge: null,
  attachments: [],
  projects: [...PROJECTS_INIT],
  activeProject: PROJECTS_INIT[0],
  drawerOpen: false,
  genBeat: 0,
  genDone: false,
  genStopped: false,
  stopPending: false,
  awaiting: false,
  outline: null,
  outlineEdited: false,
  exports: [],
  exporting: null,
  interrupted: false,
};

/* 生成进行态的事件节拍（演示：每点一次「推进演示事件」追加一条真实事件卡） */
const GEN_BEATS = [
  { tool: 'write', target: 'deck/pages/page_01.js', dur: '1.2s', status: 'done', active: '正在编写页面代码 deck/pages/page_01.js' },
  { tool: 'write', target: 'deck/pages/page_02.js', dur: '0.8s', status: 'done', active: '正在编写页面代码 deck/pages/page_02.js' },
  { tool: 'edit', target: 'deck/pages/page_04.js（对比页改用季度环比）', dur: '1.1s', status: 'done', active: '正在修改 deck/pages/page_04.js' },
  { tool: 'write', target: 'deck/pages/page_05.js … page_08.js（4 页）', dur: '4.6s', status: 'done', active: '正在编写页面代码 page_05 – page_08' },
  { tool: 'render_deck', target: '全部 8 页', dur: '6.3s', status: 'done', active: '正在渲染 deck（render_deck）' },
  { tool: 'qa_deck', target: '结构校验 + 建议性提示', dur: '2.4s', status: 'done', active: '正在自检（qa_deck）' },
];

/* ---------------- 消息构建 ---------------- */
function mRole(kind, label, time) {
  return `<div class="msg-role">${label}${time ? ` <span class="fine">· ${time}</span>` : ''}</div>`;
}
function mUser(text, time, opts = {}) {
  const chips = (opts.atts || []).map((a) => `<span class="att-chip">${esc(a)}</span>`).join('');
  const page = opts.page ? `<span class="att-chip">针对第 ${opts.page} 页</span>` : '';
  return `<div class="msg msg-user">${mRole('user', '你', time)}<div class="msg-bubble"><p>${esc(text)}</p>${chips || page ? `<div class="att-chips">${page}${chips}</div>` : ''}</div></div>`;
}
function mAi(html, time) {
  return `<div class="msg msg-ai">${mRole('ai', 'Report Studio', time)}<div class="msg-bubble">${html}</div></div>`;
}
function mTool(tool, target, dur, status, note) {
  const st = { done: '<span class="st-ok">完成</span>', run: '<span class="st-run">运行中…</span>', fail: '<span class="st-fail">失败</span>' }[status];
  return `<div class="tool-card"><code>${esc(tool)}</code><span>${esc(target)}</span><span class="t-dur">${dur ? esc(dur) : ''}</span>${st}${note ? `<span class="tool-note">${esc(note)}</span>` : ''}</div>`;
}
function mSteerNote() {
  return `<div class="tool-card"><span class="tool-note">已收到插话（steer）：将在当前工具步骤结束后送达，不打断进行中的步骤。</span></div>`;
}

function failCard(title, why, buttons) {
  return `<div class="fail-card"><h4>${esc(title)}</h4><p class="fail-why">${esc(why)}</p><div class="fail-actions">${buttons}</div></div>`;
}

/* ---------------- 大纲提案卡 ---------------- */
function getOutline() {
  if (!state.outline) state.outline = JSON.parse(JSON.stringify(OUTLINE_V2));
  return state.outline;
}
function outlineRowHTML(p, i, n, editable) {
  const ops = editable
    ? `<span class="ol-ops">
        <button type="button" data-ol="up" data-i="${i}" title="上移" aria-label="上移第 ${i + 1} 页" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" data-ol="down" data-i="${i}" title="下移" aria-label="下移第 ${i + 1} 页" ${i === n - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="ol-del" data-ol="del" data-i="${i}" title="删除此页" aria-label="删除第 ${i + 1} 页">✕</button>
      </span>`
    : '<span></span>';
  const title = editable
    ? `<input class="ol-title" data-ol-i="${i}" value="${esc(p.t)}" aria-label="第 ${i + 1} 页标题">`
    : `<span style="font-weight:600">${esc(p.t)}</span>`;
  return `<div class="ol-row">
    <span class="ol-pn">${String(i + 1).padStart(2, '0')}</span>
    ${title}
    <span class="ol-type">${esc(p.type)}</span>
    <span class="ol-intent">${esc(p.intent)}</span>
    <span class="ol-src" title="来源标签">${esc(p.src)}</span>
    ${ops}
  </div>`;
}
function outlineCardHTML() {
  const o = getOutline();
  const editable = !state.outlineConfirmed;
  const rows = o.pages.map((p, i) => outlineRowHTML(p, i, o.pages.length, editable)).join('');
  const questions = o.questions.length
    ? `<div class="ol-questions"><h4>需要你澄清的问题（${o.questions.length} / 3）</h4>${o.questions.map((q, i) =>
        `<div class="q-item"><span class="q-n">Q${i + 1}</span><span>${esc(q)}</span><button type="button" class="btn btn-sm" data-ol="quote" data-q="${i}">去回复</button></div>`).join('')}</div>`
    : '';
  const stateChip = state.outlineConfirmed
    ? '<span class="ol-state confirmed">已确认</span>'
    : '<span class="ol-state">待确认</span>';
  const edited = state.outlineEdited ? '<span class="ol-edited">已手动编辑</span>' : '';
  const foot = state.outlineConfirmed
    ? '<div class="ol-foot"><span class="fine">框架不锁定：后续增删改页请直接在对话中提出，AI 会修改页面并重新渲染。</span></div>'
    : `<div class="ol-foot">
        <button type="button" class="btn btn-primary btn-sm" data-ol="confirm">按此框架生成</button>
        <span class="fine">有意见？直接在下方对话回复（如「第 3 页换成对比」），AI 会重新出提案，版本 +1。</span>
      </div>`;
  return `<div class="outline-card" data-ol-card>
    <div class="ol-head">
      <h3>页面框架提案</h3>
      <span class="ol-version">提案 v${o.version}</span>
      ${stateChip}${edited}
      <span class="fine">8 页 · 来源见各页标签</span>
    </div>
    <div class="ol-body">${rows}
      ${editable ? '<button type="button" class="ol-add" data-ol="add">＋ 加页</button>' : ''}
    </div>
    ${questions}
    ${foot}
  </div>`;
}
function v1CollapsedHTML() {
  return `<button type="button" class="ol-collapsed" data-ol="toggle-v1" aria-expanded="false">提案 v1 · 已被 v2 替代（展开查看）</button><div data-v1-body hidden>${v1CardHTML()}</div>`;
}
function v1CardHTML() {
  const rows = OUTLINE_V1.pages.map((p, i) => outlineRowHTML(p, i, OUTLINE_V1.pages.length, false)).join('');
  return `<div class="outline-card" style="margin-top:6px">
    <div class="ol-head"><h3>页面框架提案</h3><span class="ol-version">提案 v1</span><span class="ol-state superseded">已被 v2 替代</span></div>
    <div class="ol-body">${rows}</div>
    <div class="ol-foot"><span class="fine">历史版本仅供查看，不能再确认。</span></div>
  </div>`;
}

/* ---------------- 对话线程（各场景） ---------------- */
const USER_ASK = '帮我把这些材料做成一份 Q3 复盘 PPT，给管理层看，重点讲清楚增长和交付效率的变化。';

function threadEmpty() {
  return `<div class="empty-state">
    <h2>描述你要做的 PPT，并上传相关材料</h2>
    <p>支持 md / docx / pdf / csv / xlsx / 图片，一次可传多个。</p>
    <p class="fine">也可以先不传材料直接描述：AI 会向你确认所需材料，或先出一版「无数据版」框架（无来源的数字一律留空，不会编造）。</p>
  </div>`;
}
function threadChat() {
  return mUser(USER_ASK, '14:00', { atts: ['Q3销售数据.xlsx', '复盘纪要.md', '交付周报.docx'] })
    + mAi('<p>好的。我先读完三份材料，再给你一版页面框架提案；确认框架之前不会开始生成。</p>', '14:01')
    + mTool('read', 'Q3销售数据.xlsx（提取文本）', '0.8s', 'done')
    + mTool('read', '复盘纪要.md', '0.4s', 'done')
    + mTool('read', '交付周报.docx（提取文本）', '0.6s', 'run');
}
function threadOutline() {
  return mUser(USER_ASK, '14:00', { atts: ['Q3销售数据.xlsx', '复盘纪要.md', '交付周报.docx'] })
    + mAi('<p>材料读完了。下面是我建议的页面框架提案（已按你的第一轮意见从 6 页调整为 8 页）。可以直接在卡上改，确认后我按这个框架自主完成整份 PPT。</p>', '14:02')
    + v1CollapsedHTML()
    + outlineCardHTML();
}
function threadGenerating() {
  let html = mAi('<p>收到，按提案 v2 的 8 页框架开始。我会自主完成页面代码、渲染和自检；期间你可以随时插话补充要求，也可以停止。</p>', '14:02');
  GEN_BEATS.slice(0, state.genBeat).forEach((b) => {
    html += mTool(b.tool, b.target, b.dur, b.status);
  });
  if (state.genDone) {
    html += mAi('<p>8 页全部完成：结构校验通过，另有 2 条建议性提示（见成果页的 QA 卡）。点「查看成果」逐页检查，或直接对话修改某一页。</p><p><button type="button" class="btn btn-primary btn-sm" data-action="view-deck">查看成果</button></p>', '14:03');
  }
  return html;
}
function threadFail() {
  return mUser(USER_ASK, '14:00', { atts: ['Q3销售数据.xlsx', '复盘纪要.md', '交付周报.docx'] })
    + mAi('<p>好的，我先读材料，再给你页面框架提案。</p>', '14:01')
    + mTool('read', 'Q3销售数据.xlsx（提取文本）', '0.8s', 'done')
    + mTool('read', '复盘纪要.md', '0.4s', 'done')
    + failCard(
        '生成失败：模型不可用',
        '主模型 MiniMax-M3 连续 3 次尝试均超时；备用模型 mimo-v2.6-flash 返回 503（服务过载）。已保留：两份材料解析完成；未产生模型费用。下一步可重试，或补充材料 / 修改要求后再试。',
        '<button type="button" class="btn btn-primary btn-sm" data-action="retry">重试</button><button type="button" class="btn btn-sm" data-action="supply">补充材料或修改要求</button>'
      );
}
function threadRestart() {
  return `<div class="sys-divider">服务已重启 · 会话已从历史恢复 · 14:06</div>`
    + mUser('把第 6 页的表格改成季度对比，然后重新渲染。', '13:58', { page: 6 })
    + mTool('edit', 'deck/pages/page_06.js（表格改为季度对比）', '0.9s', 'done')
    + mTool('render_deck', '第 6 页', '2.8s', 'done')
    + mAi('<p>第 6 页已按季度对比更新并重新渲染，成果页的预览已刷新。</p>', '13:59')
    + mUser('很好。再把结尾页加上 Q4 关键结果摘要。', '14:05')
    + `<div class="sys-divider">以下为恢复后的状态</div>`
    + failCard(
        '上次任务因服务重启中断',
        '服务于 14:05 重启，当时正在执行「编辑 deck/pages/page_08.js」。中断前的修改已保存，该次运行结果未知。可重试继续这条修改；其余 7 页不受影响。',
        '<button type="button" class="btn btn-primary btn-sm" data-action="retry">重试（继续该修改）</button>'
      );
}

/* ---------------- 抽屉内容 ---------------- */
function tlRow(time, tool, model, dur, status) {
  const st = { done: '<span class="st-ok">完成</span>', run: '<span class="st-run">运行中</span>', fail: '<span class="st-fail">失败</span>' }[status];
  return `<div class="tl-row"><span class="tl-time">${time}</span><code>${esc(tool)}</code><span class="tl-dur">${esc(dur)}</span><span class="tl-status">${st}</span><span class="tl-model">${esc(model)}</span></div>`;
}
function drawerFor(scene) {
  const rows = [];
  const push = (...a) => rows.push(tlRow(...a));
  const modelRow = (t, model, dur) => push(t, 'model', model, dur, 'done');
  if (scene === 'empty') {
    return { rows: '<p class="fine" style="margin:0">本会话暂无工具调用。</p>', audit: auditHTML(0, 0, 0, 0, '本会话暂无费用记录') };
  }
  push('14:01:02', 'read', '—', '0.8s', 'done');
  push('14:01:03', 'read', '—', '0.4s', 'done');
  modelRow('14:01:10', 'MiniMax-M3', '3.1s');
  if (scene !== 'chat' && scene !== 'fail') {
    push('14:02:00', 'propose_outline', '—', '5.2s', 'done');
  }
  if (scene === 'generating' || scene === 'deck' || scene === 'exported' || scene === 'partial') {
    push('14:02:31', 'write', '—', '1.2s', 'done');
    push('14:02:33', 'write', '—', '0.8s', 'done');
    push('14:02:34', 'edit', '—', '1.1s', 'done');
    push('14:02:38', 'write', '—', '4.6s', 'done');
    push('14:02:44', 'render_deck', '—', '6.3s', 'done');
    push('14:02:52', 'qa_deck', '—', '2.4s', 'done');
  }
  if (scene === 'exported') {
    push('14:04:01', 'export_deck（pptx）', '—', '1.9s', 'done');
    push('14:04:03', 'export_deck（html）', '—', '0.7s', 'done');
    push('14:05:02', 'export_deck（pdf）', '—', '4.1s', 'done');
  }
  if (scene === 'fail') {
    push('14:01:40', 'model', 'MiniMax-M3', '120.0s', 'fail');
    push('14:03:41', 'model', 'MiniMax-M3', '120.0s', 'fail');
    push('14:05:43', 'model', 'MiniMax-M3', '120.0s', 'fail');
    push('14:07:44', 'model', 'mimo-v2.6-flash', '0.3s', 'fail');
  }
  if (scene === 'partial') {
    push('14:02:44', 'render_deck（第 5 页）', '—', '60.0s', 'fail');
    push('14:02:45', 'render_deck（第 7 页）', '—', '1.0s', 'fail');
  }
  if (scene === 'restart') {
    push('13:58:10', 'edit', '—', '0.9s', 'done');
    push('13:58:12', 'render_deck（第 6 页）', '—', '2.8s', 'done');
    modelRow('13:59:00', 'MiniMax-M3', '2.2s');
    push('14:05:12', 'edit', '—', '—', 'fail');
  }
  if (scene === 'settings') {
    return { rows: '<p class="fine" style="margin:0">设置页不产生运行记录；此处显示当前项目的最近时间线。</p>' + rows.join(''), audit: auditHTML(1, 2, 0, 0, '输出 1,842 tokens · ¥0.04（合成演示数据）') };
  }
  const audits = {
    chat: [1, 2, 0, 0, '输出 1,842 tokens · ¥0.04（合成演示数据）'],
    outline: [2, 3, 0, 0, '输出 5,310 tokens · ¥0.11（合成演示数据）'],
    generating: [3, 6, 5, 0, '输出 21,480 tokens · ¥0.46（合成演示数据）'],
    deck: [3, 6, 5, 0, '输出 24,902 tokens · ¥0.53（合成演示数据）'],
    exported: [3, 9, 5, 3, '输出 26,113 tokens · ¥0.56（合成演示数据）'],
    fail: [4, 2, 0, 0, '本次失败尝试未计费（合成演示数据）'],
    partial: [3, 8, 5, 0, '输出 25,360 tokens · ¥0.54（合成演示数据）'],
    restart: [5, 11, 7, 1, '输出 30,220 tokens · ¥0.64（合成演示数据）'],
  }[scene];
  return { rows: rows.join(''), audit: auditHTML(...audits) };
}
function auditHTML(models, tools, writes, exports, cost) {
  return `<div class="audit-grid">
    <div class="audit-cell"><b>${models}</b><span>模型调用</span></div>
    <div class="audit-cell"><b>${tools}</b><span>工具调用</span></div>
    <div class="audit-cell"><b>${writes}</b><span>写操作</span></div>
    <div class="audit-cell"><b>${exports}</b><span>导出</span></div>
  </div>
  <p class="fine" style="margin:8px 0 0">费用与计数来自运行时真实事件（审计零内容，只记次数与耗时）。<br>${esc(cost)}</p>`;
}

/* ---------------- 成果视图 ---------------- */
const QA_OK = [
  'slide 数量与提案 v2 一致（8 / 8）',
  '全部页面构建函数可执行，无空标题页',
  '正文数字均有材料来源，无来源数字未出现',
];
const QA_ADVICE = [
  '第 7 页包含客户名称（华信、蓝驰），若对外分享建议先脱敏',
  '第 6 页表格字号偏小，投影场景阅读性一般，建议放大',
];
const QA_PARTIAL = [
  '第 5 页渲染失败：page_05.js 执行超时（工具超时 60s）',
  '第 7 页渲染失败：page_07.js 未导出 buildSlide 函数',
];

function thumbHTML(p, i, failed) {
  const n = i + 1;
  const failNote = failed ? `<span class="thumb-fail-note">渲染失败：${esc(failed)}<br><button type="button" class="btn btn-sm" data-retry-page="${n}">在对话中重试此页</button></span>` : '';
  return `<div class="thumb${failed ? ' failed' : ''}" role="button" tabindex="0" data-page="${n}" aria-label="查看第 ${n} 页：${esc(p.t)}">
    <span class="thumb-canvas"><span class="tc-title">${esc(p.t)}</span><span class="tc-body">${esc(p.body)}</span></span>
    <span class="thumb-mark">近似预览</span>
    <span class="thumb-meta"><b>第 ${n} 页 · ${esc(p.type)}</b><span>${esc(p.src)}</span>${failNote}</span>
  </div>`;
}
function deckBodyHTML() {
  const partial = state.scene === 'partial';
  const failedMap = partial ? { 5: 'page_05.js 执行超时（60s）', 7: 'page_07.js 未导出 buildSlide' } : {};
  const pages = DECK.pages.map((p, i) => thumbHTML(p, i, failedMap[i + 1])).join('');
  const qaList = partial
    ? QA_PARTIAL.map((q) => `<li><span class="qa-mark st-fail">✕</span><span>${esc(q)}</span></li>`).join('')
    : QA_OK.map((q) => `<li><span class="qa-mark st-ok">✓</span><span>${esc(q)}</span></li>`).join('')
      + QA_ADVICE.map((q) => `<li><span class="qa-mark st-run">△</span><span>${esc(q)}</span><span class="qa-advice-chip">建议 · 不阻断</span></li>`).join('');
  const qaTime = partial ? '14:03' : '14:03';
  const qaHead = partial
    ? `<h3>QA 结果（qa_deck）<span class="st-fail">2 个结构问题</span></h3>`
    : `<h3>QA 结果（qa_deck）<span class="st-ok">结构校验通过</span><span class="fine">检查时间 ${qaTime}</span></h3>`;
  const exportRows = state.exports.map((r) =>
    `<tr><td>${esc(r.fmt)}</td><td>${esc(r.time)}</td><td><code>${esc(r.file)}</code></td><td><button type="button" class="btn btn-sm" data-download="${esc(r.file)}">下载</button></td></tr>`).join('');
  const exportBlock = `
    <div class="panel-card export-card">
      <h3>导出<span class="fine">导出的就是 AI 生成并自检过的工件本身（pptx 原生可编辑）</span></h3>
      <div class="export-actions">
        <button type="button" class="btn btn-primary btn-sm" data-export="pptx" ${state.exporting ? 'disabled' : ''}>导出 PPTX</button>
        <button type="button" class="btn btn-sm" data-export="html" ${state.exporting ? 'disabled' : ''}>导出 HTML</button>
        <button type="button" class="btn btn-sm" data-export="pdf" ${state.exporting ? 'disabled' : ''}>导出 PDF</button>
        <span class="fine" id="qa-link">最近 QA：${partial ? '有结构问题' : '有建议'}（${qaTime}）· 见上方 QA 卡</span>
      </div>
      <div class="export-status" id="export-status">${state.exporting ? `<span class="st-run">导出中（export_deck · ${esc(state.exporting)}）…</span>` : ''}</div>
      ${state.exports.length
        ? `<table class="export-table"><thead><tr><th>格式</th><th>时间</th><th>文件</th><th>下载</th></tr></thead><tbody>${exportRows}</tbody></table>`
        : '<p class="export-empty">尚未导出。导出后此处列出格式、时间与下载。</p>'}
    </div>`;
  return `<div class="ws-caption"><h3>页面（${DECK.pages.length}）</h3><span class="fine">HTML 预览为近似效果，非最终 PPTX 视觉；点选页面查看大图或针对此页对话</span></div>
    <div class="deck-grid">${pages}</div>
    <div class="panel-card qa-card">${qaHead}<ul class="qa-list">${qaList}</ul></div>
    ${exportBlock}`;
}

/* ---------------- 渲染 ---------------- */
const SCENE_DEFS = {
  empty:      { view: 'chat', deck: false, running: false, atts: [], status: '', hint: '输入一句话后发送，或点「推进演示事件」看 AI 反问（无材料对话）' },
  chat:       { view: 'chat', deck: false, running: false, atts: [ATT_OK[0], ATT_OK[1], ATT_PARSING], status: '', hint: '点「推进演示事件」：AI 读完材料，发出页面框架提案' },
  outline:    { view: 'chat', deck: false, running: false, atts: [...ATT_OK, ATT_IMG, { ...ATT_PARSING, status: 'ok', detail: '已提取 1,104 字' }], status: 'wait', hint: '在卡上改标题/删页/加页/调序；点「按此框架生成」进入生成场景' },
  generating: { view: 'chat', deck: false, running: true, atts: [], status: 'run', hint: '发送＝插话（steer）；「停止」演示中止；「推进演示事件」追加下一条工具事件' },
  deck:       { view: 'deck', deck: true, running: false, atts: [], status: '', hint: '点页面看大图；「针对此页对话」回对话并带页标记；导出按钮可点（演示记录）' },
  exported:   { view: 'deck', deck: true, running: false, atts: [], status: '', hint: '导出记录列表：格式 / 时间 / 下载；「推进演示事件」无后续' },
  fail:       { view: 'chat', deck: false, running: false, atts: ATT_OK, status: 'fail', hint: '失败卡含真实原因与下一步；「重试」演示切换到生成进行态' },
  partial:    { view: 'deck', deck: true, running: false, atts: [], status: '', hint: '失败页红框＋原因；点「在对话中重试此页」演示逐页修复' },
  restart:    { view: 'chat', deck: true, running: false, atts: ATT_OK, status: 'stop', hint: '历史完整保留；「重试（继续该修改）」演示恢复中断的运行' },
  settings:   { view: 'settings', deck: false, running: false, atts: [], status: '', hint: '模型链状态只读展示；界面无密钥输入（密钥来自宿主环境）' },
};

function threadHTML() {
  switch (state.scene) {
    case 'empty': return threadEmpty();
    case 'chat': return threadChat();
    case 'outline': return threadOutline();
    case 'generating': return threadGenerating();
    case 'fail': return threadFail();
    case 'restart': return threadRestart();
    default: return threadGenerating();
  }
}
function statusBarHTML() {
  const s = SCENE_DEFS[state.scene].status;
  if (!s) return '';
  const map = {
    wait: ['st-wait-b', '等待你的确认', '可直接在提案卡上编辑，或在对话中回复意见后让 AI 重新出提案'],
    run: ['st-run-b', 'AI 工作中', esc(GEN_BEATS[Math.min(state.genBeat, GEN_BEATS.length - 1)].active)],
    fail: ['st-fail-b', '失败 · 模型不可用', '真实原因与可行下一步见对话中的失败卡'],
    stop: ['st-stop-b', '上次生成因服务重启中断', '运行结果未知；中断前的修改已保存，可重试继续'],
  }[s];
  const stopBtn = s === 'run' && !state.genStopped ? '<button type="button" class="btn btn-sm btn-danger-outline" data-action="stop">停止</button>' : '';
  return `<div class="status-bar ${map[0]}"><span class="status-dot" aria-hidden="true"></span><span class="st-run">${map[1]}</span><span class="fine">${map[2]}</span>${stopBtn}</div>`;
}
function composerMode() {
  return SCENE_DEFS[state.scene].running && !state.genDone && !state.genStopped;
}
function renderComposer() {
  const running = composerMode();
  $('#send-btn').textContent = running ? '插话（steer）' : '发送';
  $('#stop-btn').hidden = !running;
  $('#composer-hint').textContent = running
    ? 'AI 工作中：发送即插话（steer），将在当前工具步骤结束后送达'
    : '支持 md / docx / pdf / csv / xlsx / 图片；也可以先不传材料直接描述';
  const badgeRow = $('#page-badge-row');
  if (state.pageBadge) {
    badgeRow.hidden = false;
    badgeRow.innerHTML = `<span class="page-badge">针对第 ${state.pageBadge.n} 页 · ${esc(state.pageBadge.t)}<button type="button" id="page-badge-x" title="取消针对此页" aria-label="取消针对此页">✕</button></span>`;
  } else {
    badgeRow.hidden = true;
    badgeRow.innerHTML = '';
  }
  $('#msg').placeholder = state.pageBadge ? '告诉 AI 这一页要怎么改……' : '描述你要做的 PPT，或补充材料、提出修改……';
  const list = $('#attach-list');
  list.innerHTML = state.attachments.map((a, i) => {
    const st = { ok: '<span class="st-ok">已就绪</span>', img: '<span class="st-ok">已就绪</span>', parsing: '<span class="st-run">解析中…</span>', fail: '<span class="st-fail">解析失败</span>' }[a.status];
    return `<div class="att-row"><span class="att-name">${esc(a.name)}</span><span class="fine">${esc(a.size)}</span>${st}${a.detail ? `<span class="fine">${esc(a.detail)}</span>` : ''}<button type="button" class="att-x" data-att-x="${i}" title="移除附件" aria-label="移除附件 ${esc(a.name)}">✕</button></div>`;
  }).join('');
}
function renderSidebar() {
  $('#project-list').innerHTML = state.projects.map((p) =>
    `<div class="sb-item${p === state.activeProject ? ' active' : ''}" role="button" tabindex="0" data-project="${esc(p)}"><span>${esc(p)}<span class="sb-meta">${p === state.activeProject ? '当前项目' : ''}</span></span><button type="button" class="sb-del" data-del-project="${esc(p)}" title="删除项目" aria-label="删除项目 ${esc(p)}">✕</button></div>`).join('');
  $('#session-entry').innerHTML = `<button type="button" class="sb-item sb-session" data-session>会话 · 持续<span class="sb-meta">最近活动 14:05</span></button>`;
  $('#tb-project').textContent = `项目：${state.activeProject}`;
}
function renderTopbar() {
  const def = SCENE_DEFS[state.scene];
  const deckReady = def.deck || (state.scene === 'generating' && state.genDone);
  const setTab = (id, pressed, disabled, title) => {
    const b = $(id);
    b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    b.disabled = !!disabled;
    if (title) b.title = title; else b.removeAttribute('title');
  };
  setTab('#tab-chat', state.view === 'chat');
  setTab('#tab-deck', state.view === 'deck', !deckReady, deckReady ? '' : '生成完成后可用');
  setTab('#tab-settings', state.view === 'settings');
  $('#view-chat').hidden = state.view !== 'chat';
  $('#view-deck').hidden = state.view !== 'deck';
  $('#view-settings').hidden = state.view !== 'settings';
  const note = $('#run-state-note');
  note.textContent = state.scene === 'generating' && !state.genDone ? '正在生成 · 可插话或停止' : '';
}
function renderThread() {
  const thread = $('#thread');
  thread.innerHTML = threadHTML();
  thread.scrollTop = thread.scrollHeight;
}
function renderDeckView() {
  const def = SCENE_DEFS[state.scene];
  const deckReady = def.deck || (state.scene === 'generating' && state.genDone);
  if (!deckReady) return;
  $('#deck-title').textContent = DECK.name;
  $('#deck-sub').textContent = `${DECK.pages.length} 页 · 生成于 14:03 · 近似预览`;
  $('#deck-body').innerHTML = deckBodyHTML();
}
function renderDrawer() {
  const { rows, audit } = drawerFor(state.scene);
  $('#detail-timeline').innerHTML = rows;
  $('#detail-audit').innerHTML = audit;
}
function renderSceneHint() {
  $('#scene-hint').textContent = SCENE_DEFS[state.scene].hint;
  $('#scene').value = state.scene;
}
function renderAll() {
  renderSidebar();
  renderTopbar();
  renderThread();
  renderComposer();
  renderDeckView();
  renderDrawer();
  renderSceneHint();
  $('#gen-status').innerHTML = statusBarHTML();
}
function setScene(id) {
  const def = SCENE_DEFS[id];
  if (!def) return;
  state.scene = id;
  state.view = def.view;
  state.running = def.running;
  state.attachments = def.atts.map((a) => ({ ...a }));
  state.pageBadge = null;
  if (id === 'generating') {
    state.genBeat = 0; state.genDone = false; state.genStopped = false; state.stopPending = false;
    state.outlineConfirmed = true;
  }
  if (id === 'deck') { state.exports = []; state.exporting = null; state.outlineConfirmed = true; }
  if (id === 'exported') {
    state.exporting = null;
    state.exports = [
      { fmt: 'pptx', time: '2026-10-10 14:04', file: 'Q3复盘_增长与效率.pptx' },
      { fmt: 'html', time: '2026-10-10 14:04', file: 'Q3复盘_增长与效率_html/' },
      { fmt: 'pdf', time: '2026-10-10 14:05', file: 'Q3复盘_增长与效率.pdf' },
    ];
  }
  renderAll();
}

/* ---------------- 交互 ---------------- */
function setView(v) {
  state.view = v;
  renderTopbar();
  if (v === 'deck') renderDeckView();
}

/* 发送 / 插话 */
function handleSend() {
  const box = $('#msg');
  const text = box.value.trim();
  if (!text && !state.pageBadge) { box.focus(); return; }
  const body = text || '（请处理当前选中的页）';
  const thread = $('#thread');
  const emptyState = thread.querySelector('.empty-state');
  if (emptyState) emptyState.remove();
  const atts = state.attachments.filter((a) => a.status === 'ok' || a.status === 'img').map((a) => a.name);
  const time = new Date().toTimeString().slice(0, 5);
  thread.insertAdjacentHTML('beforeend', mUser(body, time, { atts, page: state.pageBadge ? state.pageBadge.n : 0 }));
  if (composerMode()) {
    thread.insertAdjacentHTML('beforeend', mSteerNote());
    toast('插话已排队，将在当前工具步骤结束后送达（steer）');
  } else {
    state.awaiting = true;
    if (state.scene === 'empty') toast('已发送。点「推进演示事件」查看 AI 回复');
  }
  box.value = '';
  thread.scrollTop = thread.scrollHeight;
}

/* 停止 */
function handleStop() {
  if (state.scene !== 'generating' || state.genStopped) return;
  state.stopPending = true;
  const bar = $('#gen-status .status-bar');
  if (bar) {
    bar.className = 'status-bar st-stop-b';
    bar.innerHTML = '<span class="status-dot" aria-hidden="true"></span><span class="st-block">停止处理中…</span><span class="fine">正在等待当前工具步骤安全结束</span>';
  }
  setTimeout(() => {
    state.genStopped = true; state.stopPending = false;
    $('#gen-status').innerHTML = '<div class="status-bar st-stop-b"><span class="status-dot" aria-hidden="true"></span><span class="st-block">已停止</span><span class="fine">已完成的部分全部保留；可在对话中继续（例如「继续生成剩余页面」）</span></div>';
    renderComposer();
    toast('已停止：已完成的页面与工件保留');
  }, 700);
}

/* 附件 */
function handleFiles(files) {
  [...files].forEach((f) => {
    const isImg = /\.(png|jpe?g|webp)$/i.test(f.name);
    const att = { name: f.name, size: `${Math.max(1, Math.round(f.size / 1024))} KB`, status: 'parsing', detail: '' };
    state.attachments.push(att);
    renderComposer();
    setTimeout(() => {
      att.status = isImg ? 'img' : 'ok';
      att.detail = isImg ? '已生成图片描述（vision 预理解）' : `已提取 ${(800 + Math.floor(Math.random() * 4000)).toLocaleString()} 字`;
      renderComposer();
    }, 1100);
  });
}

/* 大图 */
function openLightbox(n) {
  const p = DECK.pages[n - 1];
  if (!p) return;
  const partial = state.scene === 'partial';
  const failWhy = { 5: 'page_05.js 执行超时（60s）', 7: 'page_07.js 未导出 buildSlide' }[n];
  $('#lb-title').textContent = `第 ${n} 页 · ${p.t}`;
  $('#lb-canvas-title').textContent = p.t;
  $('#lb-canvas-body').textContent = p.body;
  $('#lb-src').textContent = `来源：${p.src} · 页型：${p.type}`;
  $('#lb-foot').innerHTML =
    `<button type="button" class="btn btn-primary btn-sm" data-lb="this">针对此页对话</button>` +
    (partial && failWhy ? `<button type="button" class="btn btn-sm btn-danger-outline" data-lb="retry">在对话中重试此页</button>` : '') +
    `<span class="fine" style="align-self:center">近似预览 · 非最终 PPTX 视觉</span>`;
  $('#lightbox').hidden = false;
  $('#lb-close').focus();
}
function closeLightbox() { $('#lightbox').hidden = true; }

function gotoPageChat(n) {
  const p = DECK.pages[n - 1];
  state.pageBadge = { n, t: p.t };
  state.view = 'chat';
  renderTopbar(); renderComposer();
  $('#msg').focus();
  closeLightbox();
  toast(`已切换到对话，消息将携带第 ${n} 页上下文`);
}

/* 弹窗 */
function openDialog(html) {
  $('#dlg-inner').innerHTML = html;
  $('#dlg').showModal();
}
function dialogNewProject() {
  openDialog(`<h2>新建项目</h2><p>每个项目拥有独立会话与产物。</p>
    <input id="np-name" placeholder="项目名（可留空，默认「未命名项目」）" aria-label="项目名">
    <div class="dialog-actions"><button type="button" class="btn btn-sm" data-dlg="cancel">取消</button><button type="button" class="btn btn-primary btn-sm" data-dlg="create">创建</button></div>`);
  $('#np-name').focus();
}
function dialogDeleteProject(name) {
  openDialog(`<h2>删除项目「${esc(name)}」？</h2><p>将删除该项目及其会话与产物，不可恢复。</p>
    <div class="dialog-actions"><button type="button" class="btn btn-sm" data-dlg="cancel">取消</button><button type="button" class="btn btn-block-danger btn-sm" data-dlg="delete" data-name="${esc(name)}">删除</button></div>`);
}

/* 推进演示事件 */
function advance() {
  const s = state.scene;
  if (s === 'empty') {
    if (state.awaiting) {
      state.awaiting = false;
      const thread = $('#thread');
      thread.insertAdjacentHTML('beforeend', mAi('<p>收到。两个做法任选：</p><p>1）把相关材料发我（md / docx / pdf / csv / xlsx / 图片），我读完先给框架提案；</p><p>2）先不传材料，我直接出一版「无数据版」框架——需要数字的地方全部留空位，不会编造。</p><p>你想怎么做？</p>', timeNow()));
      thread.scrollTop = thread.scrollHeight;
    } else {
      toast('先发送一句话，或切换场景');
    }
    return;
  }
  if (s === 'chat') { setScene('outline'); toast('材料读完，AI 发出页面框架提案（演示进入提案卡场景）'); return; }
  if (s === 'outline') { toast('在提案卡上编辑，或点「按此框架生成」'); return; }
  if (s === 'generating') {
    if (state.genStopped) { toast('已停止：可在对话中要求继续生成'); return; }
    if (state.genDone) { setScene('deck'); toast('演示进入成果视图'); return; }
    state.genBeat += 1;
    if (state.genBeat >= GEN_BEATS.length) {
      state.genDone = true;
      renderThread(); renderComposer(); renderTopbar();
      $('#gen-status').innerHTML = '<div class="status-bar" style="border-left-color:var(--ok)"><span class="status-dot" style="background:var(--ok)" aria-hidden="true"></span><span class="st-ok">生成完成</span><span class="fine">8 页 · QA 结构校验通过 · 2 条建议性提示</span></div>';
      toast('生成完成（演示）');
    } else {
      renderThread();
      $('#gen-status').innerHTML = statusBarHTML();
    }
    return;
  }
  if (s === 'fail') { setScene('generating'); toast('已重试：重新开始生成（演示）'); return; }
  if (s === 'restart') { setScene('generating'); toast('已继续中断前的修改（演示）'); return; }
  if (s === 'deck' || s === 'exported') { toast('该场景无后续事件；可操作页面卡片、导出或切换场景'); return; }
  if (s === 'partial') { toast('点失败页上的「在对话中重试此页」演示逐页修复'); return; }
  if (s === 'settings') { toast('设置页无运行事件'); }
}
function timeNow() { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

/* ---------------- 事件绑定 ---------------- */
function bind() {
  $('#scene').addEventListener('change', (e) => setScene(e.target.value));
  $('#advance').addEventListener('click', advance);

  /* 顶栏视图 */
  $('#tab-chat').addEventListener('click', () => setView('chat'));
  $('#tab-deck').addEventListener('click', () => setView('deck'));
  $('#tab-settings').addEventListener('click', () => setView('settings'));
  $('#back-chat').addEventListener('click', () => setView('chat'));

  /* composer */
  $('#composer').addEventListener('submit', (e) => { e.preventDefault(); handleSend(); });
  $('#stop-btn').addEventListener('click', handleStop);
  $('#attach-btn').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
  $('#page-badge-row').addEventListener('click', (e) => {
    if (e.target.id === 'page-badge-x') { state.pageBadge = null; renderComposer(); }
  });
  $('#attach-list').addEventListener('click', (e) => {
    const x = e.target.closest('[data-att-x]');
    if (x) { state.attachments.splice(Number(x.dataset.attX), 1); renderComposer(); }
  });

  /* 抽屉 */
  $('#drawer-toggle').addEventListener('click', () => {
    state.drawerOpen = !state.drawerOpen;
    $('#drawer').hidden = !state.drawerOpen;
    $('#drawer-toggle').setAttribute('aria-expanded', String(state.drawerOpen));
  });
  $('#drawer-close').addEventListener('click', () => {
    state.drawerOpen = false;
    $('#drawer').hidden = true;
    $('#drawer-toggle').setAttribute('aria-expanded', 'false');
    $('#drawer-toggle').focus();
  });
  $('#tab-timeline').addEventListener('click', () => {
    $('#tab-timeline').setAttribute('aria-selected', 'true');
    $('#tab-audit').setAttribute('aria-selected', 'false');
    $('#detail-timeline').hidden = false;
    $('#detail-audit').hidden = true;
  });
  $('#tab-audit').addEventListener('click', () => {
    $('#tab-audit').setAttribute('aria-selected', 'true');
    $('#tab-timeline').setAttribute('aria-selected', 'false');
    $('#detail-audit').hidden = false;
    $('#detail-timeline').hidden = true;
  });

  /* 对话流内委托：提案卡 / 失败卡 / 工具卡内按钮 */
  $('#thread').addEventListener('click', (e) => {
    const el = e.target.closest('[data-ol], [data-action]');
    if (!el) return;
    const ol = el.dataset.ol;
    const o = getOutline();
    if (ol === 'toggle-v1') {
      const body = $('[data-v1-body]');
      body.hidden = !body.hidden;
      el.setAttribute('aria-expanded', String(!body.hidden));
      el.textContent = body.hidden ? '提案 v1 · 已被 v2 替代（展开查看）' : '提案 v1 · 已被 v2 替代（收起）';
      return;
    }
    if (ol === 'add') {
      o.pages.push({ t: '新页面标题', type: '内容', intent: '（补充这一页的意图）', src: '无材料来源' });
      state.outlineEdited = true;
      renderThread();
      return;
    }
    if (ol === 'del') {
      if (o.pages.length <= 1) { toast('至少保留一页'); return; }
      o.pages.splice(Number(el.dataset.i), 1);
      state.outlineEdited = true;
      renderThread();
      return;
    }
    if (ol === 'up' || ol === 'down') {
      const i = Number(el.dataset.i);
      const j = ol === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= o.pages.length) return;
      [o.pages[i], o.pages[j]] = [o.pages[j], o.pages[i]];
      state.outlineEdited = true;
      renderThread();
      return;
    }
    if (ol === 'quote') {
      const q = o.questions[Number(el.dataset.q)];
      $('#msg').value = `关于澄清问题：「${q}」我的想法是：`;
      $('#msg').focus();
      toast('问题引文已填入输入框，直接补充你的想法后发送');
      return;
    }
    if (ol === 'confirm') {
      setScene('generating');
      toast('已按提案卡当前内容确认，开始自主生成（演示进入生成进行态）');
      return;
    }
    const act = el.dataset.action;
    if (act === 'view-deck') { setScene('deck'); return; }
    if (act === 'stop') { handleStop(); return; }
    if (act === 'retry') { advance(); return; }
    if (act === 'supply') { setView('chat'); $('#msg').focus(); toast('可补充材料（点「附件」）或修改要求后重新发送'); }
  });
  $('#thread').addEventListener('input', (e) => {
    if (e.target.classList.contains('ol-title')) {
      const o = getOutline();
      o.pages[Number(e.target.dataset.olI)].t = e.target.value;
      if (!state.outlineEdited) {
        state.outlineEdited = true;
        const chip = document.createElement('span');
        chip.className = 'ol-edited';
        chip.textContent = '已手动编辑';
        $('.ol-head [class="ol-state"]')?.before(chip);
      }
    }
  });

  /* 侧栏 */
  $('#new-project').addEventListener('click', dialogNewProject);
  $('#project-list').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del-project]');
    if (del) { e.stopPropagation(); dialogDeleteProject(del.dataset.delProject); return; }
    const item = e.target.closest('[data-project]');
    if (item) {
      state.activeProject = item.dataset.project;
      renderSidebar();
      toast('原型：各项目共用同一组演示界面状态');
    }
  });
  $('#project-list').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.project) {
      e.preventDefault();
      state.activeProject = e.target.dataset.project;
      renderSidebar();
      toast('原型：各项目共用同一组演示界面状态');
    }
  });
  $('#session-entry').addEventListener('click', () => toast('当前已在该项目的持续会话中'));

  /* 弹窗 */
  $('#dlg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dlg]');
    if (!b) return;
    const dlg = $('#dlg');
    if (b.dataset.dlg === 'create') {
      const name = $('#np-name').value.trim() || '未命名项目';
      state.projects.push(name);
      state.activeProject = name;
      dlg.close();
      setScene('empty');
      toast(`已创建项目「${name}」，从空态开始`);
    } else if (b.dataset.dlg === 'delete') {
      const name = b.dataset.name;
      state.projects = state.projects.filter((p) => p !== name);
      if (state.activeProject === name) {
        state.activeProject = state.projects[0];
        dlg.close();
        setScene('empty');
      } else dlg.close();
      renderSidebar();
      toast(`已删除项目「${name}」（演示）`);
    } else {
      dlg.close();
    }
  });

  /* 成果视图委托：缩略图 / 大图 / QA / 导出 */
  $('#deck-body').addEventListener('click', (e) => {
    const retry = e.target.closest('[data-retry-page]');
    if (retry) {
      e.stopPropagation();
      const n = Number(retry.dataset.retryPage);
      const p = DECK.pages[n - 1];
      state.pageBadge = { n, t: p.t };
      state.view = 'chat';
      renderTopbar(); renderComposer();
      $('#msg').value = `请重试渲染第 ${n} 页：${n === 5 ? 'page_05.js 执行超时，请检查是否有超规模循环' : 'page_07.js 未导出 buildSlide，请补上导出'}。`;
      $('#msg').focus();
      toast(`已切回对话，预填了第 ${n} 页的重试请求`);
      return;
    }
    const dl = e.target.closest('[data-download]');
    if (dl) { toast(`原型：真实实现中此处下载 export_deck 生成的「${dl.dataset.download}」`); return; }
    const ex = e.target.closest('[data-export]');
    if (ex) { startExport(ex.dataset.export); return; }
    const th = e.target.closest('.thumb');
    if (th) openLightbox(Number(th.dataset.page));
  });
  $('#deck-body').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('thumb')) {
      e.preventDefault();
      openLightbox(Number(e.target.dataset.page));
    }
  });

  /* 大图 */
  $('#lb-close').addEventListener('click', closeLightbox);
  $('#lightbox').addEventListener('click', (e) => { if (e.target === $('#lightbox')) closeLightbox(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#lightbox').hidden) closeLightbox(); });
  $('#lb-foot').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lb]');
    if (!b) return;
    const n = Number($('#lb-title').textContent.match(/第 (\d+) 页/)[1]);
    gotoPageChat(n);
  });
}
function startExport(fmt) {
  if (state.exporting) return;
  state.exporting = fmt;
  renderDeckView();
  const names = { pptx: 'Q3复盘_增长与效率.pptx', html: 'Q3复盘_增长与效率_html/', pdf: 'Q3复盘_增长与效率.pdf' };
  setTimeout(() => {
    state.exporting = null;
    if (!state.exports.some((r) => r.fmt === fmt)) {
      state.exports.push({ fmt, time: `2026-10-10 ${timeNow()}`, file: names[fmt] });
    }
    renderDeckView();
    toast(`导出完成（演示回执）：${names[fmt]} 已生成，可下载`);
  }, 1200);
}

/* ---------------- 启动 ---------------- */
state.outlineConfirmed = false;
bind();
setScene('empty');
