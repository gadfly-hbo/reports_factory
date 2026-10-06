import { describe, expect, it } from 'vitest';
import { parseJsonLoose } from '../src/model/client.js';
import { stripThinkTags } from '../src/model/pi-transport.js';

/** M8：标准 v1.1 坑表 #7/#11 的加固回归锁定 */
describe('Agent Runtime 坑表加固（M8）', () => {
  it('#7 MiniMax-M3 <think> 思考标签剥离', () => {
    expect(stripThinkTags('<think>推理过程……内部数字 99</think>{"a":1}')).toBe('{"a":1}');
    expect(stripThinkTags('  <think>x</think>\n\n正文')).toBe('正文');
    expect(stripThinkTags('无标签输出')).toBe('无标签输出');
    // 多段 think 全剥
    expect(stripThinkTags('<think>a</think>A<think>b</think>B')).toBe('AB');
  });

  it('#11 double-encoded JSON coerce 展开（≤3 层）', () => {
    // 一层包装：{"reportMd":"{...}"}
    expect(parseJsonLoose('{"op":"{\\"kind\\":\\"edit_text\\",\\"page_id\\":\\"p1\\"}"}')).toEqual({
      op: { kind: 'edit_text', page_id: 'p1' },
    });
    // 普通对象不受影响
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
    // 字符串值不是 JSON 时不误伤
    expect(parseJsonLoose('{"note":"hello {世界}"}')).toEqual({ note: 'hello {世界}' });
    // 围栏 + 双层编码组合
    const wrapped = '```json\n{"data":"[\\"x\\"]"}\n```';
    expect(parseJsonLoose(wrapped)).toEqual({ data: ['x'] });
  });
});
