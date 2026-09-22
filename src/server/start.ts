import { WorkspaceStore } from '../storage/workspace.js';
import { buildServer } from './app.js';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

/** 本地启动：node dist/server/start.js（默认 http://127.0.0.1:8787） */
async function main() {
  const port = Number(process.env['PORT'] ?? 8787);
  const store = WorkspaceStore.open();
  const webDist = join(process.cwd(), 'web-dist');
  const app = buildServer(store, existsSync(webDist) ? webDist : undefined);
  await app.listen({ port, host: '127.0.0.1' });
  console.log(`Report Studio 已启动：http://127.0.0.1:${port}（数据目录：${store.root}）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
