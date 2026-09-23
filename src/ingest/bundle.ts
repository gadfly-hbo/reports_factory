import { createHash } from 'node:crypto';
import { AnalysisBundleSchema, type AnalysisBundle } from '../schema/bundle.js';
import type { Claim } from '../schema/report-spec.js';
import type { EvidenceRef } from '../schema/assets.js';
import type { SourceAsset } from '../schema/project.js';
import type { WorkspaceStore } from '../storage/workspace.js';

/**
 * AnalysisBundle 导入（模块方案 §5.3/§11.1）。
 * 包内容只是材料：不解析路径、不执行任何内容、不发起模型调用（§11.4/§14.3）。
 * 资产按"逻辑身份 + 结果版本"入库：logical_key 跨版本稳定，
 * claim_id/evidence_id 是本项目的实例 ID（每次导入重新铸造）。
 */

/** 来源逻辑身份：任务是上游稳定锚，无任务的生产者退回 bundle_id（G4） */
export function bundleSourceLogicalKey(bundle: AnalysisBundle): string {
  return `bundle:${bundle.producer}:${bundle.upstream.task_id ?? bundle.bundle_id}`;
}

export interface BundleUpdateImpact {
  source_logical_key: string;
  from_version: string;
  to_version: string;
  changed: string[];
  added: string[];
  removed: string[];
  detected_at: string;
}

export interface BundleImportResult extends SourceAsset {
  ok: true;
  /** true = 相同快照已导入过，本次为幂等去重（T03：不重复创建资产） */
  deduped: boolean;
  counts: { claims: number; evidence: number; metrics: number; charts: number };
  /** 版本升级时的影响数据（T11）：旧引用不变，影响进入待复核，不自动改写报告 */
  update?: BundleUpdateImpact;
}

export async function importAnalysisBundle(
  store: WorkspaceStore,
  projectId: string,
  raw: unknown,
): Promise<BundleImportResult> {
  const bundle = AnalysisBundleSchema.parse(raw);
  const logicalKey = bundleSourceLogicalKey(bundle);
  const content = Buffer.from(JSON.stringify(raw, null, 2), 'utf-8');

  // 幂等（§11.4）：按"逻辑身份 + 快照身份"判定同一成果快照——
  // 不用全文重序列化哈希（同快照不同键序会误判为新版本）
  const existing = (await store.listSourceAssets(projectId)).find(
    (s) => s.logical_key === logicalKey && s.snapshot_id === bundle.snapshot_id,
  );
  if (existing) {
    const derived = (await store.readDerivedAssets(projectId, existing.source_id)) as Record<string, any> | null;
    return {
      ...existing,
      parse_status: existing.parse_status ?? 'parsed',
      ok: true,
      deduped: true,
      counts: {
        claims: derived?.claims?.length ?? bundle.findings.length,
        evidence: derived?.evidence?.length ?? bundle.evidence.length,
        metrics: derived?.metrics?.length ?? bundle.metrics.length,
        charts: derived?.charts?.length ?? bundle.charts.length,
      },
    };
  }

  // 版本升级检测（§7.7 同口径新版本）：同逻辑身份的最近一次导入
  const previous = (await store.listSourceAssets(projectId))
    .filter((s) => s.logical_key === logicalKey)
    .sort((a, b) => a.imported_at.localeCompare(b.imported_at))
    .at(-1);

  const asset = await store.saveSourceAsset(projectId, {
    replaces: previous?.source_id,
    filename: `${bundle.bundle_id}.json`,
    content,
    media_type: 'application/json',
    kind: 'bundle',
    sensitivity: bundle.permissions?.sensitivity ?? 'normal',
    version: bundle.upstream.result_revision,
    logical_key: logicalKey,
    snapshot_id: bundle.snapshot_id,
  });

  const sourceId = asset.source_id;
  const evIdByBundleId = new Map(bundle.evidence.map((e, i) => [e.evidence_id, `ev_${sourceId}_${i + 1}`]));
  const evidence: EvidenceRef[] = bundle.evidence.map((e, i) => ({
    evidence_id: `ev_${sourceId}_${i + 1}`,
    source_id: sourceId,
    source_version: bundle.upstream.result_revision,
    locator: e.locator,
    excerpt: e.excerpt,
  }));

  const claims: Claim[] = bundle.findings.map((f, i) => ({
    claim_id: `claim_${sourceId}_${i + 1}`,
    logical_key: `${logicalKey}::${f.finding_id}`,
    kind: f.kind,
    text: f.text,
    metric_refs: f.metric_refs,
    evidence_refs: f.evidence_refs.flatMap((eid) => {
      const mapped = evIdByBundleId.get(eid);
      return mapped ? [mapped] : [];
    }),
    verification_state: f.verification,
    source_truth_verified: false,
    uncertainty: f.limitations.length > 0 ? f.limitations.join('；') : undefined,
  }));

  await store.saveDerivedAssets(projectId, sourceId, {
    claims,
    evidence,
    tables: [],
    notes: [],
    confirmations: [],
    // M4 派生扩展：指标/图表/发现原文（含限制与反证，供发现卡片组合视图用）；
    // 口径在 metrics.scope/formula，权限随包原文与 source.sensitivity 保留
    metrics: bundle.metrics.map((m) => ({
      ...m,
      logical_key: `${logicalKey}::${m.metric_id}`,
      metric_id: `metric_${sourceId}_${m.metric_id}`,
      source_ref: sourceId,
    })),
    charts: bundle.charts,
    findings: bundle.findings,
    bundle_limitations: bundle.limitations,
    availability: bundle.availability,
  });
  await store.markSourceParse(projectId, sourceId, 'parsed');

  // 补证结果回流（G8）：origin 指向的请求 → returned + result_refs 关联；
  // 请求声明的受影响页进入待复核（结果未采用前不自动改写报告）
  if (bundle.origin?.evidence_request_id) {
    const requests = (await store.readEvidenceRequests(projectId)) as Array<Record<string, any>>;
    const req = requests.find((r) => r.request_id === bundle.origin!.evidence_request_id);
    if (req) {
      req.state = 'returned';
      req.result_refs = [...new Set([...(req.result_refs ?? []), sourceId])];
      req.updated_at = new Date().toISOString();
      await store.writeEvidenceRequests(projectId, requests);
      const pending = (await store.readPendingUpdates(projectId)) as unknown[];
      pending.push({
        source_logical_key: logicalKey,
        from_version: '补证请求',
        to_version: bundle.upstream.result_revision,
        changed: [],
        added: bundle.findings.map((f) => `${logicalKey}::${f.finding_id}`),
        removed: [],
        affected_pages: (req.affected_objects as string[] | undefined) ?? [],
        origin_request: req.request_id,
        detected_at: new Date().toISOString(),
      });
      await store.writePendingUpdates(projectId, pending);
    }
  }

  // 版本升级：按 finding_id 对比新旧发现，产生待复核影响数据（§7.7；不自动改写报告）
  let update: BundleUpdateImpact | undefined;
  if (previous) {
    const prevDerived = (await store.readDerivedAssets(projectId, previous.source_id)) as
      | { findings?: Array<{ finding_id: string; text: string; kind: string; verification: string }> }
      | null;
    const prevById = new Map((prevDerived?.findings ?? []).map((f) => [f.finding_id, f]));
    const changed: string[] = [];
    const added: string[] = [];
    const currentIds = new Set(bundle.findings.map((f) => f.finding_id));
    for (const f of bundle.findings) {
      const old = prevById.get(f.finding_id);
      const logical = `${logicalKey}::${f.finding_id}`;
      if (!old) added.push(logical);
      else if (old.text !== f.text || old.kind !== f.kind || old.verification !== f.verification) changed.push(logical);
    }
    const removed = [...prevById.keys()].filter((id) => !currentIds.has(id)).map((id) => `${logicalKey}::${id}`);
    if (changed.length > 0 || added.length > 0 || removed.length > 0) {
      update = {
        source_logical_key: logicalKey,
        from_version: previous.version,
        to_version: bundle.upstream.result_revision,
        changed,
        added,
        removed,
        detected_at: new Date().toISOString(),
      };
      const pending = (await store.readPendingUpdates(projectId)) as unknown[];
      pending.push(update);
      await store.writePendingUpdates(projectId, pending);
    }
  }

  return {
    ...asset,
    parse_status: 'parsed',
    ok: true,
    deduped: false,
    update,
    counts: {
      claims: claims.length,
      evidence: evidence.length,
      metrics: bundle.metrics.length,
      charts: bundle.charts.length,
    },
  };
}
