import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * S5 入口存在性断言（PRD D5 / 红队 KA-4：防「声明与代码不符」）：
 * 壳层改造的入口以源码结构断言（rg 同构检查），配合视觉验收截图。
 */

const WEB = join(import.meta.dirname, '..', 'web', 'src');

describe('M7 壳层入口存在性（S5）', () => {
  it('侧栏有主路径导航（01 生成 / 02 编辑 / 03 审批导出）与高级折叠组', () => {
    const sidebar = readFileSync(join(WEB, 'shell', 'Sidebar.tsx'), 'utf-8');
    expect(sidebar).toContain('MAIN_STAGES');
    expect(sidebar).toContain('制作主路径');
    expect(sidebar).toContain('data-testid="main-path-nav"');
    expect(sidebar).toContain('data-testid="advanced-toggle"');
    expect(sidebar).toContain('data-testid="advanced-nav"');
  });

  it('主路径常量含三步且原五阶段保留（高级组可达）', () => {
    const types = readFileSync(join(WEB, 'state', 'types.ts'), 'utf-8');
    expect(types).toMatch(/MAIN_STAGES.*generate.*生成/s);
    expect(types).toMatch(/key: 'compose', title: '编辑'/);
    expect(types).toMatch(/key: 'export', title: '审批导出'/);
    // 五阶段仍在（高级组）
    expect(types).toMatch(/key: 'materials', title: '材料', n: 1/);
    expect(types).toMatch(/key: 'outline', title: '编审', n: 2/);
  });

  it('生成页路由与视图存在，编辑/审批直达既有视图', () => {
    const route = readFileSync(join(WEB, 'views', 'StageRoute.tsx'), 'utf-8');
    expect(route).toContain("stage === 'generate' && <GenerateView />");
    expect(route).toContain("stage === 'compose' && <ComposeView />");
    expect(route).toContain("stage === 'export' && <ExportView />");
    expect(readFileSync(join(WEB, 'views', 'GenerateView.tsx'), 'utf-8')).toContain('一键生成');
  });

  it('命令面板同步主路径与高级语义', () => {
    const palette = readFileSync(join(WEB, 'shell', 'Palette.tsx'), 'utf-8');
    expect(palette).toContain('MAIN_STAGES');
    expect(palette).toContain('主路径');
    expect(palette).toContain('高级:');
  });
});
