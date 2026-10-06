import { AIInput, AIOutput, AIError, AI_LIMITS } from '../types';

/**
 * Contrato de definición de Tools compatible con Function Calling agnóstico
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Interfaz genérica para cualquier proveedor de IA.
 * Permite cambiar de Gemini a Groq, OpenRouter o modelos locales sin tocar la UI ni la lógica de negocio.
 */
export interface AIProvider {
  /**
   * Generación básica de texto libre o razonamiento
   */
  generateText(input: AIInput, systemPrompt?: string): Promise<AIOutput>;

  /**
   * Genera una salida estructurada y tipada a partir de un schema o instrucciones
   */
  generateStructured<T>(input: AIInput, schemaName: string, systemPrompt?: string): Promise<T>;

  /**
   * Procesa contenido multimodal (imágenes, documentos)
   */
  generateMultimodal(input: AIInput, systemPrompt?: string): Promise<AIOutput>;

  /**
   * Ejecuta Function Calling pasando definiciones de tools
   */
  executeTools(input: AIInput, tools: ToolDefinition[], systemPrompt?: string): Promise<AIOutput>;

  /**
   * Comprueba si el proveedor está disponible (conexión / autenticación)
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Validador básico previo a cualquier llamada para evitar costos y tráfico innecesario
 */
export function validateInputLimits(input: AIInput): AIError | null {
  if (input.text && input.text.length > AI_LIMITS.MAX_PROMPT_CHARS) {
    return {
      code: 'validation_error',
      message: `El texto excede el límite de ${AI_LIMITS.MAX_PROMPT_CHARS} caracteres.`,
      userMessage: 'El texto ingresado es demasiado extenso para ser procesado.',
      retryable: false,
    };
  }

  if (input.attachments && input.attachments.length > AI_LIMITS.MAX_ATTACHMENTS) {
    return {
      code: 'validation_error',
      message: `Máximo ${AI_LIMITS.MAX_ATTACHMENTS} archivos permitidos.`,
      userMessage: `Solo puedes adjuntar hasta ${AI_LIMITS.MAX_ATTACHMENTS} archivos a la vez.`,
      retryable: false,
    };
  }

  if (input.attachments) {
    for (const att of input.attachments) {
      if (att.size > AI_LIMITS.MAX_FILE_SIZE_BYTES) {
        return {
          code: 'file_too_large',
          message: `El archivo ${att.name} supera los 10MB.`,
          userMessage: `El archivo ${att.name} es demasiado grande (máximo 10 MB).`,
          retryable: false,
        };
      }
    }
  }

  return null;
}
