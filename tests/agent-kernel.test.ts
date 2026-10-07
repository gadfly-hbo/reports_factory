import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadPptSkills, getPptSkill, buildWorkerRequest, resetPptSkillsCache, skillsDir } from '../src/model/agent-kernel.js';

describe('agent kernel：pi-agent-core skills 装载（M10 S2）', () => {
  it('PPT skill 从 assets/skills 装载，system prompt 块含守则要点', async () => {
    resetPptSkillsCache();
    const set = await loadPptSkills();
    expect(set.byName.has('ppt-report')).toBe(true);
    const skill = set.byName.get('ppt-report')!;
    expect(skill.description.length).toBeGreaterThan(10);
    // 守则要点在 skill 内容中（装载路径校验，内容关键词锁定单源）
    expect(skill.content).toContain('不编造');
    expect(skill.content).toContain('0 emoji');
    expect(set.systemPromptBlock).toContain('ppt-report');
  });

  it('buildWorkerRequest：system = 守则块 + 环节指令；user = 结构化载荷 JSON', async () => {
    const req = await buildWorkerRequest({
      skillName: 'ppt-report',
      stageInstruction: '输出 JSON：{"headline":string}',
      payload: { materials: ['材料一'], page: { type: 'cover' } },
    });
    expect(req.system).toContain('ppt-report');
    expect(req.system).toContain('输出 JSON');
    expect(req.system.indexOf('ppt-report')).toBeLessThan(req.system.indexOf('输出 JSON'));
    const user = JSON.parse(req.user) as { materials: string[] };
    expect(user.materials).toEqual(['材料一']);
  });

  it('未知 skill 抛 UnknownSkill（fail-closed，不静默降级）', async () => {
    await expect(buildWorkerRequest({ skillName: 'nope', stageInstruction: 'x', payload: {} })).rejects.toMatchObject({ code: 'UnknownSkill' });
  });

  it('业务代码零直接 @earendil-works import（§4.1：适配层=agent-kernel+pi-transport 白名单）', () => {
    const SRC = join(import.meta.dirname, '..', 'src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (f.name.endsWith('.ts') && !/agent-kernel|pi-transport/.test(f.name)) {
          const text = readFileSync(p, 'utf-8');
          if (text.includes('@earendil-works/')) offenders.push(p);
        }
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });

  it('skills 目录含 SKILL.md（仓库资产随代码版本化）', () => {
    const files = readdirSync(skillsDir(), { recursive: true }) as string[];
    expect(files.some((f) => String(f).endsWith('SKILL.md'))).toBe(true);
  });
});
