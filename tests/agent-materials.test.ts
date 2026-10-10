import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { indexMaterial, readManifest, removeMaterial } from '../src/agent/materials.js';
import type { ModelTransport } from 'pi-agent-runtime';

const PROJECT = { source_id: 'src_test1', filename: '结论.md', kind: 'markdown' as const };
const PDF_FIXTURE = join(__dirname, 'fixtures', 'materials', 'm10-sample-cn.pdf');

function okTransport(text: string): ModelTransport {
  return async () => ({ content: [{ kind: 'text', text }], stop: 'complete', usage: { inputTokens: 10, outputTokens: 5 } });
}

async function tmpProject(): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), 'rs-mat-'));
  const root = join(base, 'proj_m');
  await mkdir(root, { recursive: true });
  return root;
}

describe('材料通道（T1：提取落盘 + manifest）', () => {
  it('markdown：原文直读落盘，manifest ready', async () => {
    const root = await tmpProject();
    try {
      const entry = await indexMaterial({ projectRoot: root, asset: PROJECT, content: Buffer.from('# 结论\n销售额 880 万', 'utf-8') });
      expect(entry.status).toBe('ready');
      expect(entry.chars).toBeGreaterThan(0);
      const extract = await readFile(join(root, entry.extract_file), 'utf-8');
      expect(extract).toContain('销售额 880 万');
      const manifest = await readManifest(root);
      expect(manifest.materials).toHaveLength(1);
      expect(manifest.materials[0]!.source_id).toBe('src_test1');
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('pdf：夹具全文提取', async () => {
    const root = await tmpProject();
    try {
      const content = await readFile(PDF_FIXTURE);
      const entry = await indexMaterial({ projectRoot: root, asset: { source_id: 'src_pdf', filename: 'm10-sample-cn.pdf', kind: 'pdf' }, content });
      expect(entry.status).toBe('ready');
      const extract = await readFile(join(root, entry.extract_file), 'utf-8');
      expect(extract.length).toBeGreaterThan(50);
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('图片：vision 预理解描述落盘；transport 失败单文件标记 failed', async () => {
    const root = await tmpProject();
    try {
      const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      const ok = await indexMaterial({
        projectRoot: root,
        asset: { source_id: 'src_img1', filename: '图1.png', kind: 'image' },
        content: png1x1,
        mediaType: 'image/png',
        vision: { transport: okTransport('图中是一个柱状图'), model: { provider: 'p', id: 'm', protocol: 'openai-completions', endpoint: 'https://x', contextWindow: 1000 } },
      });
      expect(ok.status).toBe('ready');
      const desc = await readFile(join(root, ok.extract_file), 'utf-8');
      expect(desc).toContain('柱状图');
      expect(desc).toContain('vision 预理解');

      // transport 抛错 → 单文件 failed，不影响 ready 的其他条目
      const bad: ModelTransport = async () => { throw new Error('模型不可用'); };
      const failed = await indexMaterial({
        projectRoot: root,
        asset: { source_id: 'src_img2', filename: '图2.png', kind: 'image' },
        content: png1x1,
        mediaType: 'image/png',
        vision: { transport: bad, model: { provider: 'p', id: 'm', protocol: 'openai-completions', endpoint: 'https://x', contextWindow: 1000 } },
      });
      expect(failed.status).toBe('failed');
      expect(failed.error).toContain('模型不可用');
      const manifest = await readManifest(root);
      expect(manifest.materials.find((m) => m.source_id === 'src_img1')?.status).toBe('ready');
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('移除材料同步清理 manifest 条目', async () => {
    const root = await tmpProject();
    try {
      await indexMaterial({ projectRoot: root, asset: PROJECT, content: Buffer.from('x', 'utf-8') });
      await removeMaterial(root, 'src_test1');
      const manifest = await readManifest(root);
      expect(manifest.materials).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });
});
