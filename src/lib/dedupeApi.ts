// Client for the deduplication review API (FastAPI/Swagger backend).
//
// Mental model:
//  - A *group* (GRP-xxxxx) is a connected cluster of person-records the system
//    thinks might relate. There are thousands of them.
//  - Inside a group are *records* (one reported person: name, age, location,
//    phone, photo, source text, folio).
//  - Records are linked by *relationships* of two kinds:
//      proposed_duplicate    -> "same person" (tied to a duplicate_cluster_id)
//      same_group_or_family  -> "related but different people"
//  - The reviewer's job per group: confirm true duplicates, reject false ones.
//
// All calls go straight from the browser to NEXT_PUBLIC_DEDUPE_API_URL.

export const DEDUPE_API_URL = (
  process.env.NEXT_PUBLIC_DEDUPE_API_URL ||
  "https://venezuela-terremoto-c4gafbfpc0dadpcj.eastus-01.azurewebsites.net"
).replace(/\/$/, "");

// ---- Types (mirrors the OpenAPI schemas) ----------------------------------

export type RelationshipType = "proposed_duplicate" | "same_group_or_family" | string;
export type ManualStatus = "proposed" | "confirmed" | "rejected" | string;

export interface RecordSummary {
  record_id: string;
  group_id: string | null;
  duplicate_cluster_id: string | null;
  proposed_primary_record_id: string | null;
  duplicate_role: "primary" | "secondary" | string | null;
  relationship_bucket: string | null;
  person_name_raw: string | null;
  age: number | string | null;
  last_seen_location_raw: string | null;
  contact_phone_e164: number | string | null;
  source_text_raw: string | null;
  image_public_path: string | null;
  status: string | null;
  folio: string | null;
  manual_group_status: string | null;
}

export interface RelationshipSummary {
  id: string;
  group_id: string | null;
  duplicate_cluster_id: string | null;
  relationship_type: RelationshipType;
  primary_record_id: string;
  secondary_record_id: string;
  primary_person_name_raw: string | null;
  secondary_person_name_raw: string | null;
  primary_age: number | string | null;
  secondary_age: number | string | null;
  primary_last_seen_location_raw: string | null;
  secondary_last_seen_location_raw: string | null;
  primary_contact_phone_e164: number | string | null;
  secondary_contact_phone_e164: number | string | null;
  name_score: number | null;
  location_score: number | null;
  phone_match: boolean | null;
  overall_score: number | null;
  family_group_reason: string | null;
  manual_status: ManualStatus | null;
  manual_reason: string | null;
  source: string | null;
}

export interface GroupSummary {
  group_id: string;
  record_count: number;
  duplicate_record_count: number;
  family_record_count: number;
  duplicate_cluster_count: number;
  sample_names: string[];
  sample_locations: string[];
  sample_phones: string[];
  primary_record_ids: string[];
}

export interface GroupDetail {
  group: GroupSummary;
  records: RecordSummary[];
  relationships: RelationshipSummary[];
}

export interface ListGroupsResponse {
  groups: GroupSummary[];
  total: number;
}

// ---- Low-level fetch -------------------------------------------------------

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${DEDUPE_API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.detail
        ? typeof body.detail === "string"
          ? body.detail
          : JSON.stringify(body.detail)
        : "";
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(`API ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  // Some endpoints (downloads) may return no JSON body.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ---- Endpoints -------------------------------------------------------------

export function listGroups(params: {
  search?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}): Promise<ListGroupsResponse> {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  q.set("limit", String(params.limit ?? 50));
  q.set("offset", String(params.offset ?? 0));
  return request<ListGroupsResponse>(`/api/groups?${q.toString()}`, {
    signal: params.signal,
  });
}

export function getGroup(groupId: string, signal?: AbortSignal): Promise<GroupDetail> {
  return request<GroupDetail>(`/api/groups/${encodeURIComponent(groupId)}`, { signal });
}

export function searchRecords(q: string, limit = 25): Promise<RecordSummary[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  return request<RecordSummary[]>(`/api/records/search?${params.toString()}`);
}

// Confirm two records are the same person.
export function confirmDuplicate(body: {
  primary_record_id: string;
  secondary_record_id: string;
  group_id?: string | null;
}): Promise<RelationshipSummary> {
  return request<RelationshipSummary>(`/api/duplicates`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Reject a proposed duplicate (they are NOT the same person).
export function rejectDuplicate(body: {
  primary_record_id: string;
  secondary_record_id: string;
  reason?: string | null;
}): Promise<RelationshipSummary> {
  return request<RelationshipSummary>(`/api/duplicates/reject`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Reject any relationship by its id (e.g. a same_group_or_family link).
export function rejectRelationship(body: {
  relationship_id: string;
  reason?: string | null;
}): Promise<RelationshipSummary> {
  return request<RelationshipSummary>(`/api/relationships/reject`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function addGroupMember(
  groupId: string,
  recordId: string,
): Promise<RecordSummary> {
  return request<RecordSummary>(
    `/api/groups/${encodeURIComponent(groupId)}/members`,
    { method: "POST", body: JSON.stringify({ record_id: recordId }) },
  );
}

export function removeGroupMember(
  groupId: string,
  recordId: string,
): Promise<RecordSummary> {
  return request<RecordSummary>(
    `/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(recordId)}`,
    { method: "DELETE" },
  );
}

// ---- Helpers ---------------------------------------------------------------

export function formatPhone(phone: number | string | null | undefined): string | null {
  if (phone == null || phone === "") return null;
  // The API returns phones as floats/strings like 584123567129 or "584123567129.0".
  const digits = String(phone).replace(/\.0+$/, "").replace(/\D/g, "");
  if (!digits) return null;
  return `+${digits}`;
}

// Build the proposed-person clusters for a group's records. The API already
// pre-clusters: records sharing a duplicate_cluster_id are the "same person",
// and proposed_primary_record_id marks the keeper. Records with no cluster are
// treated as their own single-record person.
export interface PersonCluster {
  key: string; // cluster id, or the record id for singletons
  clusterId: string | null;
  primaryId: string | null;
  name: string; // best display name for the person
  records: RecordSummary[];
}

export function buildPersonClusters(records: RecordSummary[]): PersonCluster[] {
  const byCluster = new Map<string, RecordSummary[]>();
  const singletons: RecordSummary[] = [];

  for (const r of records) {
    if (r.duplicate_cluster_id) {
      const arr = byCluster.get(r.duplicate_cluster_id) ?? [];
      arr.push(r);
      byCluster.set(r.duplicate_cluster_id, arr);
    } else {
      singletons.push(r);
    }
  }

  const clusters: PersonCluster[] = [];
  for (const [clusterId, recs] of byCluster) {
    const primary =
      recs.find((r) => r.record_id === r.proposed_primary_record_id) ?? recs[0];
    clusters.push({
      key: clusterId,
      clusterId,
      primaryId: primary?.proposed_primary_record_id ?? primary?.record_id ?? null,
      name: primary?.person_name_raw || recs[0]?.person_name_raw || "Sin nombre",
      records: recs,
    });
  }
  for (const r of singletons) {
    clusters.push({
      key: r.record_id,
      clusterId: null,
      primaryId: r.record_id,
      name: r.person_name_raw || "Sin nombre",
      records: [r],
    });
  }
  return clusters;
}

// Commit a reviewed group: remove the records the reviewer marked as not
// belonging, then confirm the remaining duplicate clusters. Returns per-action
// results so the UI can surface partial failures.
export async function commitGroupReview(opts: {
  groupId: string;
  removedRecordIds: string[];
  clusters: PersonCluster[];
}): Promise<{ removed: number; confirmed: number; errors: string[] }> {
  const errors: string[] = [];
  let removed = 0;
  let confirmed = 0;

  // 1) Remove records that don't belong.
  await Promise.all(
    opts.removedRecordIds.map(async (recordId) => {
      try {
        await removeGroupMember(opts.groupId, recordId);
        removed += 1;
      } catch (e) {
        errors.push(`No se pudo quitar ${recordId}: ${msg(e)}`);
      }
    }),
  );

  const removedSet = new Set(opts.removedRecordIds);

  // 2) Confirm each surviving duplicate cluster (>=2 kept records = same person).
  await Promise.all(
    opts.clusters.map(async (cluster) => {
      if (!cluster.clusterId) return; // singletons need no confirmation
      const kept = cluster.records.filter((r) => !removedSet.has(r.record_id));
      const primary =
        kept.find((r) => r.record_id === cluster.primaryId) ?? kept[0];
      if (!primary || kept.length < 2) return;
      for (const r of kept) {
        if (r.record_id === primary.record_id) continue;
        try {
          await confirmDuplicate({
            primary_record_id: primary.record_id,
            secondary_record_id: r.record_id,
            group_id: opts.groupId,
          });
          confirmed += 1;
        } catch (e) {
          errors.push(`No se pudo confirmar ${r.record_id}: ${msg(e)}`);
        }
      }
    }),
  );

  return { removed, confirmed, errors };
}

function msg(e: unknown) {
  return e instanceof Error ? e.message : "error";
}

// Group the relationships by their semantic bucket so the UI can render
// "same person" pairs distinctly from "same family" pairs.
export function partitionRelationships(rels: RelationshipSummary[]) {
  const duplicates = rels.filter((r) => r.relationship_type === "proposed_duplicate");
  const family = rels.filter((r) => r.relationship_type === "same_group_or_family");
  const other = rels.filter(
    (r) =>
      r.relationship_type !== "proposed_duplicate" &&
      r.relationship_type !== "same_group_or_family",
  );
  return { duplicates, family, other };
}
