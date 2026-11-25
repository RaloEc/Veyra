// Supabase Edge Function: ai
// Desplegable con: supabase functions deploy ai
// Maneja autenticación estricta, rate limiting persistente en DB, sanitización de salida e inferencia con Gemini.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
]);

const RATE_LIMIT_WINDOW_SECONDS = 300; // 5 minutos
const RATE_LIMIT_MAX_REQUESTS = 30;

function sanitizeAiString(val: string): string {
  return val
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?(script|iframe|object|embed|form|meta|base)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|xlink:href|formaction)\s*=\s*(["'])\s*(javascript:|vbscript:|data:text\/html)[^"']*\2/gi, '$1=$2#$2');
}

function sanitizeAiOutput(val: unknown): unknown {
  if (typeof val === 'string') {
    return sanitizeAiString(val);
  }
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeAiOutput(item));
  }
  if (val && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      out[k] = sanitizeAiOutput(v);
    }
    return out;
  }
  return val;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Verificación estricta de JWT de usuario autenticado (sin fallback anon/IP)
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || '';

    if (!token || token === supabaseAnonKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized: valid user session required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!geminiApiKey || !supabaseServiceKey) {
      console.error('[AI] Missing required server secrets');
      return new Response(JSON.stringify({ error: 'Server AI configuration incomplete' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: invalid or expired session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Rate limiting persistente en PostgreSQL por user_id (últimos 5 minutos)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });
    const { data: withinLimit, error: rlError } = await adminClient.rpc('rpc_check_ai_rate_limit', {
      p_user_id: user.id,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      p_max_requests: RATE_LIMIT_MAX_REQUESTS,
    });
    if (rlError) {
      console.error('[AI] Rate limit RPC error:', rlError.code || 'unknown');
      return new Response(JSON.stringify({ error: 'Rate limiter unavailable' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!withinLimit) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a few minutes.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Lectura y validación del Payload (nunca registrar prompt, context ni respuestas crudas en logs)
    const body = await req.json();
    const { action, model = 'gemini-2.5-flash', input, systemPrompt } = body ?? {};

    if (!input) {
      return new Response(JSON.stringify({ error: 'Missing input payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requestedModel = typeof model === 'string' && ALLOWED_MODELS.has(model)
      ? model
      : 'gemini-2.5-flash';

    // 4. Inicialización del SDK de Google Gemini en el servidor
    const genAI = new GoogleGenerativeAI(geminiApiKey);

    async function generateWithFallback(
      candidateModels: string[],
      config: any,
      contentParts: any
    ) {
      const errorLog: string[] = [];
      for (const m of candidateModels) {
        try {
          console.log(`[AI] Invoking model=${m}`);
          const geminiModel = genAI.getGenerativeModel({
            model: m,
            generationConfig: config.generationConfig,
            systemInstruction: config.systemInstruction,
          });
          const result = await geminiModel.generateContent(contentParts);
          return result.response.text();
        } catch (err: any) {
          const errStatus = err?.status || err?.code || 'ERR';
          console.warn(`[AI] Model ${m} failed status=${errStatus}`);
          errorLog.push(`${m}:${errStatus}`);
          continue;
        }
      }
      throw new Error(`Model fallback failed (${errorLog.join(', ')})`);
    }

    const fallbackChain = [requestedModel, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'].filter(
      (m, idx, arr) => !!m && ALLOWED_MODELS.has(m) && arr.indexOf(m) === idx
    );

    if (action === 'generateStructured') {
      const prompt = `Procesa esta solicitud para Veyra:\n${input.text || ''}\n\nContexto: ${JSON.stringify(
        input.context || {}
      )}`;

      const textResponse = await generateWithFallback(
        fallbackChain,
        {
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
          systemInstruction: systemPrompt,
        },
        prompt
      );

      let parsed: unknown = {};
      try {
        parsed = sanitizeAiOutput(JSON.parse(textResponse));
      } catch {
        console.warn('[AI] Failed to parse structured JSON response');
      }

      return new Response(JSON.stringify({ structured: parsed }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'generateMultimodal') {
      const parts: any[] = [];
      const hasImagesOrDocs = Array.isArray(input.attachments) && input.attachments.some((a: any) =>
        a.mimeType?.startsWith('image/') || a.type === 'image' || a.mimeType?.includes('pdf') || a.type === 'pdf'
      );

      if (input.text) {
        parts.push(input.text);
      } else if (hasImagesOrDocs) {
        parts.push('Analiza con máxima atención la imagen o documento adjunto (puede ser un horario de clases, turnos, factura, recibo, lista de tareas o cita) y extrae todos los datos estructurados en formato JSON según las instrucciones del sistema.');
      } else {
        parts.push('Escucha el audio adjunto con atención y devuelve el JSON requerido con la intención y la transcripción textual.');
      }

      if (Array.isArray(input.attachments)) {
        for (const att of input.attachments) {
          if (att.base64Data) {
            parts.push({
              inlineData: {
                data: att.base64Data,
                mimeType: att.mimeType,
              },
            });
          }
        }
      }

      console.log(`[AI] Invoking multimodal parts=${parts.length}`);
      const textResponse = await generateWithFallback(
        fallbackChain,
        {
          generationConfig: {
            responseMimeType: 'application/json',
          },
          systemInstruction: systemPrompt,
        },
        parts
      );

      let parsed: unknown = {};
      try {
        parsed = sanitizeAiOutput(JSON.parse(textResponse));
      } catch {
        parsed = { rawText: sanitizeAiString(textResponse) };
      }

      return new Response(JSON.stringify({ structured: parsed }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Default: Generación de texto regular
    const geminiModel = genAI.getGenerativeModel({
      model: requestedModel,
      systemInstruction: systemPrompt,
    });

    const result = await geminiModel.generateContent(input.text || '');
    return new Response(JSON.stringify({ text: sanitizeAiString(result.response.text()) }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.error('[AI] Execution error status=', err?.status || err?.code || 'unknown');
    const isRateLimit = errMsg.includes('429') || errMsg.includes('Quota') || errMsg.includes('RESOURCE_EXHAUSTED');
    const isHighDemand = errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('overloaded');

    let status = 500;
    if (isRateLimit) status = 429;
    else if (isHighDemand) status = 503;

    return new Response(JSON.stringify({ error: isRateLimit ? 'AI quota exceeded' : isHighDemand ? 'AI service temporarily busy' : 'Internal AI processing error' }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
