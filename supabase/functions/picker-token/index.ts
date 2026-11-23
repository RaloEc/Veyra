import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { DriveAuthError, getFreshDriveAccessToken } from "../_shared/google-oauth.ts";

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
      Pragma: "no-cache",
      Vary: "Authorization",
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

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 2. Buscar integración Google Drive del usuario
    const { data: integration, error: intErr } = await adminClient
      .from("user_integrations")
      .select("id, status, google_email, scopes")
      .eq("user_id", userId)
      .eq("provider", "google_drive")
      .maybeSingle();

    if (intErr) {
      console.error("[picker-token] db error:", intErr.message);
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

    if (integration.status === "needs_reauth") {
      return jsonResponse(
        {
          error: "Google Drive authorization requires re-authentication",
          code: "NEEDS_REAUTH",
          unavailable_reason: "needs_reauth",
        },
        424,
      );
    }

    if (integration.status === "revoked") {
      return jsonResponse(
        {
          error: "Google Drive authorization was revoked",
          code: "NEEDS_REAUTH",
          unavailable_reason: "permission_revoked",
        },
        424,
      );
    }

    // 3. Refrescar access_token efímero en memoria usando Vault vía RPC segura
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

    const expiresAt = new Date(Date.now() + tokenData.expiresIn * 1000).toISOString();

    return jsonResponse({
      access_token: tokenData.accessToken,
      expires_in: tokenData.expiresIn,
      expires_at: expiresAt,
      integration_id: integration.id,
      google_email: integration.google_email,
      scopes: integration.scopes,
    });
  } catch (err) {
    console.error("[picker-token] unexpected error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
