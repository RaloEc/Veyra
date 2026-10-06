/**
 * Veyra AI Core Types
 * Abstracciones y contratos internos independientes de cualquier proveedor (Gemini, Groq, OpenAI, etc.)
 */

export type AIMediaType = 'text' | 'image' | 'pdf' | 'audio';

export type AIErrorCode =
  | 'network_error'
  | 'provider_error'
  | 'rate_limit'
  | 'auth_error'
  | 'validation_error'
  | 'unsupported_file'
  | 'file_too_large'
  | 'invalid_tool_call'
  | 'offline'
  | 'cancelled';

export interface AIInputAttachment {
  uri: string;          // URI local o ruta en Supabase Storage
  mimeType: string;     // 'image/jpeg', 'application/pdf', etc.
  size: number;         // Tamaño en bytes
  name: string;
  type: AIMediaType;
  base64Data?: string;  // Opcional para payloads pequeños
}

export interface AIInput {
  text?: string;
  attachments?: AIInputAttachment[];
  requestId?: string;   // Identificador único para evitar llamadas duplicadas
  context?: Record<string, unknown>; // Contexto local acotado (fecha, timezone, etc.)
}

export interface AIToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIOutput {
  text?: string;
  toolCalls?: AIToolCall[];
  structured?: unknown;  // JSON estructurado validado
  requestId?: string;
  finishReason?: string;
}

export interface AIError {
  code: AIErrorCode;
  message: string;      // Detalle técnico para logging seguro
  userMessage: string;  // Mensaje amigable para UI
  retryable: boolean;
}

// Configuración centralizada de modelos por propósito
export const AI_MODELS = {
  TEXT: 'gemini-2.5-flash',        // Rápido y de última generación para Quick Add, extracción, resúmenes
  MULTIMODAL: 'gemini-2.5-flash',  // Imágenes, documentos y audio multimodal
  REASONING: 'gemini-2.5-pro',    // Planificación diaria compleja (fase posterior)
} as const;

// Límites de seguridad y costos para mobile y Edge Function
export const AI_LIMITS = {
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_ATTACHMENTS: 3,
  MAX_PROMPT_CHARS: 8000,
  MAX_REQUESTS_PER_MINUTE: 12,
} as const;
