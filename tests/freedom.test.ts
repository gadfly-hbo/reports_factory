import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ModelReply, ModelTransport } from 'pi-agent-runtime';
import { SessionHost } from '../src/agent/session-host.js';
import { MINIMAX_M3 } from '../src/agent/model.js';
import { createNetworkExecutionEnvironment } from '../src/agent/exec-env.js';
import { lookPageTool } from '../src/agent/tools/look-page-tool.js';

const PAGE = `import pptxgen from 'pptxgenjs';
export function buildSlide(pptx) { const s = pptx.addSlide(); s.addText('视觉自检页', { x: 1, y: 3, w: 11, h: 1, fontSize: 32 }); }`;
const HTML = '<html><body style="width:1280px;height:720px;background:#f7f6f3"><h1 style="font-size:44px;margin:80px">视觉自检页标题占位，检查遮挡与留白</h1></body></html>';

async function tmpRoot(tag: string): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), `rs-fd-${tag}-`));
  const root = join(base, 'proj_f');
  await mkdir(join(root, 'deck', 'pages'), { recursive: true });
  return root;
}

describe('flow-2 自由度四项', () => {
  it('U2：run 请求携带 thinkingLevel=medium', async () => {
    const root = await tmpRoot('think');
    try {
      const requests: Array<{ thinkingLevel?: string }> = [];
      const transport: ModelTransport = async (req) => {
        requests.push({ thinkingLevel: req.thinkingLevel });
        return { content: [{ kind: 'text', text: '好的。' }], stop: 'complete', usage: { inputTokens: 5, outputTokens: 2 } } as unknown as ModelReply;
      };
      const host = await SessionHost.create({ projectRoot: root, skillsDir: root, model: MINIMAX_M3, transport, auditFile: join(root, 'a.jsonl'), budgetFile: join(root, 'b.json') });
      await host.send('测试');
      await host.currentResult();
      expect(requests.length).toBeGreaterThanOrEqual(1);
      expect(requests[0]!.thinkingLevel).toBe('medium');
      await host.close();
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('U3：look_page 返回 image 内容块（agent HTML 优先）', async () => {
    const root = await tmpRoot('look');
    try {
      await writeFile(join(root, 'deck', 'pages', 'page_01.mjs'), PAGE);
      await writeFile(join(root, 'deck', 'pages', 'page_01.html'), HTML);
      const t = lookPageTool(root);
      const r = (await t.execute({ page: 'page_01' }, new AbortController().signal)) as { content: Array<{ kind: string; data: string; mimeType: string }>; details: { source: string } };
      expect(r.content[0]!.kind).toBe('image');
      expect(r.content[0]!.mimeType).toBe('image/jpeg');
      expect(r.content[0]!.data.length).toBeGreaterThan(2000);
      expect(r.details.source).toBe('agent-html');
      // R2-F1：错误路径必须 content 形状（output:'content' 工具裸 JsonValue 会被 SDK 拒杀整轮）
      const missing = (await lookPageTool(root).execute({ page: 'page_99' }, new AbortController().signal)) as { content: Array<{ kind: string; text: string }> };
      expect(missing.content[0]!.kind).toBe('text');
      expect(JSON.parse(missing.content[0]!.text).ok).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('U4：联网执行环境——根内读写/越界拒绝/exec 超时', async () => {
    const root = await tmpRoot('env');
    try {
      const env = await createNetworkExecutionEnvironment({ root, policyVersion: 'test', execTimeoutMs: 1500 });
      await env.write('deck/assets/note.txt', new TextEncoder().encode('素材'), new AbortController().signal);
      expect(new TextDecoder().decode(await env.read('deck/assets/note.txt', new AbortController().signal))).toBe('素材');

      await expect(env.resolvePath('../../etc/passwd')).rejects.toThrow(/越界/);
      await expect(env.resolvePath('/etc/hosts')).rejects.toThrow(/越界/);

      const sleepy = await env.exec('sleep 5', new AbortController().signal);
      expect(sleepy.exitCode).toBe(124);
      expect(sleepy.output).toContain('超时');

      const echo = await env.exec('echo hello-net', new AbortController().signal);
      expect(echo.exitCode).toBe(0);
      expect(echo.output).toContain('hello-net');
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('U4：联网实证——bash 可访问外网（真实网络，失败即环境无网）', async () => {
    const root = await tmpRoot('net');
    try {
      const env = await createNetworkExecutionEnvironment({ root, policyVersion: 'test', execTimeoutMs: 15_000 });
      const r = await env.exec("curl -s -o /dev/null -w '%{http_code}' -m 8 https://www.baidu.com || nslookup baidu.com >/dev/null 2>&1 && echo DNS_OK", new AbortController().signal);
      expect(r.exitCode).toBe(0);
      expect(/200|DNS_OK/.test(r.output)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });
});
