import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  GOOGLE_DRIVE_ABOUT_URL,
  GOOGLE_TOKEN_URL,
  REQUIRED_DRIVE_SCOPE,
  revokeGoogleTokenBestEffort,
} from "../_shared/google-oauth.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ClientKind = "web" | "android_server_auth" | "ios_public";

interface ConnectRequestBody {
  client_kind: ClientKind;
  code?: string;
  serverAuthCode?: string;
  redirect_uri?: string;
  code_verifier?: string;
  confirm_account_switch?: boolean;
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

function parseAllowlist(envValue: string | undefined): Set<string> {
  return new Set(
    (envValue ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
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

    // 2. Validar payload y construir intercambio según client_kind (§4.2)
    const body = (await req.json().catch(() => null)) as ConnectRequestBody | null;
    if (!body || !["web", "android_server_auth", "ios_public"].includes(body.client_kind)) {
      return jsonResponse({ error: "Invalid client_kind" }, 400);
    }

    const authCode = (body.serverAuthCode ?? body.code ?? "").trim();
    if (!authCode) {
      return jsonResponse({ error: "Missing authorization code" }, 400);
    }

    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code: authCode,
    });

    let oauthClientId = "";

    if (body.client_kind === "web") {
      oauthClientId = Deno.env.get("GOOGLE_WEB_CLIENT_ID") ?? "";
      const webSecret = Deno.env.get("GOOGLE_WEB_CLIENT_SECRET") ?? "";
      const allowedRedirects = parseAllowlist(Deno.env.get("GOOGLE_ALLOWED_REDIRECT_URIS"));
      const redirectUri = (body.redirect_uri ?? "").trim();

      if (!oauthClientId || !webSecret) {
        return jsonResponse({ error: "Google Web OAuth is not configured on server" }, 500);
      }
      if (!redirectUri || !allowedRedirects.has(redirectUri)) {
        return jsonResponse({ error: "Invalid or disallowed redirect_uri" }, 400);
      }

      tokenParams.set("client_id", oauthClientId);
      tokenParams.set("client_secret", webSecret);
      tokenParams.set("redirect_uri", redirectUri);
      if (body.code_verifier?.trim()) {
        tokenParams.set("code_verifier", body.code_verifier.trim());
      }
    } else if (body.client_kind === "android_server_auth") {
      // Validado empíricamente en Fase 0B (PoC P4):
      // Web client_id + client_secret + redirect_uri="" explícito
      oauthClientId = Deno.env.get("GOOGLE_WEB_CLIENT_ID") ?? "";
      const webSecret = Deno.env.get("GOOGLE_WEB_CLIENT_SECRET") ?? "";
      if (!oauthClientId || !webSecret) {
        return jsonResponse({ error: "Google Web OAuth is not configured on server" }, 500);
      }

      tokenParams.set("client_id", oauthClientId);
      tokenParams.set("client_secret", webSecret);
      tokenParams.set("redirect_uri", body.redirect_uri ?? "");
    } else {
      // ios_public: cliente nativo público con PKCE obligatorio y sin client_secret
      oauthClientId = Deno.env.get("GOOGLE_IOS_CLIENT_ID") ?? "";
      const allowedIosRedirects = parseAllowlist(Deno.env.get("GOOGLE_IOS_ALLOWED_REDIRECT_URIS"));
      const redirectUri = (body.redirect_uri ?? "").trim();
      const codeVerifier = (body.code_verifier ?? "").trim();

      if (!oauthClientId) {
        return jsonResponse({ error: "Google iOS OAuth is not configured on server" }, 500);
      }
      if (!redirectUri || !allowedIosRedirects.has(redirectUri) || !codeVerifier) {
        return jsonResponse({ error: "Missing PKCE code_verifier or invalid redirect_uri" }, 400);
      }

      tokenParams.set("client_id", oauthClientId);
      tokenParams.set("redirect_uri", redirectUri);
      tokenParams.set("code_verifier", codeVerifier);
    }

    // 3. Canjear código en Google OAuth
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams,
    });
    const tokenJson = await tokenRes.json().catch(() => ({}));

    if (!tokenRes.ok || !tokenJson.access_token) {
      console.error("[google-connect] token exchange failed:", tokenJson?.error ?? tokenRes.status);
      return jsonResponse(
        {
          error: "Google token exchange failed",
          code: tokenJson?.error ?? "TOKEN_EXCHANGE_FAILED",
        },
        400,
      );
    }

    const grantedScopes = String(tokenJson.scope ?? "")
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!grantedScopes.includes(REQUIRED_DRIVE_SCOPE)) {
      await revokeGoogleTokenBestEffort(tokenJson.refresh_token ?? tokenJson.access_token);
      return jsonResponse(
        { error: "Required drive.file scope was not granted", code: "MISSING_DRIVE_SCOPE" },
        400,
      );
    }

    // 4. Obtener identidad inmutable de Drive (funciona solo con drive.file, sin openid/email)
    const aboutRes = await fetch(GOOGLE_DRIVE_ABOUT_URL, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const aboutJson = await aboutRes.json().catch(() => null);
    const googleSub: string | undefined = aboutJson?.user?.permissionId;
    const googleEmail: string | null = aboutJson?.user?.emailAddress ?? null;

    if (!aboutRes.ok || !googleSub) {
      await revokeGoogleTokenBestEffort(tokenJson.refresh_token ?? tokenJson.access_token);
      return jsonResponse({ error: "Failed to resolve Google Drive account identity" }, 502);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 5. Verificar cambio de cuenta antes de sobreescribir (§9.5 #4)
    const { data: existingInt } = await adminClient
      .from("user_integrations")
      .select("id, google_sub, google_email, refresh_token_secret_id, status")
      .eq("user_id", userId)
      .eq("provider", "google_drive")
      .maybeSingle();

    const isAccountSwitch = Boolean(existingInt && existingInt.google_sub !== googleSub);
    let previousRefreshToken: string | null = null;

    if (isAccountSwitch && existingInt) {
      const { count: activeDriveAttachments } = await adminClient
        .from("attachments")
        .select("id", { count: "exact", head: true })
        .eq("integration_id", existingInt.id)
        .eq("provider", "google_drive")
        .is("deleted_at", null);

      if ((activeDriveAttachments ?? 0) > 0 && !body.confirm_account_switch) {
        // Evitar refresh_token huérfano en Google si el usuario aún no confirmó el cambio
        await revokeGoogleTokenBestEffort(tokenJson.refresh_token ?? tokenJson.access_token);
        return jsonResponse(
          {
            error: "Switching Google Drive account will mark existing Drive attachments as unavailable",
            code: "ACCOUNT_SWITCH_REQUIRES_CONFIRMATION",
            current_email: existingInt.google_email,
            new_email: googleEmail,
            affected_attachments: activeDriveAttachments ?? 0,
          },
          409,
        );
      }

      // Guardamos referencia al token anterior para revocarlo tras persistir el nuevo
      if (existingInt.refresh_token_secret_id) {
        const { data: oldSecretRows } = await adminClient.rpc("rpc_get_google_refresh_token", {
          p_integration_id: existingInt.id,
        });
        previousRefreshToken = oldSecretRows?.[0]?.refresh_token ?? null;
      }
    }

    const newRefreshToken: string | null =
      typeof tokenJson.refresh_token === "string" && tokenJson.refresh_token.length > 0
        ? tokenJson.refresh_token
        : null;

    if (!newRefreshToken && (!existingInt || isAccountSwitch || !existingInt.refresh_token_secret_id)) {
      return jsonResponse(
        {
          error: "Google did not return a refresh_token; re-authorize with consent prompt",
          code: "REFRESH_TOKEN_MISSING",
        },
        400,
      );
    }

    // 6. Persistir cifrado en Vault vía RPC atómica
    const { data: upsertRows, error: upsertErr } = await adminClient.rpc(
      "rpc_upsert_google_integration",
      {
        p_user_id: userId,
        p_google_sub: googleSub,
        p_google_email: googleEmail,
        p_oauth_client_kind: body.client_kind,
        p_oauth_client_id: oauthClientId,
        p_refresh_token: newRefreshToken,
        p_scopes: grantedScopes,
        p_mark_account_changed: isAccountSwitch,
      },
    );

    if (upsertErr || !upsertRows?.[0]) {
      console.error("[google-connect] upsert error:", upsertErr?.message);
      await revokeGoogleTokenBestEffort(newRefreshToken);
      return jsonResponse({ error: "Failed to store Google Drive integration" }, 500);
    }

    // Revocar el refresh_token anterior (best-effort) si hubo cambio de cuenta
    if (isAccountSwitch && previousRefreshToken) {
      await revokeGoogleTokenBestEffort(previousRefreshToken);
    }

    const result = upsertRows[0];

    // 7. Responder solo metadatos seguros (jamás devolver tokens ni secret_id)
    return jsonResponse({
      integration_id: result.integration_id,
      provider: "google_drive",
      google_email: googleEmail,
      status: result.status,
      scopes: grantedScopes,
      account_switched: result.account_switched,
      recovered_attachments: result.recovered_attachments,
      affected_attachments: result.affected_attachments,
    });
  } catch (err) {
    console.error("[google-connect] unexpected error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
