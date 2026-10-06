// Supabase Edge Function: ai
// Desplegable con: supabase functions deploy ai
// Maneja autenticación segura, rate limiting e inferencia con Google Gemini sin exponer secretos.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiter en memoria por IP / usuario (básico)
const userRequestCounts = new Map<string, { count: number; expiresAt: number }>();
const MAX_REQUESTS_PER_MINUTE = 15;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = userRequestCounts.get(key);

  if (!entry || entry.expiresAt < now) {
    userRequestCounts.set(key, { count: 1, expiresAt: now + 60000 });
    return true;
  }

  if (entry.count >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }

  entry.count += 1;
  return true;
}

serve(async (req: Request) => {
  // Manejo de preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Verificación de Autenticación
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || '';

    if (!geminiApiKey) {
      console.error('[AI] GEMINI_API_KEY secret is not set in Supabase');
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not configured in Supabase Secrets' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Permitir tanto usuarios logueados con JWT como llamadas legítimas desde la app con la anon key
    let userId = req.headers.get('x-forwarded-for') || 'client_session';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (token && token !== supabaseAnonKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          userId = user.id;
        }
      } catch {
        // En caso de que el token esté expirado o no sea usuario, continúa con userId de IP/session
      }
    }

    // 2. Control de uso y rate limiting
    if (!checkRateLimit(userId)) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please wait a minute.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Lectura y validación del Payload
    const body = await req.json();
    const { action, model = 'gemini-2.5-flash', input, systemPrompt, schemaName } = body;

    if (!input) {
      return new Response(JSON.stringify({ error: 'Missing input payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Inicialización del SDK de Google Gemini en el servidor
    const genAI = new GoogleGenerativeAI(geminiApiKey);

    // Función auxiliar para llamar a Gemini con fallback automático de modelo
    async function generateWithFallback(
      candidateModels: string[],
      config: any,
      contentParts: any
    ) {
      const errorLog: string[] = [];
      for (const m of candidateModels) {
        try {
          console.log(`[AI] Attempting generateContent with model: ${m}`);
          const geminiModel = genAI.getGenerativeModel({
            model: m,
            generationConfig: config.generationConfig,
            systemInstruction: config.systemInstruction,
          });
          const result = await geminiModel.generateContent(contentParts);
          return result.response.text();
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          console.warn(`[AI] Failed with model ${m}:`, errMsg);
          errorLog.push(`${m}: ${errMsg}`);
          continue;
        }
      }
      throw new Error(`Modelos fallaron: ${errorLog.join(' | ')}`);
    }

    const fallbackChain = [model, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'].filter(
      (m, idx, arr) => !!m && arr.indexOf(m) === idx
    );

    // Configuración según la acción solicitada
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

      let parsed = {};
      try {
        parsed = JSON.parse(textResponse);
      } catch (err) {
        console.error('Error parsing JSON from Gemini:', textResponse);
      }

      return new Response(JSON.stringify({ structured: parsed }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'generateMultimodal') {
      // Construcción de partes multimodales
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

      console.log(`[AI] Invoking Gemini Multimodal with ${parts.length} parts...`);
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

      let parsed = {};
      try {
        parsed = JSON.parse(textResponse);
      } catch {
        parsed = { rawText: textResponse };
      }

      return new Response(JSON.stringify({ structured: parsed }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Default: Generación de texto regular
    const geminiModel = genAI.getGenerativeModel({
      model,
      systemInstruction: systemPrompt,
    });

    const result = await geminiModel.generateContent(input.text || '');
    return new Response(JSON.stringify({ text: result.response.text() }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[AI Edge Function] Execution error:', err);
    const errMsg = err?.message || String(err);
    const isRateLimit = errMsg.includes('429') || errMsg.includes('Quota') || errMsg.includes('RESOURCE_EXHAUSTED');
    const isHighDemand = errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('overloaded');

    let status = 500;
    if (isRateLimit) status = 429;
    else if (isHighDemand) status = 503;

    return new Response(JSON.stringify({ error: errMsg || 'Internal AI processing error' }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
