import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { crypto as stdCrypto } from "jsr:@std/crypto@1";
import { encodeHex } from "jsr:@std/encoding@1/hex";
import { createClient } from "npm:@supabase/supabase-js@2";

const SIGNED_URL_TTL_SECONDS = 300; // 5 minutos (Decisión 4)

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

function sniffMimeFromHeader(header: Uint8Array, declaredMime: string): string {
  const startsWith = (sig: number[], offset = 0) =>
    header.length >= offset + sig.length && sig.every((b, i) => header[offset + i] === b);

  // Rechazar explícitamente HTML/SVG/XML ejecutable camuflado
  const asciiHead = new TextDecoder("utf-8", { fatal: false })
    .decode(header.slice(0, 64))
    .trimStart()
    .toLowerCase();
  if (
    asciiHead.startsWith("<!doctype html") ||
    asciiHead.startsWith("<html") ||
    asciiHead.startsWith("<svg") ||
    asciiHead.startsWith("<script")
  ) {
    return "text/html";
  }

  // Magic bytes de formatos binarios comunes
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith([0x50, 0x4b, 0x03, 0x04])) {
    // ZIP container (DOCX/XLSX/PPTX o ZIP genérico)
    if (
      declaredMime.startsWith("application/vnd.openxmlformats-officedocument.") ||
      declaredMime === "application/zip"
    ) {
      return declaredMime;
    }
    return "application/zip";
  }
  if (startsWith([0x1a, 0x45, 0xdf, 0xa3])) {
    return declaredMime === "audio/webm" ? "audio/webm" : "video/webm";
  }
  if (startsWith([0x66, 0x74, 0x79, 0x70], 4)) {
    return declaredMime === "audio/mp4" ? "audio/mp4" : "video/mp4";
  }
  if (startsWith([0x4f, 0x67, 0x67, 0x53])) return "audio/ogg";
  if (startsWith([0x49, 0x44, 0x33]) || startsWith([0xff, 0xfb])) return "audio/mpeg";

  // Formatos de texto plano / markdown / csv ya filtrados contra HTML/SVG
  return declaredMime;
}

async function inspectAndHashStream(
  body: ReadableStream<Uint8Array>,
  declaredMime: string,
): Promise<{ actualBytes: number; sha256: string; detectedMime: string }> {
  let actualBytes = 0;
  const headChunks: number[] = [];

  const meteringStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      actualBytes += chunk.byteLength;
      if (headChunks.length < 64) {
        const take = Math.min(chunk.byteLength, 64 - headChunks.length);
        for (let i = 0; i < take; i++) headChunks.push(chunk[i]);
      }
      controller.enqueue(chunk);
    },
  });

  const digestBuffer = await stdCrypto.subtle.digest(
    "SHA-256",
    body.pipeThrough(meteringStream),
  );
  const sha256 = encodeHex(new Uint8Array(digestBuffer));
  const detectedMime = sniffMimeFromHeader(new Uint8Array(headChunks), declaredMime);

  return { actualBytes, sha256, detectedMime };
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

    const body = await req.json().catch(() => null);
    const reservationId =
      typeof body?.reservation_id === "string" ? body.reservation_id.trim() : "";
    if (!reservationId) {
      return jsonResponse({ error: "Missing reservation_id" }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 2. Cargar reserva y validar pertenencia al usuario
    const { data: reservation, error: resErr } = await adminClient
      .from("upload_reservations")
      .select("id, owner_id, attachment_id, bucket_id, path, status, max_bytes")
      .eq("id", reservationId)
      .eq("owner_id", userId)
      .maybeSingle();

    if (resErr) {
      console.error("[upload-finalize] query reservation error:", resErr.message);
      return jsonResponse({ error: "Failed to load reservation" }, 500);
    }
    if (!reservation) {
      return jsonResponse({ error: "Reservation not found" }, 404);
    }

    const { data: attachment } = await adminClient
      .from("attachments")
      .select("id, mime_type, availability, size_bytes, checksum_sha256")
      .eq("id", reservation.attachment_id)
      .maybeSingle();

    if (!attachment) {
      return jsonResponse({ error: "Attachment record not found" }, 404);
    }

    // Idempotencia si ya fue finalizada previamente
    if (reservation.status === "consumed" && attachment.availability === "available") {
      const { data: signed } = await adminClient.storage
        .from(reservation.bucket_id)
        .createSignedUrl(reservation.path, SIGNED_URL_TTL_SECONDS);

      return jsonResponse({
        ok: true,
        outcome: "already_consumed",
        attachment_id: attachment.id,
        availability: attachment.availability,
        size_bytes: attachment.size_bytes,
        mime_type: attachment.mime_type,
        checksum_sha256: attachment.checksum_sha256,
        signed_url: signed?.signedUrl ?? null,
        signed_url_expires_in: SIGNED_URL_TTL_SECONDS,
      });
    }

    if (reservation.status !== "active") {
      return jsonResponse(
        { error: "Reservation is no longer active", status: reservation.status },
        409,
      );
    }

    // 3. Verificar objeto real en Storage mediante stream con URL firmada efímera (60s)
    const { data: verifySigned, error: signErr } = await adminClient.storage
      .from(reservation.bucket_id)
      .createSignedUrl(reservation.path, 60);

    if (signErr || !verifySigned?.signedUrl) {
      return jsonResponse(
        { error: "Uploaded object not found in storage", code: "OBJECT_NOT_FOUND" },
        409,
      );
    }

    const objRes = await fetch(verifySigned.signedUrl, { method: "GET" });
    if (!objRes.ok || !objRes.body) {
      return jsonResponse(
        { error: "Uploaded object not found in storage", code: "OBJECT_NOT_FOUND" },
        409,
      );
    }

    // 4. Medir tamaño real, detectar magic bytes y calcular SHA-256 en streaming O(1) RAM
    const { actualBytes, sha256, detectedMime } = await inspectAndHashStream(
      objRes.body,
      attachment.mime_type,
    );

    // 5. Confirmar atómicamente en Postgres (actualiza reserva, storage_usage y attachments)
    const { data: rpcRows, error: finalizeErr } = await adminClient.rpc("rpc_finalize_upload", {
      p_reservation_id: reservation.id,
      p_owner_id: userId,
      p_actual_bytes: actualBytes,
      p_detected_mime: detectedMime,
      p_sha256: sha256,
    });

    if (finalizeErr) {
      console.error("[upload-finalize] rpc_finalize_upload error:", finalizeErr.message);
      return jsonResponse({ error: "Finalize transaction failed" }, 500);
    }

    const result = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    if (result.outcome === "violated_queued_delete") {
      return jsonResponse(
        {
          ok: false,
          code: "QUOTA_OR_MIME_VIOLATION",
          outcome: result.outcome,
          attachment_id: result.attachment_id,
          actual_bytes: actualBytes,
          detected_mime: detectedMime,
        },
        413,
      );
    }

    // 6. Emitir URL firmada de 5 minutos para renderizado inmediato en el cliente
    const { data: readSigned } = await adminClient.storage
      .from(reservation.bucket_id)
      .createSignedUrl(reservation.path, SIGNED_URL_TTL_SECONDS);

    return jsonResponse({
      ok: true,
      outcome: result.outcome,
      attachment_id: result.attachment_id,
      availability: result.availability,
      size_bytes: result.size_bytes,
      mime_type: result.mime_type,
      checksum_sha256: result.checksum_sha256,
      signed_url: readSigned?.signedUrl ?? null,
      signed_url_expires_in: SIGNED_URL_TTL_SECONDS,
    });
  } catch (err) {
    console.error("[upload-finalize] unexpected error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
