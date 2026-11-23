import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SIGNED_URL_TTL_SECONDS = 300; // 5 minutos (Decisión 4)
const MAX_BATCH_SIZE = 25;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AttachmentRow {
  id: string;
  target_type: string;
  target_id: string | null;
  storage_owner_id: string;
  provider: string;
  storage_bucket: string | null;
  storage_path: string | null;
  availability: string;
  unavailable_reason: string | null;
  mime_type: string;
  size_bytes: number | null;
  checksum_sha256: string | null;
  deleted_at: string | null;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Validar JWT en servidor
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    // 2. Normalizar solicitud individual o por lote
    const body = await req.json().catch(() => null);
    const isBatch = Array.isArray(body?.attachment_ids);
    const rawIds: string[] = isBatch
      ? body.attachment_ids.filter((x: unknown): x is string => typeof x === "string")
      : typeof body?.attachment_id === "string"
        ? [body.attachment_id]
        : [];

    const uniqueIds = Array.from(new Set(rawIds.map((id) => id.trim()).filter((id) => UUID_RE.test(id))));
    if (uniqueIds.length === 0 || uniqueIds.length > MAX_BATCH_SIZE) {
      return jsonResponse(
        {
          error: `Provide a valid 'attachment_id' UUID or 'attachment_ids' array (1..${MAX_BATCH_SIZE})`,
        },
        400,
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 3. Cargar metadatos de los adjuntos solicitados
    const { data: rows, error: dbErr } = await adminClient
      .from("attachments")
      .select(
        "id, target_type, target_id, storage_owner_id, provider, storage_bucket, storage_path, availability, unavailable_reason, mime_type, size_bytes, checksum_sha256, deleted_at",
      )
      .in("id", uniqueIds);

    if (dbErr) {
      console.error("[attachment-signed-url] db error:", dbErr.message);
      return jsonResponse({ error: "Failed to load attachments" }, 500);
    }

    const byId = new Map<string, AttachmentRow>();
    for (const r of (rows ?? []) as AttachmentRow[]) {
      byId.set(r.id, r);
    }

    // 4. Autorización explícita deduplicada por (target_type, target_id) (§10.2)
    const targetAuthCache = new Map<string, boolean>();
    async function canReadAttachment(att: AttachmentRow): Promise<boolean> {
      if (att.deleted_at !== null || att.availability === "pending_upload") {
        return false;
      }
      if (att.storage_owner_id === userId) {
        return true;
      }
      if (!att.target_id || att.target_type === "legacy_unlinked") {
        return false;
      }
      const cacheKey = `${att.target_type}:${att.target_id}`;
      if (targetAuthCache.has(cacheKey)) {
        return targetAuthCache.get(cacheKey)!;
      }
      const { data: allowed, error: rpcErr } = await adminClient.rpc(
        "can_read_attachment_target",
        {
          p_target_type: att.target_type,
          p_target_id: att.target_id,
          p_user_id: userId,
        },
      );
      const ok = !rpcErr && Boolean(allowed);
      targetAuthCache.set(cacheKey, ok);
      return ok;
    }

    // 5. Clasificar elegibles para firma por bucket
    const results: Record<string, Record<string, unknown>> = {};
    const toSignByBucket = new Map<string, AttachmentRow[]>();

    for (const id of uniqueIds) {
      const att = byId.get(id);
      if (!att) {
        results[id] = { ok: false, status: 404, error: "Resource not found" };
        continue;
      }

      const authorized = await canReadAttachment(att);
      if (!authorized) {
        // Error uniforme 404 para no filtrar existencia de entidades ajenas (§10.2)
        results[id] = { ok: false, status: 404, error: "Resource not found" };
        continue;
      }

      if (att.availability === "unavailable") {
        results[id] = {
          ok: false,
          status: 409,
          error: "Attachment unavailable",
          unavailable_reason: att.unavailable_reason,
        };
        continue;
      }

      if (att.availability !== "available") {
        results[id] = {
          ok: false,
          status: 409,
          error: `Attachment is not available (${att.availability})`,
        };
        continue;
      }

      if (att.provider !== "supabase") {
        results[id] = {
          ok: false,
          status: 422,
          code: "USE_DRIVE_PROXY",
          provider: att.provider,
          error: "Non-Supabase attachments must be fetched via drive-proxy",
        };
        continue;
      }

      if (!att.storage_bucket || !att.storage_path) {
        results[id] = { ok: false, status: 500, error: "Corrupted storage reference" };
        continue;
      }

      const list = toSignByBucket.get(att.storage_bucket) ?? [];
      list.push(att);
      toSignByBucket.set(att.storage_bucket, list);
    }

    // 6. Emitir URLs firmadas (TTL 5 min) en lote por bucket
    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();

    for (const [bucket, bucketAtts] of toSignByBucket.entries()) {
      const paths = bucketAtts.map((a) => a.storage_path!);
      const { data: signedList, error: signErr } = await adminClient.storage
        .from(bucket)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

      if (signErr || !signedList) {
        console.error("[attachment-signed-url] sign error:", signErr?.message);
        for (const a of bucketAtts) {
          results[a.id] = { ok: false, status: 500, error: "Failed to generate signed URL" };
        }
        continue;
      }

      const signedByPath = new Map<string, string>();
      for (const item of signedList) {
        if (item.path && item.signedUrl && !item.error) {
          signedByPath.set(item.path, item.signedUrl);
        }
      }

      for (const a of bucketAtts) {
        const signedUrl = signedByPath.get(a.storage_path!);
        if (!signedUrl) {
          results[a.id] = { ok: false, status: 404, error: "Storage object missing" };
          continue;
        }
        results[a.id] = {
          ok: true,
          status: 200,
          attachment_id: a.id,
          signed_url: signedUrl,
          expires_in: SIGNED_URL_TTL_SECONDS,
          expires_at: expiresAt,
          mime_type: a.mime_type,
          size_bytes: a.size_bytes,
          checksum_sha256: a.checksum_sha256,
        };
      }
    }

    // 7. Responder en formato individual o batch según lo solicitado
    if (!isBatch) {
      const single = results[uniqueIds[0]];
      const status = typeof single?.status === "number" ? single.status : 500;
      return jsonResponse(single, status);
    }

    return jsonResponse({ ok: true, results }, 200);
  } catch (err) {
    console.error("[attachment-signed-url] unexpected error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
