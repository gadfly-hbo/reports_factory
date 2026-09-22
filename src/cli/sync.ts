import { dataSync } from '../sync/dataSync.js';

/** `npm run data-sync`：手动双机同步（提交本机 data/ → 拉远端 → 推送） */
const r = dataSync();
if (r.ok) {
  console.log(`[data-sync] ${r.action}${r.detail ? `：${r.detail}` : ''}`);
} else {
  console.error(`[data-sync] ${r.action}：${r.detail}`);
  console.error('已保留本机数据，请人工处理冲突后重试。');
  process.exit(1);
}
