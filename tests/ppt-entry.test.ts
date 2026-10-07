import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB = join(import.meta.dirname, '..', 'web', 'src');

describe('M9 S2 壳层入口存在性', () => {
  it('侧栏高级折叠组有「快速 PPT」入口', () => {
    const sidebar = readFileSync(join(WEB, 'shell', 'Sidebar.tsx'), 'utf-8');
    expect(sidebar).toContain('ppt-quick-entry');
    expect(sidebar).toContain('快速 PPT');
  });
  it('StageKey 包含 ppt', () => {
    const types = readFileSync(join(WEB, 'state', 'types.ts'), 'utf-8');
    expect(types).toContain("'ppt'");
    expect(types).toContain("ppt: '快速 PPT'");
    // isStageKey 链末尾含 'ppt'（任意空白）
    expect(types).toMatch(/\|\s*'ppt'/);
  });
  it('路由注册到 /project/:id/ppt', () => {
    const route = readFileSync(join(WEB, 'views', 'StageRoute.tsx'), 'utf-8');
    expect(route).toContain("stage === 'ppt' && <PptGeneratorView />");
  });
  it('PptGeneratorView 表单完整（含关键字段与按钮）', () => {
    const view = readFileSync(join(WEB, 'views', 'PptGeneratorView.tsx'), 'utf-8');
    expect(view).toContain('ppt-input');
    expect(view).toContain('ppt-generate');
    expect(view).toContain('一键生成 PPTX');
    expect(view).toContain('audience');
    expect(view).toContain('pageBudget');
    // S2 AC：needsApproval → 视图内就地批准预览（data-testid 存在性）
    expect(view).toContain('ppt-outbound-preview');
    expect(view).toContain('ppt-approve');
  });
});
