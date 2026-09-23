import { dataSync } from '../sync/dataSync.js';

/** `npm run data-sync`：手动双机同步（提交本机 data/ → 拉远端 → 推送） */
const r = dataSync();
if (r.ok) {
  console.log(`[data-sync] ${r.action}${r.detail ? `：${r.detail}` : ''}`);
} else {
  console.error(`[data-sync] ${r.action}：${r.detail}`);
  if (r.action === 'network') {
    console.error('远端不可达（网络/代理），本机数据已保留——联网后重试即可，无需人工处理冲突。');
  } else {
    console.error('已保留本机数据，请人工处理冲突后重试。');
  }
  process.exit(1);
}
