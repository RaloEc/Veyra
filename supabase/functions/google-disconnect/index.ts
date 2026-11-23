import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { revokeGoogleTokenBestEffort } from "../_shared/google-oauth.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface DisconnectRpcRow {
  integration_id: string;
  old_refresh_token: string | null;
  affected_attachments: number;
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

    // 2. Desconectar en BD, eliminar secreto de Vault y marcar adjuntos como drive_disconnected
    const { data: rows, error: rpcErr } = await adminClient.rpc(
      "rpc_disconnect_google_integration",
      { p_user_id: userId },
    );

    if (rpcErr) {
      console.error("[google-disconnect] rpc error:", rpcErr.message);
      return jsonResponse({ error: "Failed to disconnect Google Drive integration" }, 500);
    }

    const row = (rows?.[0] ?? null) as DisconnectRpcRow | null;
    if (!row) {
      return jsonResponse({
        ok: true,
        disconnected: false,
        already_disconnected: true,
        integration_id: null,
        affected_attachments: 0,
        revocation_attempted: false,
      });
    }

    // 3. Revocar refresh_token en Google (best-effort; nunca exponer el token al cliente)
    const hasOldToken = Boolean(row.old_refresh_token);
    if (row.old_refresh_token) {
      await revokeGoogleTokenBestEffort(row.old_refresh_token);
    }

    return jsonResponse({
      ok: true,
      disconnected: true,
      already_disconnected: false,
      integration_id: row.integration_id,
      affected_attachments: row.affected_attachments ?? 0,
      revocation_attempted: hasOldToken,
    });
  } catch (err) {
    console.error("[google-disconnect] unexpected error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
