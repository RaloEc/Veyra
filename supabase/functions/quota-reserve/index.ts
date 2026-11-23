import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET_ID = "veyra-attachments";
const TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024; // 6 MiB (requisito TUS Supabase)
const VALID_TARGET_TYPES = new Set(["note", "reminder", "event"]);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

function sanitizeFilename(rawName: string): string {
  const base = rawName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[/\\]+/g, "_")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/\.{2,}/g, ".");

  if (!base || base === ".") return "file.bin";
  if (base.length <= 80) return base;

  const dotIdx = base.lastIndexOf(".");
  if (dotIdx > 0 && base.length - dotIdx <= 12) {
    const ext = base.slice(dotIdx);
    const stem = base.slice(0, 80 - ext.length);
    return `${stem}${ext}`;
  }
  return base.slice(0, 80);
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

    // 1. Validar JWT en servidor (nunca confiar en user_id del body)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    // 2. Validar payload de entrada
    const body = await req.json().catch(() => null);
    const targetType = typeof body?.target_type === "string" ? body.target_type.trim() : "";
    const targetId = typeof body?.target_id === "string" ? body.target_id.trim() : "";
    const rawName = typeof body?.name === "string" ? body.name.trim() : "";
    const mimeType = typeof body?.mime_type === "string"
      ? body.mime_type.trim().toLowerCase().replace("image/jpg", "image/jpeg")
      : "";
    const sizeBytes = Number(body?.size_bytes);

    if (
      !VALID_TARGET_TYPES.has(targetType) ||
      !targetId ||
      !rawName ||
      !mimeType ||
      !Number.isInteger(sizeBytes) ||
      sizeBytes <= 0
    ) {
      return jsonResponse(
        {
          error: "Invalid request payload",
          required: {
            target_type: "note | reminder | event",
            target_id: "string",
            name: "string",
            mime_type: "string",
            size_bytes: "positive integer",
          },
        },
        400,
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 3. Autorización explícita sobre la entidad destino (404 uniforme si no tiene permiso de edición)
    const { data: canEdit, error: authzErr } = await adminClient.rpc(
      "can_edit_attachment_target",
      {
        p_target_type: targetType,
        p_target_id: targetId,
        p_user_id: userId,
      },
    );
    if (authzErr) {
      console.error("[quota-reserve] authz error:", authzErr.message);
      return jsonResponse({ error: "Authorization check failed" }, 500);
    }
    if (!canEdit) {
      return jsonResponse({ error: "Resource not found" }, 404);
    }

    // 4. Reserva atómica en Postgres (con bloqueo FOR UPDATE sobre storage_usage)
    const sanitizedName = sanitizeFilename(rawName);
    const { data: rows, error: rpcErr } = await adminClient.rpc("rpc_reserve_upload_quota", {
      p_owner_id: userId,
      p_target_type: targetType,
      p_target_id: targetId,
      p_bucket_id: BUCKET_ID,
      p_original_name: rawName.slice(0, 255),
      p_sanitized_name: sanitizedName,
      p_mime_type: mimeType,
      p_size_bytes: sizeBytes,
    });

    if (rpcErr) {
      const msg = rpcErr.message || "";
      if (msg.startsWith("QUOTA_EXCEEDED:")) {
        const [, remaining, total] = msg.split(":");
        return jsonResponse(
          {
            error: "Storage quota exceeded",
            code: "QUOTA_EXCEEDED",
            remaining_bytes: Number(remaining),
            quota_bytes: Number(total),
          },
          413,
        );
      }
      if (msg.startsWith("FILE_TOO_LARGE:")) {
        const [, maxFile] = msg.split(":");
        return jsonResponse(
          {
            error: "File exceeds plan limit",
            code: "FILE_TOO_LARGE",
            max_file_bytes: Number(maxFile),
          },
          413,
        );
      }
      if (msg.startsWith("UNSUPPORTED_MIME:")) {
        return jsonResponse(
          { error: "Unsupported MIME type", code: "UNSUPPORTED_MIME", mime_type: mimeType },
          415,
        );
      }
      if (msg.startsWith("TOO_MANY_RESERVATIONS:")) {
        return jsonResponse(
          { error: "Too many active upload reservations", code: "TOO_MANY_RESERVATIONS" },
          429,
        );
      }

      console.error("[quota-reserve] rpc error:", msg);
      return jsonResponse({ error: "Could not reserve quota" }, 500);
    }

    const reservation = Array.isArray(rows) ? rows[0] : rows;
    return jsonResponse(
      {
        reservation_id: reservation.reservation_id,
        attachment_id: reservation.attachment_id,
        bucket_id: reservation.bucket_id,
        storage_path: reservation.storage_path,
        max_bytes: reservation.max_bytes,
        expires_at: reservation.expires_at,
        remaining_bytes: reservation.remaining_bytes,
        plan_code: reservation.plan_code,
        upload_protocol: sizeBytes > TUS_CHUNK_SIZE_BYTES ? "tus" : "standard",
        tus_chunk_size: TUS_CHUNK_SIZE_BYTES,
      },
      201,
    );
  } catch (err) {
    console.error("[quota-reserve] unexpected error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
