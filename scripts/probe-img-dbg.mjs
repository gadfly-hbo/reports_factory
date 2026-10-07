import { piTransport } from '../dist/model/pi-transport.js';
import { getBuiltinModel } from '@earendil-works/pi-ai/providers/all';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAQUlEQVRYhe3RAQ0AAAjDMO5/aWBjUMQzSA5cEQAAAAAAAAAAAAAA8M8DQGgABsAAAAASUVORK5CYII=';
const t = piTransport({ timeoutMs: 120_000 });
for (const [p, m] of [['minimax-cn', 'MiniMax-M3'], ['xiaomi-token-plan-cn', 'mimo-v2.6-flash']]) {
  try {
    const cfg = { provider: p, modelId: m };
    const out = await t(cfg, {
      system: '你是视觉助手。看图用 JSON 回答：{"color":"主色","shape":"形状"}。只用 JSON。',
      user: '图是什么形状？主色？',
      images: [{ data: PNG, mimeType: 'image/png' }],
    });
    console.log(p, out.text.slice(0, 100));
  } catch (e) { console.log(p, 'FAIL', String(e).slice(0, 200)); }
}
