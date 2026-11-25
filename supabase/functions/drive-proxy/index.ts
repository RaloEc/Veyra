import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { DriveAuthError, getFreshDriveAccessToken } from "../_shared/google-oauth.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RATE_LIMIT_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "downloadQuotaExceeded",
]);

const SAFE_INLINE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
  "video/mp4",
  "video/webm",
]);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, range, if-none-match",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Expose-Headers":
    "content-length, content-range, accept-ranges, etag, content-disposition",
};

interface AttachmentRow {
  id: string;
  target_type: string;
  target_id: string | null;
  storage_owner_id: string;
  provider: string;
  drive_file_id: string | null;
  integration_id: string | null;
  name: string;
  mime_type: string;
  availability: string;
  unavailable_reason: string | null;
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

function extractAttachmentId(url: URL): string {
  const fromQuery = url.searchParams.get("attachment_id")?.trim();
  if (fromQuery) return fromQuery;

  const segments = url.pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  return UUID_RE.test(last) ? last : "";
}

function buildContentDisposition(rawName: string, dispositionType: "inline" | "attachment"): string {
  const cleaned = (rawName || "attachment")
    .replace(/[\r\n\x00-\x1f\x7f]/g, "_")
    .replace(/["\\]/g, "_")
    .trim() || "attachment";
  const asciiFallback = cleaned.replace(/[^\x20-\x7e]/g, "_") || "attachment";
  const encoded = encodeURIComponent(cleaned).replace(
    /['()*!]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${dispositionType}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // 1. Validar JWT del usuario autenticado
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const url = new URL(req.url);
    const attachmentId = extractAttachmentId(url);
    if (!UUID_RE.test(attachmentId)) {
      return jsonResponse({ error: "Provide a valid attachment_id UUID" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 2. Cargar metadatos del adjunto
    const { data: attRow, error: dbErr } = await adminClient
      .from("attachments")
      .select(
        "id, target_type, target_id, storage_owner_id, provider, drive_file_id, integration_id, name, mime_type, availability, unavailable_reason, deleted_at",
      )
      .eq("id", attachmentId)
      .maybeSingle();

    if (dbErr) {
      console.error("[drive-proxy] db error:", dbErr.message);
      return jsonResponse({ error: "Failed to load attachment" }, 500);
    }

    const att = attRow as AttachmentRow | null;

    // 3. Autorización uniforme 404 para no filtrar existencia (§10.2)
    let authorized = false;
    if (att && att.deleted_at === null && att.availability !== "pending_upload") {
      if (att.storage_owner_id === userId) {
        authorized = true;
      } else if (att.target_id && att.target_type !== "legacy_unlinked") {
        const { data: allowed, error: rpcErr } = await adminClient.rpc(
          "can_read_attachment_target",
          {
            p_target_type: att.target_type,
            p_target_id: att.target_id,
            p_user_id: userId,
          },
        );
        authorized = !rpcErr && Boolean(allowed);
      }
    }

    if (!att || !authorized) {
      return jsonResponse({ error: "Resource not found" }, 404);
    }

    if (att.provider !== "google_drive") {
      return jsonResponse(
        {
          error: "Non-Drive attachments must be fetched via attachment-signed-url",
          code: "USE_SIGNED_URL",
          provider: att.provider,
        },
        422,
      );
    }

    if (att.availability === "unavailable") {
      return jsonResponse(
        {
          error: "Attachment unavailable",
          code: "ATTACHMENT_UNAVAILABLE",
          unavailable_reason: att.unavailable_reason,
        },
        410,
      );
    }

    if (att.availability !== "available") {
      return jsonResponse(
        { error: `Attachment is not available (${att.availability})` },
        409,
      );
    }

    if (!att.drive_file_id || !att.integration_id) {
      return jsonResponse({ error: "Corrupted Google Drive attachment reference" }, 500);
    }

    // 4. Obtener access_token efímero de la integración del propietario (permite lectura a colaboradores)
    let tokenData;
    try {
      tokenData = await getFreshDriveAccessToken(adminClient, att.integration_id);
      if (tokenData.userId !== att.storage_owner_id) {
        return jsonResponse({ error: "Resource not found" }, 404);
      }
    } catch (err) {
      if (err instanceof DriveAuthError) {
        return jsonResponse(
          {
            error: err.message,
            code: err.code,
            unavailable_reason: err.unavailableReason ?? null,
          },
          err.status,
        );
      }
      throw err;
    }

    const driveMediaUrl =
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(att.drive_file_id)}?alt=media&supportsAllDrives=false`;

    const forwardHeaders = (accessToken: string): Headers => {
      const h = new Headers({
        Authorization: `Bearer ${accessToken}`,
      });
      const range = req.headers.get("Range");
      if (range) h.set("Range", range);
      const ifNoneMatch = req.headers.get("If-None-Match");
      if (ifNoneMatch) h.set("If-None-Match", ifNoneMatch);
      return h;
    };

    const driveMethod = req.method === "HEAD" ? "HEAD" : "GET";
    let driveRes = await fetch(driveMediaUrl, {
      method: driveMethod,
      headers: forwardHeaders(tokenData.accessToken),
    });

    // 5. Reintentar 1 vez ante 401 refrescando el token
    if (driveRes.status === 401) {
      await driveRes.body?.cancel().catch(() => undefined);
      try {
        tokenData = await getFreshDriveAccessToken(adminClient, att.integration_id);
        driveRes = await fetch(driveMediaUrl, {
          method: driveMethod,
          headers: forwardHeaders(tokenData.accessToken),
        });
      } catch (err) {
        if (err instanceof DriveAuthError) {
          return jsonResponse(
            {
              error: err.message,
              code: err.code,
              unavailable_reason: err.unavailableReason ?? null,
            },
            err.status,
          );
        }
        throw err;
      }

      if (driveRes.status === 401) {
        await driveRes.body?.cancel().catch(() => undefined);
        await adminClient
          .rpc("rpc_mark_google_integration_status", {
            p_integration_id: att.integration_id,
            p_status: "needs_reauth",
            p_error_code: "drive_401",
            p_unavailable_reason: "needs_reauth",
          })
          .then(() => undefined, () => undefined);

        return jsonResponse(
          {
            error: "Google Drive authorization expired",
            code: "NEEDS_REAUTH",
            unavailable_reason: "needs_reauth",
          },
          424,
        );
      }
    }

    // 6. Manejo de errores de Drive (404 / 403 / 304 / otros)
    if (driveRes.status === 404) {
      await driveRes.body?.cancel().catch(() => undefined);
      await adminClient
        .from("attachments")
        .update({
          availability: "unavailable",
          unavailable_reason: "file_deleted",
          unavailable_since: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", att.id)
        .then(() => undefined, () => undefined);

      return jsonResponse(
        {
          error: "Drive file not found",
          code: "ATTACHMENT_UNAVAILABLE",
          unavailable_reason: "file_deleted",
        },
        410,
      );
    }

    if (driveRes.status === 403) {
      const errJson = await driveRes.json().catch(() => null);
      const reason = errJson?.error?.errors?.[0]?.reason;
      if (typeof reason === "string" && RATE_LIMIT_REASONS.has(reason)) {
        return jsonResponse(
          { error: "Google Drive rate limit exceeded", code: "RATE_LIMITED" },
          429,
        );
      }

      await adminClient
        .from("attachments")
        .update({
          availability: "unavailable",
          unavailable_reason: "file_inaccessible",
          unavailable_since: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", att.id)
        .then(() => undefined, () => undefined);

      return jsonResponse(
        {
          error: "Drive file inaccessible",
          code: "ATTACHMENT_UNAVAILABLE",
          unavailable_reason: "file_inaccessible",
        },
        410,
      );
    }

    if (driveRes.status === 304) {
      const resHeaders = new Headers(CORS_HEADERS);
      resHeaders.set("Cache-Control", "private, no-store");
      resHeaders.set("Vary", "Authorization, Range");
      const etag = driveRes.headers.get("ETag");
      if (etag) resHeaders.set("ETag", etag);
      return new Response(null, { status: 304, headers: resHeaders });
    }

    if (!driveRes.ok) {
      await driveRes.body?.cancel().catch(() => undefined);
      return jsonResponse(
        { error: "Google Drive upstream error", upstream_status: driveRes.status },
        502,
      );
    }

    // 7. Streaming directo sin buffering en memoria (200 / 206)
    const rawMime = att.mime_type || driveRes.headers.get("Content-Type") || "application/octet-stream";
    const baseMime = rawMime.split(";")[0].trim().toLowerCase();
    const requestedDisp = url.searchParams.get("disposition")?.toLowerCase();
    const canInline = requestedDisp !== "attachment" && SAFE_INLINE_MIMES.has(baseMime);

    const resHeaders = new Headers(CORS_HEADERS);
    resHeaders.set("Content-Type", rawMime);
    resHeaders.set(
      "Content-Disposition",
      buildContentDisposition(att.name, canInline ? "inline" : "attachment"),
    );
    resHeaders.set("X-Content-Type-Options", "nosniff");
    resHeaders.set("Cache-Control", "private, no-store");
    resHeaders.set("Vary", "Authorization, Range");

    for (const passthrough of ["Content-Length", "Content-Range", "Accept-Ranges", "ETag"]) {
      const value = driveRes.headers.get(passthrough);
      if (value) resHeaders.set(passthrough, value);
    }

    return new Response(driveMethod === "HEAD" ? null : driveRes.body, {
      status: driveRes.status,
      headers: resHeaders,
    });
  } catch (err) {
    console.error("[drive-proxy] unexpected error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
