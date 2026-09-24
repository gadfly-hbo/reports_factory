import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dataSync } from '../src/sync/dataSync.js';

/**
 * 双机数据同步回归（对齐 deep-research：数据随仓库同步）。
 * 回归背景：曾因 `data/*` 被全部忽略，`git add -- data` 静默空转——
 * 同步从未真正携带项目数据（含 M4 编审状态）。本测试用真实 .gitignore 模式
 * + 本地 bare 远端验证：工作区/编审状态/修订入库，可再生工件（docx/html）不入库。
 */

const REPO_ROOT = join(import.meta.dirname, '..');

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

function writeFile(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

describe('双机数据同步（data 经 git 真实入库）', () => {
  let dir: string;
  let a: string; // 机器 A（写入方）
  let b: string; // 机器 B（拉取方）
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rs-sync-'));
    const origin = join(dir, 'origin.git');
    execFileSync('git', ['init', '--bare', '--initial-branch=main', origin]);
    a = join(dir, 'a');
    execFileSync('git', ['clone', origin, a], { encoding: 'utf-8' });
    // 用仓库真实 .gitignore——回归锚点就是这份模式
    cpSync(join(REPO_ROOT, '.gitignore'), join(a, '.gitignore'));
    git(a, ['add', '.gitignore']);
    git(a, ['commit', '-m', 'chore: gitignore']);
    git(a, ['push', 'origin', 'main']);
    b = join(dir, 'b');
    execFileSync('git', ['clone', origin, b], { encoding: 'utf-8' });
    // dataSync 内部 commit 需要身份；测试环境不依赖全局配置
    for (const k of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL']) {
      savedEnv[k] = process.env[k];
      process.env[k] = k.includes('EMAIL') ? 't@example.com' : 't';
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('项目数据（含 M4 编审状态与修订）入库并跨机可见；可再生工件不入库', () => {
    const proj = join(a, 'data', 'proj_t1');
    writeFile(join(proj, 'project.json'), '{"project_id":"proj_t1"}');
    writeFile(join(proj, 'work', 'editorial.json'), '{"status":"g1_approved"}');
    writeFile(join(proj, 'revisions', 'rev_001.json'), '{"revision_id":"rev_001"}');
    writeFile(join(proj, 'exports', 'exp_001.json'), '{"export_id":"exp_001"}');
    writeFile(join(proj, 'exports', 'exp_001.html'), '<html>可再生工件</html>');
    writeFile(join(proj, 'exports', 'exp_001.docx'), 'PK-binary');
    writeFileSync(join(a, 'data', '.keep'), '');

    const push = dataSync(a);
    expect(push.ok).toBe(true);
    expect(push.action).toBe('pushed');

    const tracked = git(a, ['ls-files']).split('\n');
    expect(tracked).toContain('data/proj_t1/work/editorial.json');
    expect(tracked).toContain('data/proj_t1/revisions/rev_001.json');
    expect(tracked).toContain('data/proj_t1/exports/exp_001.json');
    // 可再生工件不入库
    expect(tracked).not.toContain('data/proj_t1/exports/exp_001.html');
    expect(tracked).not.toContain('data/proj_t1/exports/exp_001.docx');

    // 机器 B 拉取：编审状态跨机可见
    const pull = dataSync(b);
    expect(pull.ok).toBe(true);
    expect(existsSync(join(b, 'data', 'proj_t1', 'work', 'editorial.json'))).toBe(true);
    expect(readFileSync(join(b, 'data', 'proj_t1', 'work', 'editorial.json'), 'utf-8')).toContain('g1_approved');
  });

  it('变更回推：A 修改编审状态 → B 再拉取拿到新内容', () => {
    const proj = join(a, 'data', 'proj_t2');
    writeFile(join(proj, 'work', 'editorial.json'), '{"status":"organizing"}');
    dataSync(a);
    dataSync(b);

    writeFile(join(proj, 'work', 'editorial.json'), '{"status":"published","decisions":{"report_x":[]}}');
    const push2 = dataSync(a);
    expect(push2.ok).toBe(true);
    expect(push2.action).toBe('pushed');
    dataSync(b);
    expect(readFileSync(join(b, 'data', 'proj_t2', 'work', 'editorial.json'), 'utf-8')).toContain('published');
  });
});
