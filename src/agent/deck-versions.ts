import { cp, mkdir, readdir, rm, stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * deck 版本快照（flow-9 P1-2）：confirmOutline 前整目录拷贝 versions/v{N}/deck/。
 * 保留最近 maxVersions 版（默认 5，超删最旧）。对比 = 文件名集合差 + bytes 差。
 */

export interface DeckVersion {
  n: number;
  created_at: string;
  pptx_bytes: number;
  page_count: number;
}

export interface PageDiff {
  file: string;
  status: 'added' | 'removed' | 'changed' | 'unchanged';
  bytes_a?: number;
  bytes_b?: number;
}

export async function snapshotDeck(projectRoot: string, maxVersions = 5): Promise<number> {
  const deckDir = join(projectRoot, 'deck');
  if (!existsSync(deckDir)) return 0;
  const versionsDir = join(projectRoot, 'versions');
  await mkdir(versionsDir, { recursive: true });
  const existing = (await readdir(versionsDir)).filter((d) => /^v\d+$/.test(d)).map((d) => Number.parseInt(d.slice(1), 10)).sort((a, b) => a - b);
  const n = (existing.at(-1) ?? 0) + 1;
  await cp(deckDir, join(versionsDir, `v${n}`, 'deck'), { recursive: true });
  // cap：超删最旧
  while (existing.length + 1 > maxVersions) {
    const oldest = existing.shift()!;
    await rm(join(versionsDir, `v${oldest}`), { recursive: true, force: true }).catch(() => {});
  }
  return n;
}

export async function listVersions(projectRoot: string): Promise<DeckVersion[]> {
  const versionsDir = join(projectRoot, 'versions');
  if (!existsSync(versionsDir)) return [];
  const out: DeckVersion[] = [];
  for (const d of (await readdir(versionsDir)).filter((x) => /^v\d+$/.test(x)).sort()) {
    const deckDir = join(versionsDir, d, 'deck');
    if (!existsSync(deckDir)) continue;
    const n = Number.parseInt(d.slice(1), 10);
    const pptxPath = join(deckDir, 'deck.pptx');
    const pptxInfo = existsSync(pptxPath) ? await stat(pptxPath) : null;
    const pagesDir = join(deckDir, 'pages');
    const pageCount = existsSync(pagesDir) ? (await readdir(pagesDir)).filter((f) => f.endsWith('.mjs') || f.endsWith('.js')).length : 0;
    const deckMjs = existsSync(join(deckDir, 'deck.mjs')) ? await stat(join(deckDir, 'deck.mjs')) : null;
    out.push({ n, created_at: (deckMjs ?? pptxInfo)?.mtime.toISOString() ?? new Date().toISOString(), pptx_bytes: pptxInfo?.size ?? 0, page_count: pageCount });
  }
  return out;
}

async function pageMap(deckDir: string): Promise<Map<string, number>> {
  const pagesDir = join(deckDir, 'pages');
  const map = new Map<string, number>();
  if (!existsSync(pagesDir)) return map;
  for (const f of (await readdir(pagesDir)).filter((x) => x.endsWith('.mjs') || x.endsWith('.js'))) {
    map.set(f, (await stat(join(pagesDir, f))).size);
  }
  return map;
}

export async function diffVersions(projectRoot: string, a: number, b: number): Promise<PageDiff[]> {
  const dirA = join(projectRoot, 'versions', `v${a}`, 'deck');
  const dirB = join(projectRoot, 'versions', `v${b}`, 'deck');
  const mapA = await pageMap(dirA);
  const mapB = await pageMap(dirB);
  const files = new Set([...mapA.keys(), ...mapB.keys()]);
  const out: PageDiff[] = [];
  for (const f of files) {
    const ba = mapA.get(f);
    const bb = mapB.get(f);
    if (ba === undefined) out.push({ file: f, status: 'added', bytes_b: bb });
    else if (bb === undefined) out.push({ file: f, status: 'removed', bytes_a: ba });
    else if (ba !== bb) out.push({ file: f, status: 'changed', bytes_a: ba, bytes_b: bb });
    else out.push({ file: f, status: 'unchanged' });
  }
  return out.sort((x, y) => x.file.localeCompare(y.file));
}
