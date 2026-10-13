import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ModelReply, ModelTransport } from 'pi-agent-runtime';
import { familyContent, listFamilies, resetFamilyCache, DEFAULT_FAMILY_ID } from '../src/agent/families.js';
import { SessionHost } from '../src/agent/session-host.js';
import { MINIMAX_M3 } from '../src/agent/model.js';

describe('场景家族（flow-7）', () => {
  it('注册表 ≥9 家族且可解析名称/描述；含默认家族', async () => {
    const families = await listFamilies();
    expect(families.length).toBeGreaterThanOrEqual(9);
    for (const f of families) {
      expect(f.name.length).toBeGreaterThan(1);
      expect(f.content).toContain('场景配方');
    }
    const ids = families.map((f) => f.id);
    expect(ids).toContain(DEFAULT_FAMILY_ID);
    expect(ids).toContain('product-launch');
    expect(ids).toContain('academic-defense');
  });

  it('坏文件降级：缺场景配方头的 .md 被跳过', async () => {
    const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'rs-fambad-'));
    try {
      await mkdir(join(dir, 'families'), { recursive: true });
      await writeFile(join(dir, 'families', 'broken.md'), '# 没有场景配方头\n随便写');
      process.env['REPORT_STUDIO_SKILLS_DIR'] = dir;
      resetFamilyCache();
      const families = await listFamilies();
      expect(families.find((f) => f.id === 'broken')).toBeUndefined();
    } finally {
      delete process.env['REPORT_STUDIO_SKILLS_DIR'];
      resetFamilyCache();
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('familyContent：指定/未设/坏 id 的降级语义', async () => {
    expect((await familyContent('product-launch'))).toContain('产品发布');
    expect((await familyContent(null))).toContain('通用商务汇报'); // 未设→默认
    expect((await familyContent('nonexistent-id'))).toContain('通用商务汇报'); // 坏 id→默认
  });

  it('宿主注入：pin ppt_family 后 system 含该家族配方；未 pin 含默认', async () => {
    const base = await mkdtemp(join(tmpdir(), 'rs-fam-'));
    const root = join(base, 'proj_f');
    await mkdir(join(root, 'work'), { recursive: true });
    try {
      const requests: string[] = [];
      const transport: ModelTransport = async (req) => {
        for (const m of req.messages) requests.push(m.text);
        return { content: [{ kind: 'text', text: '好的' }], stop: 'complete', usage: { inputTokens: 5, outputTokens: 2 } } as unknown as ModelReply;
      };
      const mkHost = () => SessionHost.create({ projectRoot: root, skillsDir: root, model: MINIMAX_M3, transport, auditFile: join(root, 'a.jsonl'), budgetFile: join(root, 'b.json') });
      const { writeFile } = await import('node:fs/promises');

      let host = await mkHost();
      await host.send('测试');
      await host.currentResult();
      expect(requests.some((t) => t.includes('场景配方：通用商务汇报'))).toBe(true); // 未 pin → 默认注入
      await host.close();

      // pin product-launch → 下一 run 注入产品发布配方
      requests.length = 0;
      await writeFile(join(root, 'project.json'), JSON.stringify({ project_id: 'proj_f', title: 'f', ppt_family: 'product-launch' }));
      host = await mkHost();
      await host.send('再测');
      await host.currentResult();
      expect(requests.some((t) => t.includes('场景配方：产品发布'))).toBe(true);
      await host.close();
    } finally {
      await rm(base, { recursive: true, force: true }).catch(() => {});
    }
  });
});

void resetFamilyCache; // 测试缓存隔离备用
