import { type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_DRIVE_ABOUT_URL =
  "https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress,displayName)";
export const REQUIRED_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export type DriveAuthErrorCode =
  | "INTEGRATION_NOT_FOUND"
  | "INTEGRATION_DISCONNECTED"
  | "NEEDS_REAUTH"
  | "OAUTH_CONFIG_ERROR"
  | "TOKEN_REFRESH_FAILED";

export class DriveAuthError extends Error {
  readonly code: DriveAuthErrorCode;
  readonly status: number;
  readonly unavailableReason?: string;

  constructor(
    code: DriveAuthErrorCode,
    status: number,
    message: string,
    unavailableReason?: string,
  ) {
    super(message);
    this.name = "DriveAuthError";
    this.code = code;
    this.status = status;
    this.unavailableReason = unavailableReason;
  }
}

export interface FreshDriveAccessTokenResult {
  accessToken: string;
  expiresIn: number;
  googleSub: string;
  userId: string;
}

interface RefreshTokenRow {
  integration_id: string;
  user_id: string;
  google_sub: string;
  oauth_client_kind: "web" | "android_server_auth" | "ios_public";
  oauth_client_id: string;
  status: "active" | "needs_reauth" | "revoked" | "disconnected";
  refresh_token: string | null;
}

/**
 * Revoca un token OAuth en Google de forma best-effort sin bloquear el flujo principal.
 */
export async function revokeGoogleTokenBestEffort(
  token: string | null | undefined,
): Promise<void> {
  if (!token) return;
  try {
    await fetch(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  } catch {
    // Best-effort: nunca bloquear la petición por fallos de red al revocar
  }
}

/**
 * Obtiene un access_token efímero en memoria usando el refresh_token cifrado en Vault.
 */
export async function getFreshDriveAccessToken(
  adminClient: SupabaseClient,
  integrationId: string,
): Promise<FreshDriveAccessTokenResult> {
  const { data: rows, error: rpcErr } = await adminClient.rpc(
    "rpc_get_google_refresh_token",
    { p_integration_id: integrationId },
  );

  if (rpcErr || !rows || rows.length === 0) {
    throw new DriveAuthError(
      "INTEGRATION_NOT_FOUND",
      404,
      "Google Drive integration not found",
      "drive_disconnected",
    );
  }

  const row = rows[0] as RefreshTokenRow;

  if (row.status === "disconnected") {
    throw new DriveAuthError(
      "INTEGRATION_DISCONNECTED",
      410,
      "Google Drive integration is disconnected",
      "drive_disconnected",
    );
  }

  if (row.status === "revoked") {
    throw new DriveAuthError(
      "NEEDS_REAUTH",
      424,
      "Google Drive authorization was revoked",
      "permission_revoked",
    );
  }

  if (row.status === "needs_reauth") {
    throw new DriveAuthError(
      "NEEDS_REAUTH",
      424,
      "Google Drive authorization requires re-authentication",
      "needs_reauth",
    );
  }

  if (!row.refresh_token) {
    await adminClient
      .rpc("rpc_mark_google_integration_status", {
        p_integration_id: integrationId,
        p_status: "needs_reauth",
        p_error_code: "refresh_token_missing",
        p_unavailable_reason: "needs_reauth",
      })
      .then(() => undefined, () => undefined);

    throw new DriveAuthError(
      "NEEDS_REAUTH",
      424,
      "Missing refresh token; re-authentication required",
      "needs_reauth",
    );
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: row.oauth_client_id,
    refresh_token: row.refresh_token,
  });

  if (row.oauth_client_kind === "web" || row.oauth_client_kind === "android_server_auth") {
    const webSecret = Deno.env.get("GOOGLE_WEB_CLIENT_SECRET") ?? "";
    if (!webSecret) {
      throw new DriveAuthError(
        "OAUTH_CONFIG_ERROR",
        500,
        "GOOGLE_WEB_CLIENT_SECRET is not configured",
      );
    }
    params.set("client_secret", webSecret);
  } else if (row.oauth_client_kind !== "ios_public") {
    throw new DriveAuthError(
      "OAUTH_CONFIG_ERROR",
      500,
      `Unsupported oauth_client_kind: ${String(row.oauth_client_kind)}`,
    );
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));

  if (!tokenRes.ok || typeof tokenJson?.access_token !== "string" || !tokenJson.access_token) {
    const errCode = typeof tokenJson?.error === "string"
      ? tokenJson.error
      : `http_${tokenRes.status}`;

    if (errCode === "invalid_grant" || errCode === "unauthorized_client") {
      await adminClient
        .rpc("rpc_mark_google_integration_status", {
          p_integration_id: integrationId,
          p_status: "needs_reauth",
          p_error_code: errCode,
          p_unavailable_reason: "needs_reauth",
        })
        .then(() => undefined, () => undefined);

      throw new DriveAuthError(
        "NEEDS_REAUTH",
        424,
        "Google Drive authorization expired or revoked",
        "needs_reauth",
      );
    }

    throw new DriveAuthError(
      "TOKEN_REFRESH_FAILED",
      502,
      `Failed to refresh Google access token (${errCode})`,
      "provider_error",
    );
  }

  // Actualiza last_refreshed_at de forma best-effort sin bloquear el streaming
  await adminClient
    .rpc("rpc_mark_google_integration_status", {
      p_integration_id: integrationId,
      p_status: "active",
      p_error_code: null,
      p_unavailable_reason: null,
    })
    .then(() => undefined, () => undefined);

  return {
    accessToken: tokenJson.access_token,
    expiresIn: Number(tokenJson.expires_in ?? 3600),
    googleSub: row.google_sub,
    userId: row.user_id,
  };
}
