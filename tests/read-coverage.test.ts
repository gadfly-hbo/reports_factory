import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ModelReply, ModelTransport } from 'pi-agent-runtime';
import { SessionHost } from '../src/agent/session-host.js';
import { MINIMAX_M3 } from '../src/agent/model.js';
import { logReadPath, readPaths, unreadMaterials, logExecCommand } from '../src/agent/read-log.js';

async function tmpRoot(tag: string): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), `rs-rc-${tag}-`));
  const root = join(base, 'proj_r');
  await mkdir(join(root, 'sources'), { recursive: true });
  return root;
}

const MAT = (id: string) => JSON.stringify({ version: 1, materials: [
  { source_id: id, filename: 'a.md', kind: 'markdown', status: 'ready', extract_file: `sources/${id}.extract.md`, original_file: `sources/${id}__a.md`, size: 100, chars: 50, updated_at: '2026-10-13T00:00:00Z' },
] });

describe('材料阅读覆盖门（flow-8 D2）', () => {
  it('read-log：去重/相对化/跨调用持久', async () => {
    const root = await tmpRoot('log');
    try {
      await logReadPath(root, 'sources/src_1.extract.md');
      await logReadPath(root, join(root, 'sources', 'src_1.extract.md')); // 绝对路径
      await logReadPath(root, 'sources/src_2.extract.md');
      const paths = await readPaths(root);
      expect(paths).toHaveLength(2); // 去重 + 绝对路径归一化
      expect(paths).toContain('sources/src_1.extract.md');
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('unreadMaterials：读全→空；漏读→列清单', async () => {
    const root = await tmpRoot('cov');
    try {
      await writeFile(join(root, 'materials.json'), JSON.stringify({ version: 1, materials: [
        { source_id: 's1', filename: 'a.md', kind: 'markdown', status: 'ready', extract_file: 'sources/s1.extract.md', original_file: 'sources/s1__a.md', size: 1, chars: 1, updated_at: 'x' },
        { source_id: 's2', filename: 'b.md', kind: 'markdown', status: 'ready', extract_file: 'sources/s2.extract.md', original_file: 'sources/s2__b.md', size: 1, chars: 1, updated_at: 'x' },
        { source_id: 's3', filename: 'c.md', kind: 'markdown', status: 'failed', extract_file: 'sources/s3.extract.md', original_file: 'sources/s3__c.md', size: 1, chars: 1, updated_at: 'x' },
      ] }));
      await logReadPath(root, 'sources/s1.extract.md');
      const missing = await unreadMaterials(root);
      expect(missing).toEqual(['sources/s2.extract.md']); // s3 failed 不计

      await logReadPath(root, 'sources/s2.extract.md');
      expect(await unreadMaterials(root)).toEqual([]); // 读全
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('exec 兜底（B5）：bash 引用材料路径计入触达；双源皆无仍列未读；混合并集', async () => {
    const root = await tmpRoot('exec');
    try {
      await writeFile(join(root, 'materials.json'), JSON.stringify({ version: 1, materials: [
        { source_id: 's1', filename: 'a.md', kind: 'markdown', status: 'ready', extract_file: 'sources/s1.extract.md', original_file: 'sources/s1__a.md', size: 1, chars: 1, updated_at: 'x' },
        { source_id: 's2', filename: 'b.md', kind: 'markdown', status: 'ready', extract_file: 'sources/s2.extract.md', original_file: 'sources/s2__b.md', size: 1, chars: 1, updated_at: 'x' },
        { source_id: 's3', filename: 'c.md', kind: 'markdown', status: 'ready', extract_file: 'sources/s3.extract.md', original_file: 'sources/s3__c.md', size: 1, chars: 1, updated_at: 'x' },
      ] }));
      expect(await unreadMaterials(root)).toHaveLength(3); // 双源皆无

      await logExecCommand(root, 'cat sources/s1.extract.md | head -50'); // bash cat 形态
      await logExecCommand(root, "grep '销售' ./sources/s2.extract.md"); // ./ 前缀 + grep 形态
      await logReadPath(root, 'sources/s3.extract.md'); // read 工具形态
      expect(await unreadMaterials(root)).toEqual([]); // 三形态各触达一份 → 并集读全

      // 失败命令（exitCode ≠ 0）不计触达（L2 修复）
      await writeFile(join(root, 'materials.json'), JSON.stringify({ version: 1, materials: [
        { source_id: 's4', filename: 'd.md', kind: 'markdown', status: 'ready', extract_file: 'sources/s4.extract.md', original_file: 'sources/s4__d.md', size: 1, chars: 1, updated_at: 'x' },
        ...JSON.parse(await readFile(join(root, 'materials.json'), 'utf-8')).materials,
      ] }));
      await logExecCommand(root, 'cat sources/s4.extract.md', 1); // cat 失败（exit 1）
      expect(await unreadMaterials(root)).toEqual(['sources/s4.extract.md']);
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('SessionHost 缝：read 工具记录路径 → propose_outline 门拦截漏读 → 读全后放行', async () => {
    const root = await tmpRoot('seam');
    try {
      await writeFile(join(root, 'materials.json'), MAT('s1'));
      await writeFile(join(root, 'sources', 's1.extract.md'), '# 材料 A\n\n要点一：销售 100 万\n');
      let call = 0;
      const requests: string[] = [];
      const transport: ModelTransport = async (req) => {
        for (const m of req.messages) requests.push(m.text);
        call += 1;
        if (call === 1) return { content: [{ kind: 'tool', id: 'c1', name: 'read', arguments: { path: 'materials.json' } }], stop: 'tools', usage: { inputTokens: 5, outputTokens: 2 } } as unknown as ModelReply;
        if (call === 2) return { content: [{ kind: 'tool', id: 'c2', name: 'propose_outline', arguments: { pages: [{ title: '页一', page_type: 'cover' }, { title: '页二', page_type: 'content' }] } }], stop: 'tools', usage: { inputTokens: 5, outputTokens: 2 } } as unknown as ModelReply;
        if (call === 3) return { content: [{ kind: 'tool', id: 'c3', name: 'read', arguments: { path: 'sources/s1.extract.md' } }], stop: 'tools', usage: { inputTokens: 5, outputTokens: 2 } } as unknown as ModelReply;
        if (call === 4) return { content: [{ kind: 'tool', id: 'c4', name: 'propose_outline', arguments: { pages: [{ title: '页一改', page_type: 'cover' }, { title: '页二', page_type: 'content' }] } }], stop: 'tools', usage: { inputTokens: 5, outputTokens: 2 } } as unknown as ModelReply;
        return { content: [{ kind: 'text', text: '提案完成。' }], stop: 'complete', usage: { inputTokens: 5, outputTokens: 2 } } as unknown as ModelReply;
      };
      const host = await SessionHost.create({ projectRoot: root, skillsDir: root, model: MINIMAX_M3, transport, auditFile: join(root, 'a.jsonl'), budgetFile: join(root, 'b.json') });
      await host.send('做 PPT');
      const result = await host.currentResult();
      expect(result?.status).toBe('succeeded');

      // 第一次 propose_outline 应被覆盖门拦截（只读了 materials.json 没读 extract）
      expect(requests.some((t) => t.includes('材料未读全') && t.includes('s1.extract.md'))).toBe(true);
      // 第二次（读完后）应通过
      expect(requests.some((t) => t.includes('已呈现给用户'))).toBe(true);
      await host.close();
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });
});
