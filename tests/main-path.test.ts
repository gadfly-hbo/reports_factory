import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';

const MAT = join(import.meta.dirname, 'fixtures/materials');

/**
 * S4 主路径 tracer（PRD D5）：选模版 → 传材料 → 一键生成 → 体检 → G1 签批 → 内/外审批 → 导出。
 * 门禁行为的负例（G1 未批拦正式、外发未勾选拦截）已由 api.test.ts/privacy.test.ts 覆盖，
 * 本用例验证四步主路径端到端贯通。
 */
describe('审核审批主路径（S4）', () => {
  let app: FastifyInstance;
  let dir: string;
  let store: WorkspaceStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rs-path-'));
    store = new WorkspaceStore(dir);
    app = buildServer(store);
  });
  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('主路径贯通：生成 → 体检 → G1 → 内用正式导出', async () => {
    // 1) 选模版建项目
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { title: '主路径 tracer', template_id: 'ops_review_deck' },
    });
    const pid = createRes.json().project.project_id;

    // 2) 传材料
    for (const f of [
      { filename: 'conclusion.md', kind: 'markdown', media_type: 'text/markdown' },
      { filename: 'sales.csv', kind: 'csv', media_type: 'text/csv' },
    ] as const) {
      const content_base64 = (await readFile(join(MAT, f.filename))).toString('base64');
      await app.inject({
        method: 'POST',
        url: `/api/projects/${pid}/sources`,
        payload: { filename: f.filename, content_base64, kind: f.kind, media_type: f.media_type },
      });
    }

    // 3) 一键生成
    const gen = await app.inject({
      method: 'POST',
      url: `/api/projects/${pid}/generate`,
      payload: { audience: '经营负责人', purpose: '上半年复盘' },
    });
    expect(gen.json().generation.status).toBe('done');

    // 4) 导出前体检：清单可观（blocker/warning 分列）
    const checks = (await app.inject({ method: 'POST', url: `/api/projects/${pid}/checks`, payload: { exportScope: 'internal' } })).json();
    expect(Array.isArray(checks.issues)).toBe(true);
    expect(typeof checks.blockers).toBe('number');
    expect(typeof checks.warnings).toBe('number');

    // 5) G1 签批（内容审核关口）
    const g1 = await app.inject({ method: 'POST', url: `/api/projects/${pid}/approve-g1`, payload: { approver: '张编制' } });
    expect(g1.statusCode).toBe(200);

    // 6) 内用正式导出（不需外发勾选）
    const exp = (await app.inject({
      method: 'POST',
      url: `/api/projects/${pid}/export`,
      payload: { mode: 'formal', formats: ['pptx'], exportScope: 'internal' },
    })).json();
    expect(exp.allowed).toBe(true);

    // 7) 外发未勾选 ack_external_share → 被拦（主路径外发关口）
    const ext = (await app.inject({
      method: 'POST',
      url: `/api/projects/${pid}/export`,
      payload: { mode: 'formal', formats: ['pptx'], exportScope: 'external', chart_data_mode: 'aggregate_only' },
    })).json();
    expect(ext.allowed).toBe(false);
    expect(ext.reason).toBeTruthy();

    // 8) 勾选外发确认后放行
    const ext2 = (await app.inject({
      method: 'POST',
      url: `/api/projects/${pid}/export`,
      payload: { mode: 'formal', formats: ['pptx'], exportScope: 'external', chart_data_mode: 'aggregate_only', ack_external_share: true },
    })).json();
    expect(ext2.allowed).toBe(true);
  });
});
