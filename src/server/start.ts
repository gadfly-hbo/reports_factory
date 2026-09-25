import { WorkspaceStore } from '../storage/workspace.js';
import { buildServer } from './app.js';
import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

/** 本地启动：node dist/server/start.js（默认 http://127.0.0.1:8787）
 *  双机同步：数据随仓库走 git——变动端 git-commit-push 到 GitHub，另一端手动触发 git-pull-sync 拉取
 */
async function main() {
  const port = Number(process.env['PORT'] ?? 8787);
  const store = WorkspaceStore.open();
  const webDist = join(process.cwd(), 'web-dist');

  // 确保 data 目录存在（仓库可追踪的最小桩）
  if (!existsSync(store.root)) {
    mkdirSync(store.root, { recursive: true });
    const keep = join(store.root, '.keep');
    if (!existsSync(keep)) writeFileSync(keep, '');
  }

  const app = buildServer(store, existsSync(webDist) ? webDist : undefined);
  await app.listen({ port, host: '127.0.0.1' });
  console.log(`Report Studio 已启动：http://127.0.0.1:${port}（数据目录：${store.root}）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
