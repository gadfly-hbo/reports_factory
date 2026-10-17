/** PptxGenJS 4.0.1（锁定版）序列化原生图表的嵌入工作簿时，会在 xl/tables/table*.xml 的
 *  合法单元格范围尾部多写一个单引号（ref="A1:B4'"），导致 Keynote 等丢弃原生图表。
 *  仅修复导出副本中的这一处序列化缺陷：只移除受影响范围尾部的多余单引号；
 *  不做全局替换、不删部件；无缺陷/无图表/已修复时原字节返回（幂等）；
 *  坏 ZIP／读取失败按导出错误抛出，不伪造成功产物。中立于运行环境（无宿主开关）。 */

const WORKSHEET_PART = /^ppt\/embeddings\/Microsoft_Excel_Worksheet\d+\.xlsx$/;
const TABLE_PART = /^xl\/tables\/table\d+\.xml$/;
/** 仅匹配 <table ... ref="A1:B4'"> 形态：范围本体合法、紧邻闭引号前恰有一个多余单引号。 */
const TRAILING_QUOTE = /(<table\b[^>]*\bref=")([A-Z]+[1-9]\d*:[A-Z]+[1-9]\d*)'(")/g;

export async function repairChartTableRanges(artifact: Buffer): Promise<Buffer> {
  const JSZip = (await import('jszip')).default;
  const deck = await JSZip.loadAsync(artifact);
  let changed = false;
  for (const [name, part] of Object.entries(deck.files)) {
    if (part.dir || !WORKSHEET_PART.test(name)) continue;
    const workbook = await JSZip.loadAsync(await part.async('nodebuffer'));
    let workbookChanged = false;
    for (const [tableName, table] of Object.entries(workbook.files)) {
      if (table.dir || !TABLE_PART.test(tableName)) continue;
      const before = await table.async('string');
      const after = before.replace(TRAILING_QUOTE, '$1$2$3');
      if (after === before) continue;
      workbook.file(tableName, after);
      workbookChanged = true;
    }
    if (!workbookChanged) continue;
    deck.file(name, await workbook.generateAsync({ type: 'nodebuffer' }));
    changed = true;
  }
  return changed ? await deck.generateAsync({ type: 'nodebuffer' }) : artifact;
}
