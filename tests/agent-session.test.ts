import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { SessionHost } from '../src/agent/session-host.js';
import { MINIMAX_M3 } from '../src/agent/model.js';
import type { ModelTransport } from 'pi-agent-runtime';

/** 合成 transport（ModelTransport 合同）：固定短回复，零网络。 */
function syntheticTransport(text = '收到，开始梳理。'): ModelTransport {
  return async () => ({
    content: [{ kind: 'text', text }],
    stop: 'complete',
    usage: { inputTokens: 12, outputTokens: 4 },
  });
}

async function makeProject(name: string): Promise<{ root: string; skillsDir: string; auditFile: string; budgetFile: string }> {
  const base = await mkdtemp(join(tmpdir(), 'rs-agent-'));
  const root = join(base, name);
  await mkdir(join(root, 'data'), { recursive: true });
  const skillsDir = join(base, 'skills', 'ppt');
  await mkdir(skillsDir, { recursive: true });
  await writeFile(join(skillsDir, 'SKILL.md'), `---\nname: ppt-report\ndescription: PPT 生成规范（测试夹具）\n---\n\n# 测试规范\n不编造数字。\n`, 'utf-8');
  return { root, skillsDir, auditFile: join(base, `${name}-audit.jsonl`), budgetFile: join(base, `${name}-budget.json`) };
}

describe('SessionHost（S2 会话宿主）', () => {
  it('创建会话 → 发消息 → run 成功且事件/审计/账本落盘', async () => {
    const p = await makeProject('proj_a');
    try {
      const host = await SessionHost.create({ projectRoot: p.root, skillsDir: p.skillsDir, model: MINIMAX_M3, transport: syntheticTransport(), auditFile: p.auditFile, budgetFile: p.budgetFile });
      expect(host.sessionId).toBeTruthy();
      expect(host.isBusy()).toBe(false);

      const sent = await host.send('帮我做一份 Q3 复盘 PPT');
      expect(sent.mode).toBe('run');
      expect(host.isBusy()).toBe(true);

      const result = await host.currentResult();
      expect(result?.status).toBe('succeeded');
      expect(result?.value).toContain('收到');
      expect(host.isBusy()).toBe(false);

      // 事件流：真实运行事件（零内容）
      const kinds = host.recentEvents().map((e) => e.kind);
      expect(kinds).toContain('chat:user_send');
      expect(kinds.some((k) => k.startsWith('model.') || k.startsWith('harness:'))).toBe(true);

      // 审计 JSONL 落盘（零内容：无 prompt 文本）
      const auditRaw = await readFile(p.auditFile, 'utf-8');
      expect(auditRaw.length).toBeGreaterThan(0);
      expect(auditRaw).not.toContain('Q3 复盘');

      // 账本落盘：模型调用被计量
      const budget = JSON.parse(await readFile(p.budgetFile, 'utf-8')) as { tasks: Record<string, { usage: { modelCalls: number } }> };
      const ledgers = Object.values(budget.tasks);
      expect(ledgers.length).toBe(1);
      expect(ledgers[0]!.usage.modelCalls).toBeGreaterThanOrEqual(1);

      await host.close();
    } finally {
      await rm(p.root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('重启恢复：新 host 实例打开同一会话，历史保留', async () => {
    const p = await makeProject('proj_b');
    try {
      const host1 = await SessionHost.create({ projectRoot: p.root, skillsDir: p.skillsDir, model: MINIMAX_M3, transport: syntheticTransport('第一轮'), auditFile: p.auditFile, budgetFile: p.budgetFile });
      const session1 = host1.sessionId;
      await host1.send('第一句话');
      await host1.currentResult();
      await host1.close();

      const host2 = await SessionHost.create({ projectRoot: p.root, skillsDir: p.skillsDir, model: MINIMAX_M3, transport: syntheticTransport('第二轮'), auditFile: p.auditFile, budgetFile: p.budgetFile });
      expect(host2.sessionId).toBe(session1);
      const history = await host2.history();
      expect(history.length).toBeGreaterThan(0);

      // 恢复后继续对话（reconcile 通过：操作绑定齐全）
      await host2.send('继续');
      const r2 = await host2.currentResult();
      expect(r2?.status).toBe('succeeded');
      await host2.close();
    } finally {
      await rm(p.root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('技能装载 + 运行中快照（真实进度场景）', async () => {
    const p = await makeProject('proj_c');
    try {
      // 可控 transport：挂起直到测试放行，制造活动 run
      let release: (v: { content: { kind: 'text'; text: string }[]; stop: 'complete'; usage: { inputTokens: number; outputTokens: number } }) => void = () => {};
      const gated: ModelTransport = () => new Promise((resolve) => { release = resolve; });
      const host = await SessionHost.create({ projectRoot: p.root, skillsDir: p.skillsDir, model: MINIMAX_M3, transport: gated, auditFile: p.auditFile, budgetFile: p.budgetFile });
      expect(existsSync(join(p.root, 'session'))).toBe(true);

      await host.send('进行中');
      await new Promise((r) => setTimeout(r, 50));
      const snap = await host.snapshot(); // 活动 run 期间快照（live 路径）
      expect(snap).toBeTruthy();
      expect(snap?.model.id).toBe(MINIMAX_M3.id);

      release({ content: [{ kind: 'text', text: '完成' }], stop: 'complete', usage: { inputTokens: 5, outputTokens: 2 } });
      const result = await host.currentResult();
      expect(result?.status).toBe('succeeded');
      await host.close();
    } finally {
      await rm(p.root, { recursive: true, force: true }).catch(() => {});
    }
  });
});
