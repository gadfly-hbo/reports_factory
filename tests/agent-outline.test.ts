import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ModelReply, ModelTransport } from 'pi-agent-runtime';
import { SessionHost } from '../src/agent/session-host.js';
import { MINIMAX_M3 } from '../src/agent/model.js';
import { confirmOutline, proposeOutline, readOutline, updateOutlinePages, validatePages, validateQuestions } from '../src/agent/outline.js';

const PAGES = [
  { title: 'Q3 销售承压、长尾向好的分化格局', page_type: 'summary', intent: '一句话结论', source_hint: ['经营概览'] },
  { title: '重点门店补货试点建议', page_type: 'action_items' },
];

async function tmpProject(): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), 'rs-outline-'));
  const root = join(base, 'proj_o');
  await mkdir(root, { recursive: true });
  return root;
}

interface Step { content: Array<Record<string, unknown>>; stop: string }

/** 脚本化 transport：按调用序回放 steps（末步重复），并记录全部请求文本供断言。 */
function scriptedTransport(steps: Step[], requests: string[]): ModelTransport {
  let call = 0;
  return async (req) => {
    for (const m of req.messages) requests.push(m.text);
    const step = steps[Math.min(call, steps.length - 1)]!;
    call += 1;
    return { content: step.content, stop: step.stop, usage: { inputTokens: 30, outputTokens: 8 } } as unknown as ModelReply;
  };
}

async function makeHost(root: string, steps: Step[]) {
  const requests: string[] = [];
  const host = await SessionHost.create({ projectRoot: root, skillsDir: root, model: MINIMAX_M3, transport: scriptedTransport(steps, requests), auditFile: join(root, 'a.jsonl'), budgetFile: join(root, 'b.json') });
  return { host, requests };
}

describe('框架提案（T2）', () => {
  it('存储：agent 提案版本+1、用户编辑同版本、确认快照、校验负例', async () => {
    const root = await tmpProject();
    try {
      expect((await readOutline(root)).current).toBeNull();
      expect(await proposeOutline(root, PAGES, ['Q3 口径是自然月吗？'])).toBe(1);

      const edited = await updateOutlinePages(root, [{ title: '改后的标题', page_type: 'summary' }, { title: '第二页', page_type: 'content' }]);
      expect(edited.version).toBe(1); // 同版本更新（G4）
      expect(edited.pages[0]!.title).toBe('改后的标题');

      expect(await proposeOutline(root, PAGES, [])).toBe(2); // 新提案版本+1

      const c = await confirmOutline(root);
      expect(c.version).toBe(2);
      const state = await readOutline(root);
      expect(state.confirmed).toBe(true);
      expect(state.confirmed_pages).toHaveLength(2);

      expect(() => validatePages([{ title: '只有一页', page_type: 'cover' }])).toThrow();
      expect(() => validateQuestions(['a', 'b', 'c', 'd'])).toThrow(/最多 3 个/);
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('SessionHost 缝：合成 toolCall 驱动 propose_outline → 提案落盘 + 工具结果回模型', async () => {
    const root = await tmpProject();
    try {
      const toolCall: Step = {
        content: [{ kind: 'tool', id: 'call_1', name: 'propose_outline', arguments: { pages: [{ title: '框架页甲', page_type: 'summary' }, { title: '框架页乙', page_type: 'action_items' }], questions: ['数据口径是自然月？'] } }],
        stop: 'tools',
      };
      const done: Step = { content: [{ kind: 'text', text: '提案已提交，等待用户确认。' }], stop: 'complete' };
      const { host, requests } = await makeHost(root, [toolCall, done]);

      await host.send('帮我做 Q3 复盘 PPT');
      const result = await host.currentResult();
      expect(result?.status).toBe('succeeded');

      const outline = await readOutline(root);
      expect(outline.current?.version).toBe(1);
      expect(outline.current?.pages).toHaveLength(2);
      expect(outline.current?.questions).toEqual(['数据口径是自然月？']);

      expect(requests.some((t) => t.includes('已呈现给用户'))).toBe(true);
      await host.close();
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('确认注入：notifyOutlineConfirmed 后会话 prompt 含确认大纲', async () => {
    const root = await tmpProject();
    try {
      const steps: Step[] = [{ content: [{ kind: 'text', text: '收到，开始生成。' }], stop: 'complete' }];
      const { host, requests } = await makeHost(root, steps);
      const v = await proposeOutline(root, [{ title: '封面：Q3 复盘', page_type: 'cover' }, { title: '行动建议', page_type: 'action_items' }], []);
      await confirmOutline(root);
      await host.notifyOutlineConfirmed(v, [{ title: '封面：Q3 复盘', page_type: 'cover' }, { title: '行动建议', page_type: 'action_items' }]);
      const result = await host.currentResult();
      expect(result?.status).toBe('succeeded');
      expect(requests.some((t) => t.includes('用户已确认框架提案 v1') && t.includes('封面：Q3 复盘'))).toBe(true);
      await host.close();
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('守则存在：skill 与系统提示词含框架梳理约束（确认前不生成）', async () => {
    const skill = await readFile('assets/skills/ppt/SKILL.md', 'utf-8');
    expect(skill).toContain('propose_outline');
    expect(skill).toContain('用户确认前不写代码');
  });
});
