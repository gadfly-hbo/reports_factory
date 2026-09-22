import { WorkspaceStore } from '../storage/workspace.js';
import { buildServer } from './app.js';
import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dataSync } from '../sync/dataSync.js';

/** 本地启动：node dist/server/start.js（默认 http://127.0.0.1:8787）
 *  双机同步：启动时拉取、退出时回推（对齐 deep-research 生命周期钩子）
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

  // 启动时：拉取双端项目数据
  const pull = dataSync(process.cwd());
  if (!pull.ok && pull.action === 'conflict') {
    console.warn(`[data-sync] 启动拉取冲突，保留本机数据继续：${pull.detail}`);
  }

  const app = buildServer(store, existsSync(webDist) ? webDist : undefined);
  await app.listen({ port, host: '127.0.0.1' });
  console.log(`Report Studio 已启动：http://127.0.0.1:${port}（数据目录：${store.root}）`);

  // 退出时：回推本机项目数据
  const shutdown = () => {
    const r = dataSync(process.cwd());
    if (!r.ok && r.action === 'conflict') {
      console.warn(`[data-sync] 退出回推冲突，已保留本机数据：${r.detail}`);
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
