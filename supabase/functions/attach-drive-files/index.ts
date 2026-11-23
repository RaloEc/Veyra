import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { DriveAuthError, getFreshDriveAccessToken } from "../_shared/google-oauth.ts";

const VALID_TARGET_TYPES = new Set(["note", "reminder", "event"]);
const DRIVE_FILE_ID_RE = /^[a-zA-Z0-9_-]{5,128}$/;
const MAX_FILES_PER_REQUEST = 25;

const ATTACHMENT_SELECT_COLS =
  "id, target_type, target_id, provider, drive_file_id, integration_id, name, mime_type, size_bytes, drive_md5, drive_modified_time, availability, unavailable_reason, last_verified_at, created_at, updated_at";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AttachDriveFilesBody {
  target_type?: string;
  target_id?: string;
  note_id?: string;
  reminder_id?: string;
  event_id?: string;
  file_ids?: unknown;
}

interface DriveFileMetadata {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string | number;
  md5Checksum?: string;
  modifiedTime?: string;
  trashed?: boolean;
  capabilities?: {
    canDownload?: boolean;
  };
}

interface PerFileError {
  file_id: string;
  code: string;
  status: number;
  error: string;
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

function resolveTarget(body: AttachDriveFilesBody | null): {
  targetType: string;
  targetId: string;
} | null {
  if (!body) return null;

  if (typeof body.target_type === "string" && typeof body.target_id === "string") {
    const targetType = body.target_type.trim();
    const targetId = body.target_id.trim();
    if (VALID_TARGET_TYPES.has(targetType) && targetId.length > 0) {
      return { targetType, targetId };
    }
    return null;
  }

  if (typeof body.note_id === "string" && body.note_id.trim()) {
    return { targetType: "note", targetId: body.note_id.trim() };
  }
  if (typeof body.reminder_id === "string" && body.reminder_id.trim()) {
    return { targetType: "reminder", targetId: body.reminder_id.trim() };
  }
  if (typeof body.event_id === "string" && body.event_id.trim()) {
    return { targetType: "event", targetId: body.event_id.trim() };
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // 1. Validar JWT del usuario autenticado
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return jsonResponse({ error: "Unauthorized" }, 401);
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

    // 2. Parsear y validar destino polimórfico + lista de file_ids
    const body = (await req.json().catch(() => null)) as AttachDriveFilesBody | null;
    const target = resolveTarget(body);
    if (!target) {
      return jsonResponse(
        {
          error:
            "Provide valid (target_type, target_id) or note_id / reminder_id / event_id",
        },
        400,
      );
    }

    const rawFileIds = Array.isArray(body?.file_ids) ? body.file_ids : [];
    const seen = new Set<string>();
    const uniqueFileIds: string[] = [];
    for (const item of rawFileIds) {
      if (typeof item !== "string") continue;
      const trimmed = item.trim();
      if (!DRIVE_FILE_ID_RE.test(trimmed) || seen.has(trimmed)) continue;
      seen.add(trimmed);
      uniqueFileIds.push(trimmed);
    }

    if (uniqueFileIds.length === 0 || uniqueFileIds.length > MAX_FILES_PER_REQUEST) {
      return jsonResponse(
        { error: `Provide between 1 and ${MAX_FILES_PER_REQUEST} valid Google Drive file_ids` },
        400,
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 3. Autorizar edición del destino (§10.2: 404 uniforme si no tiene permiso o no existe)
    const { data: canEdit, error: authRpcErr } = await adminClient.rpc(
      "can_edit_attachment_target",
      {
        p_target_type: target.targetType,
        p_target_id: target.targetId,
        p_user_id: userId,
      },
    );

    if (authRpcErr || !canEdit) {
      return jsonResponse({ error: "Resource not found" }, 404);
    }

    // 4. Comprobar habilitación por plan en storage_plans
    const { data: profileRow } = await adminClient
      .from("profiles")
      .select("is_premium")
      .eq("id", userId)
      .maybeSingle();

    const planCode = profileRow?.is_premium ? "premium" : "free";
    const { data: planRow } = await adminClient
      .from("storage_plans")
      .select("drive_attach_enabled")
      .eq("plan_code", planCode)
      .maybeSingle();

    if (planRow && planRow.drive_attach_enabled === false) {
      return jsonResponse(
        {
          error: "Google Drive attachments are disabled for your plan",
          code: "DRIVE_ATTACH_DISABLED",
        },
        403,
      );
    }

    // 5. Verificar integración activa de Google Drive del usuario
    const { data: integration, error: intErr } = await adminClient
      .from("user_integrations")
      .select("id, status, google_sub")
      .eq("user_id", userId)
      .eq("provider", "google_drive")
      .maybeSingle();

    if (intErr) {
      console.error("[attach-drive-files] integration load error:", intErr.message);
      return jsonResponse({ error: "Failed to load Google Drive integration" }, 500);
    }

    if (!integration) {
      return jsonResponse(
        { error: "Google Drive is not connected", code: "DRIVE_NOT_CONNECTED" },
        404,
      );
    }

    if (integration.status === "disconnected") {
      return jsonResponse(
        {
          error: "Google Drive integration is disconnected",
          code: "INTEGRATION_DISCONNECTED",
          unavailable_reason: "drive_disconnected",
        },
        410,
      );
    }

    if (integration.status === "needs_reauth" || integration.status === "revoked") {
      return jsonResponse(
        {
          error: "Google Drive authorization requires re-authentication",
          code: "NEEDS_REAUTH",
          unavailable_reason:
            integration.status === "revoked" ? "permission_revoked" : "needs_reauth",
        },
        424,
      );
    }

    // 6. Obtener access_token efímero en memoria vía Vault
    let tokenData;
    try {
      tokenData = await getFreshDriveAccessToken(adminClient, integration.id);
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

    let currentAccessToken = tokenData.accessToken;
    const attachments: Record<string, unknown>[] = [];
    const errors: PerFileError[] = [];

    // 7. Consultar metadatos reales directamente a Google Drive API (nunca confiar en el cliente)
    for (const fileId of uniqueFileIds) {
      const metaUrl =
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,md5Checksum,modifiedTime,trashed,capabilities(canDownload)&supportsAllDrives=false`;

      let metaRes = await fetch(metaUrl, {
        headers: { Authorization: `Bearer ${currentAccessToken}` },
      });

      if (metaRes.status === 401) {
        await metaRes.body?.cancel().catch(() => undefined);
        try {
          tokenData = await getFreshDriveAccessToken(adminClient, integration.id);
          currentAccessToken = tokenData.accessToken;
          metaRes = await fetch(metaUrl, {
            headers: { Authorization: `Bearer ${currentAccessToken}` },
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

        if (metaRes.status === 401) {
          await metaRes.body?.cancel().catch(() => undefined);
          await adminClient
            .rpc("rpc_mark_google_integration_status", {
              p_integration_id: integration.id,
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

      if (!metaRes.ok) {
        await metaRes.body?.cancel().catch(() => undefined);
        errors.push({
          file_id: fileId,
          code: metaRes.status === 404
            ? "FILE_NOT_FOUND"
            : metaRes.status === 403
              ? "FILE_NOT_ACCESSIBLE"
              : "DRIVE_API_ERROR",
          status: metaRes.status,
          error: "Could not read file metadata from Google Drive",
        });
        continue;
      }

      const meta = (await metaRes.json().catch(() => null)) as DriveFileMetadata | null;
      if (!meta) {
        errors.push({
          file_id: fileId,
          code: "DRIVE_API_ERROR",
          status: 502,
          error: "Invalid metadata response from Google Drive",
        });
        continue;
      }

      if (meta.trashed === true) {
        errors.push({
          file_id: fileId,
          code: "FILE_TRASHED",
          status: 422,
          error: "File is in Google Drive trash",
        });
        continue;
      }

      if (meta.mimeType === "application/vnd.google-apps.folder") {
        errors.push({
          file_id: fileId,
          code: "FOLDER_NOT_SUPPORTED",
          status: 422,
          error: "Folders cannot be attached",
        });
        continue;
      }

      // Plan v3.1 §6.4 / D7: archivos nativos Google (Docs/Sheets/Slides) no soportados en v1
      if (typeof meta.mimeType === "string" && meta.mimeType.startsWith("application/vnd.google-apps.")) {
        errors.push({
          file_id: fileId,
          code: "GOOGLE_NATIVE_FILE_NOT_SUPPORTED",
          status: 422,
          error: "Google Docs/Sheets/Slides native files are not supported",
        });
        continue;
      }

      if (meta.capabilities?.canDownload === false) {
        errors.push({
          file_id: fileId,
          code: "FILE_NOT_DOWNLOADABLE",
          status: 403,
          error: "File cannot be downloaded from Google Drive",
        });
        continue;
      }

      const canonicalFileId =
        typeof meta.id === "string" && meta.id.trim().length > 0 ? meta.id.trim() : fileId;
      const verifiedName =
        typeof meta.name === "string" && meta.name.trim().length > 0
          ? meta.name.trim()
          : canonicalFileId;
      const verifiedMime =
        typeof meta.mimeType === "string" && meta.mimeType.trim().length > 0
          ? meta.mimeType.trim()
          : "application/octet-stream";
      const parsedSize =
        meta.size !== undefined && meta.size !== null && meta.size !== ""
          ? Number(meta.size)
          : null;
      const verifiedSizeBytes =
        parsedSize !== null && Number.isFinite(parsedSize) && parsedSize >= 0
          ? Math.trunc(parsedSize)
          : null;
      const driveMd5 =
        typeof meta.md5Checksum === "string" && meta.md5Checksum.length > 0
          ? meta.md5Checksum
          : null;
      const driveModifiedTime =
        typeof meta.modifiedTime === "string" && meta.modifiedTime.length > 0
          ? meta.modifiedTime
          : null;
      const nowIso = new Date().toISOString();

      // 8. Inserción/actualización idempotente respecto a uq_attachments_drive_target
      const { data: existingRow } = await adminClient
        .from("attachments")
        .select("id")
        .eq("target_type", target.targetType)
        .eq("target_id", target.targetId)
        .eq("drive_file_id", canonicalFileId)
        .eq("integration_id", integration.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (existingRow) {
        const { data: updated, error: updErr } = await adminClient
          .from("attachments")
          .update({
            name: verifiedName,
            mime_type: verifiedMime,
            size_bytes: verifiedSizeBytes,
            drive_md5: driveMd5,
            drive_modified_time: driveModifiedTime,
            availability: "available",
            unavailable_reason: null,
            unavailable_since: null,
            last_verified_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", existingRow.id)
          .select(ATTACHMENT_SELECT_COLS)
          .single();

        if (updErr || !updated) {
          console.error("[attach-drive-files] update error:", updErr?.message);
          errors.push({
            file_id: fileId,
            code: "DB_ERROR",
            status: 500,
            error: "Failed to update existing attachment",
          });
          continue;
        }

        attachments.push({ ...updated, already_attached: true });
        continue;
      }

      const { data: inserted, error: insErr } = await adminClient
        .from("attachments")
        .insert({
          target_type: target.targetType,
          target_id: target.targetId,
          created_by: userId,
          storage_owner_id: userId,
          provider: "google_drive",
          storage_bucket: null,
          storage_path: null,
          drive_file_id: canonicalFileId,
          integration_id: integration.id,
          drive_account_sub: tokenData.googleSub,
          name: verifiedName,
          mime_type: verifiedMime,
          size_bytes: verifiedSizeBytes,
          drive_md5: driveMd5,
          drive_modified_time: driveModifiedTime,
          availability: "available",
          unavailable_reason: null,
          unavailable_since: null,
          last_verified_at: nowIso,
          metadata: { source: "google_picker" },
        })
        .select(ATTACHMENT_SELECT_COLS)
        .single();

      if (insErr) {
        // Condición de carrera contra uq_attachments_drive_target
        if (insErr.code === "23505") {
          const { data: raceRow } = await adminClient
            .from("attachments")
            .select(ATTACHMENT_SELECT_COLS)
            .eq("target_type", target.targetType)
            .eq("target_id", target.targetId)
            .eq("drive_file_id", canonicalFileId)
            .eq("integration_id", integration.id)
            .is("deleted_at", null)
            .maybeSingle();

          if (raceRow) {
            attachments.push({ ...raceRow, already_attached: true });
            continue;
          }
        }

        console.error("[attach-drive-files] insert error:", insErr.message);
        errors.push({
          file_id: fileId,
          code: "DB_ERROR",
          status: 500,
          error: "Failed to save attachment metadata",
        });
        continue;
      }

      attachments.push({ ...inserted, already_attached: false });
    }

    return jsonResponse(
      {
        ok: attachments.length > 0,
        attachments,
        errors,
      },
      attachments.length > 0 ? 200 : 422,
    );
  } catch (err) {
    console.error("[attach-drive-files] unexpected error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
