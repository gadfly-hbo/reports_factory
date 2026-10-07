import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * M10 S1 壳层入口存在性断言（防「声明与代码不符」；源码结构断言 + S8 视觉门截图）。
 */

const WEB = join(import.meta.dirname, '..', 'web', 'src');

describe('M10 壳层入口（S1）', () => {
  it('侧栏有六步主流程导航（data-testid=step-nav）且无高级折叠组/快速 PPT', () => {
    const sidebar = readFileSync(join(WEB, 'shell', 'Sidebar.tsx'), 'utf-8');
    expect(sidebar).toContain('PPT 主流程');
    expect(sidebar).toContain('data-testid="step-nav"');
    expect(sidebar).toContain('新建项目');
    expect(sidebar).not.toContain('advanced-toggle');
    expect(sidebar).not.toContain('快速 PPT');
    expect(sidebar).not.toContain('制作主路径');
  });

  it('types 常量为两屏制（准备/生成与编辑；旧六步键保留路由兼容）', () => {
    const types = readFileSync(join(WEB, 'state', 'types.ts'), 'utf-8');
    expect(types).toMatch(/key: 'framework', title: '准备'/);
    expect(types).toMatch(/key: 'generate', title: '生成与编辑'/);
    expect(types).not.toContain('materials');
  });

  it('两屏路由接线（SetupView/BuildView）;旧报告路由重定向（N5）', () => {
    const route = readFileSync(join(WEB, 'views', 'StageRoute.tsx'), 'utf-8');
    expect(route).toContain('SetupView');
    expect(route).toContain('BuildView');
    expect(route).toContain('LEGACY');
    expect(route).not.toContain('ComposeView');
    expect(route).not.toContain('ExportView');
    expect(route).not.toContain('PptGeneratorView');
  });

  it('旧报告视图不存在于代码树（D1 删除清单）', () => {
    for (const f of ['ComposeView', 'EditorialView', 'CheckView', 'ExportView', 'MaterialsView', 'PptGeneratorView']) {
      expect(() => readFileSync(join(WEB, 'views', `${f}.tsx`), 'utf-8')).toThrow();
    }
  });

  it('命令面板为六步语义（打开项目/跳转/全局设置）', () => {
    const palette = readFileSync(join(WEB, 'shell', 'Palette.tsx'), 'utf-8');
    expect(palette).toContain('STAGES');
    expect(palette).toContain('打开项目');
    expect(palette).toContain('跳转:');
    expect(palette).toContain('全局设置');
  });
});
