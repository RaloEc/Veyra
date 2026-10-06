import { AIProvider } from './providers/provider';
import { GeminiProvider } from './providers/gemini';
import { AIInput, AIOutput, AIInputAttachment, AIError } from './types';
import {
  AIActionProposal,
  AIActionProposalSchema,
  TaskExtraction,
  TaskExtractionSchema,
  ImageAnalysis,
  ImageAnalysisSchema,
} from './schemas';
import { buildDateTimeContext, DateTimeContext } from './utils/dates';
import { getAgendaContextSummary } from './utils/agendaContext';
import { getRemindersContextSummary } from './utils/remindersContext';
import { getNotesContextSummary } from './utils/notesContext';

/**
 * Normaliza respuestas de Gemini que pueden diferir en nombres de propiedades
 * (ej. command: 'set_reminder', datetime: { date: 'tomorrow' }) para adaptarlas
 * perfectamente al schema estricto de AIActionProposal de Zod.
 */
function normalizeTimeString(t: any, fallback = '09:00'): string {
  if (!t) return fallback;
  const str = String(t).trim();
  const rangePart = str.split(/[-]| a | to /)[0].trim();
  const match = rangePart.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    const hh = match[1].padStart(2, '0');
    const mm = match[2];
    return `${hh}:${mm}`;
  }
  return fallback;
}

function normalizeRawProposal(raw: any, defaultText?: string): any {
  if (Array.isArray(raw)) {
    raw = {
      action: 'create_batch',
      items: raw,
    };
  }

  if (!raw || typeof raw !== 'object') {
    return {
      action: 'unknown',
      reason: 'Respuesta vacía o formato inválido de la IA.',
    };
  }

  // Detectar acción
  let action: string = raw.action || raw.command || raw.type || raw.intent || '';
  action = String(action).toLowerCase().trim();

  // Acciones de edición o específicas ya formateadas (create_batch se procesa abajo para normalizar sus ítems)
  const passthroughActions = [
    'update_reminder',
    'update_event',
    'batch_update',
    'move_note',
    'delete_filtered',
    'extract_tasks',
    'analyze_image',
    'clarify',
    'unknown',
  ];
  if (passthroughActions.includes(action)) {
    return {
      ...raw,
      action,
      transcription: raw.transcription || defaultText,
    };
  }

  if (action === 'set_reminder' || action.includes('reminder') || action.includes('recordatorio')) {
    action = 'create_reminder';
  } else if (action === 'set_event' || action.includes('event') || action.includes('evento') || action.includes('reunion') || action.includes('meeting')) {
    action = 'create_event';
  } else if (action === 'set_note' || action.includes('note') || action.includes('nota') || action.includes('apunte')) {
    action = 'create_note';
  } else if (action === 'clarify' || action === 'ask') {
    action = 'clarify';
  } else if (!action) {
    if (raw.reminder || raw.due_date || (raw.date && !raw.startTime && !raw.endTime)) {
      action = 'create_reminder';
    } else if (raw.event || raw.startTime || raw.endTime) {
      action = 'create_event';
    } else if (raw.note || raw.content) {
      action = 'create_note';
    } else {
      action = 'create_reminder';
    }
  }

  // Extraer data base
  const data = raw.data || raw.reminder || raw.event || raw.note || raw;

  // Extraer explicación de sincronización de contexto si existe
  const contextExplanation =
    data.contextExplanation ||
    data.explanation ||
    raw.contextExplanation ||
    raw.explanation ||
    undefined;

  // Extraer transcripción
  const transcription =
    raw.transcription ||
    raw.transcript ||
    raw.texto ||
    raw.text ||
    defaultText ||
    (data && (data.title || data.task || data.content)) ||
    '';

  const todayStr = new Date().toISOString().split('T')[0];

  // Soporte para Lote / Batch (Múltiples elementos desde un solo comando o imagen)
  if (
    action === 'create_batch' ||
    action.includes('batch') ||
    action === 'multiple' ||
    (Array.isArray(raw.items) && raw.items.length > 0) ||
    (raw.schedule && Array.isArray(raw.schedule) && raw.schedule.length > 0) ||
    (raw.classes && Array.isArray(raw.classes) && raw.classes.length > 0) ||
    (raw.materias && Array.isArray(raw.materias) && raw.materias.length > 0) ||
    (raw.events && Array.isArray(raw.events) && raw.events.length > 0) ||
    (data && Array.isArray(data.items) && data.items.length > 0) ||
    (data && Array.isArray(data.schedule) && data.schedule.length > 0) ||
    (data && Array.isArray(data.classes) && data.classes.length > 0)
  ) {
    const rawList: any[] = Array.isArray(raw.items)
      ? raw.items
      : Array.isArray(raw.schedule)
      ? raw.schedule
      : Array.isArray(raw.classes)
      ? raw.classes
      : Array.isArray(raw.materias)
      ? raw.materias
      : Array.isArray(raw.events)
      ? raw.events
      : Array.isArray(raw.reminders)
      ? raw.reminders
      : Array.isArray(raw.tasks)
      ? raw.tasks
      : (data && Array.isArray(data.items))
      ? data.items
      : (data && Array.isArray(data.schedule))
      ? data.schedule
      : (data && Array.isArray(data.classes))
      ? data.classes
      : (data && Array.isArray(data.materias))
      ? data.materias
      : (data && Array.isArray(data.events))
      ? data.events
      : [];

    const normalizedItems = rawList.map((item: any, idx: number) => {
      const rawItemType = String(item.type || item.action || '').toLowerCase();
      let itemType: 'reminder' | 'event' | 'note' = 'reminder';
      if (
        rawItemType.includes('event') ||
        rawItemType.includes('evento') ||
        rawItemType.includes('reunion') ||
        rawItemType.includes('clase') ||
        rawItemType.includes('class') ||
        item.startTime ||
        item.hora_inicio ||
        (item.data && (item.data.startTime || item.data.hora_inicio))
      ) {
        itemType = 'event';
      } else if (rawItemType.includes('note') || rawItemType.includes('nota') || item.content || (item.data && item.data.content)) {
        itemType = 'note';
      }

      const itemPayload = item.data || item;
      const normalizedSingle = normalizeRawProposal({
        action: `create_${itemType}`,
        data: itemPayload,
        transcription: itemPayload.title || itemPayload.materia || itemPayload.task || itemPayload.name || '',
      });

      return {
        id: item.id || `batch_item_${Date.now()}_${idx}`,
        type: itemType,
        data: normalizedSingle.data,
        selected: item.selected !== false,
      };
    });

    if (normalizedItems.length > 0) {
      return {
        action: 'create_batch',
        summary: raw.summary || (data && data.summary) || `Se detectaron ${normalizedItems.length} elementos`,
        items: normalizedItems,
        transcription,
        contextExplanation,
      };
    }
  }

  if (action === 'create_reminder') {
    const title = data.title || data.task || data.reminder || data.name || data.description || data.text || transcription || 'Recordatorio';
    let date = data.date || data.dueDate || (data.datetime && data.datetime.date) || todayStr;
    let time = data.time || data.dueTime || (data.datetime && data.datetime.time) || undefined;

    // Normalizar fechas relativas
    const dLower = String(date).toLowerCase();
    if (dLower === 'tomorrow' || dLower === 'mañana') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      date = tomorrow.toISOString().split('T')[0];
    } else if (dLower === 'today' || dLower === 'hoy' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      date = todayStr;
    }

    if (time && !/^\d{2}:\d{2}$/.test(time)) {
      const m = String(time).match(/(\d{1,2}):(\d{2})/);
      if (m) {
        time = `${m[1].padStart(2, '0')}:${m[2]}`;
      } else {
        time = undefined;
      }
    }

    let recurrence: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' = 'none';
    const recStr = String(data.recurrence || data.repeat || data.repeatRule || data.frequency || '').toLowerCase();
    if (recStr.includes('month') || recStr.includes('mes')) {
      recurrence = 'monthly';
    } else if (recStr.includes('day') || recStr.includes('diari') || recStr.includes('dia')) {
      recurrence = 'daily';
    } else if (recStr.includes('week') || recStr.includes('seman')) {
      recurrence = 'weekly';
    } else if (recStr.includes('year') || recStr.includes('anual') || recStr.includes('año')) {
      recurrence = 'yearly';
    }

    return {
      action: 'create_reminder',
      transcription,
      data: {
        title: String(title).slice(0, 200),
        date,
        time,
        controlLevel: data.controlLevel || 'normal',
        recurrence,
        description: data.description,
        contextExplanation: contextExplanation ? String(contextExplanation).slice(0, 300) : undefined,
      },
    };
  }

  if (action === 'create_event') {
    const title = data.title || data.materia || data.subject || data.task || data.event || transcription || 'Evento';

    let rawStart = data.startTime || data.hora_inicio || data.start || (data.datetime && data.datetime.startTime) || '09:00';
    let rawEnd = data.endTime || data.hora_fin || data.end || (data.datetime && data.datetime.endTime) || '';

    // Si rawStart viene como rango ej. "19:00 - 22:00" o "17:00 a 20:00"
    if (typeof rawStart === 'string' && (rawStart.includes('-') || rawStart.includes(' a ') || rawStart.includes(' to '))) {
      const parts = rawStart.split(/[-]| a | to /);
      if (parts.length >= 2) {
        rawStart = parts[0].trim();
        if (!rawEnd) {
          rawEnd = parts[1].trim();
        }
      }
    }

    const startTime = normalizeTimeString(rawStart, '09:00');
    let endTime = rawEnd ? normalizeTimeString(rawEnd, '') : '';
    if (!endTime) {
      const [sh, sm] = startTime.split(':').map(Number);
      const endH = (sh + 2) % 24;
      endTime = `${String(endH).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
    }

    // Detección de día de la semana para horarios recurrentes
    const weekdayMap: Record<string, number> = {
      domingo: 0, sunday: 0, dom: 0,
      lunes: 1, monday: 1, lun: 1,
      martes: 2, tuesday: 2, mar: 2,
      miercoles: 3, miércoles: 3, wednesday: 3, mie: 3, mié: 3,
      jueves: 4, thursday: 4, jue: 4,
      viernes: 5, friday: 5, vie: 5,
      sabado: 6, sábado: 6, saturday: 6, sab: 6, sáb: 6,
    };

    let targetDayIndex: number | null = null;
    const dayKey = String(data.day || data.dia || data.dayOfWeek || '').toLowerCase().trim();
    if (weekdayMap[dayKey] !== undefined) {
      targetDayIndex = weekdayMap[dayKey];
    } else if (typeof data.date === 'string' && weekdayMap[data.date.toLowerCase().trim()] !== undefined) {
      targetDayIndex = weekdayMap[data.date.toLowerCase().trim()];
    }

    let repeatRule = data.repeatRule || data.repeat || undefined;
    if (repeatRule && typeof repeatRule === 'object') {
      if (Array.isArray(repeatRule.days) && repeatRule.days.length === 1 && targetDayIndex === null) {
        targetDayIndex = Number(repeatRule.days[0]);
      }
      try {
        repeatRule = JSON.stringify(repeatRule);
      } catch {}
    } else if (typeof repeatRule === 'string' && repeatRule.trim()) {
      repeatRule = repeatRule.trim();
      try {
        const parsedRR = JSON.parse(repeatRule);
        if (Array.isArray(parsedRR.days) && parsedRR.days.length === 1 && targetDayIndex === null) {
          targetDayIndex = Number(parsedRR.days[0]);
        }
      } catch {}
    } else {
      repeatRule = undefined;
    }

    let date = data.date || todayStr;
    if (targetDayIndex !== null) {
      const now = new Date();
      const currentDay = now.getDay();
      const diff = (targetDayIndex - currentDay + 7) % 7;
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() + diff);
      date = targetDate.toISOString().split('T')[0];

      if (!repeatRule) {
        repeatRule = JSON.stringify({ type: 'weekly', days: [targetDayIndex] });
      }
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      date = todayStr;
    }

    const location = data.location || data.aula || data.salon || data.modalidad || data.lugar || undefined;
    const description = data.description || data.grupo || data.paralelo || data.jornada || undefined;
    const tags = Array.isArray(data.tags)
      ? data.tags.map((t: any) => String(t).trim().toLowerCase().replace(/^#/, '')).filter(Boolean)
      : typeof data.tags === 'string' && data.tags.trim()
      ? [data.tags.trim().toLowerCase().replace(/^#/, '')]
      : undefined;

    return {
      action: 'create_event',
      transcription,
      data: {
        title: String(title).slice(0, 200),
        date,
        startTime,
        endTime,
        location: location ? String(location).slice(0, 300) : undefined,
        description: description ? String(description).slice(0, 1500) : undefined,
        repeatRule,
        tags: tags && tags.length > 0 ? tags : undefined,
        contextExplanation: contextExplanation ? String(contextExplanation).slice(0, 300) : undefined,
      },
    };
  }

  if (action === 'create_note') {
    const content = data.content || data.text || transcription || '';
    const title = data.title || (content ? content.slice(0, 30) : 'Nota');
    return {
      action: 'create_note',
      transcription,
      data: {
        title: String(title).slice(0, 200),
        content: String(content),
      },
    };
  }

  return raw;
}

function buildAgendaSystemInstructions(agendaSummary: string, dtContext: DateTimeContext): string {
  if (!agendaSummary || !agendaSummary.trim()) {
    return '';
  }

  return `
AGENDA Y EVENTOS CONOCIDOS DEL USUARIO:
${agendaSummary}

REGLAS DE CONCIENCIA DE AGENDA (Relación con eventos del usuario):
1. Si el usuario pide un recordatorio o acción relativo a un evento de su agenda:
   - "después de [evento]", "al salir de [evento]", "al terminar [evento]" (ej: "después del trabajo", "al salir de clases", "al terminar la reunión"):
     * Identifica el evento coincidente en la agenda del usuario (ej: "Trabajo" de 08:00 a 18:00).
     * Toma la hora de fin (endTime) de ese evento.
     * REGLA DEL MARGEN DE 10 MINUTOS: Salvo que el usuario especifique explícitamente otra hora o anticipación, programa la hora del recordatorio EXACTAMENTE 10 MINUTOS ANTES de la hora de finalización del evento (ej: si el evento termina a las 18:00, la hora debe ser "17:50") para que el usuario sea alertado mientras se prepara para salir y le dé tiempo de hacer la tarea.
     * En "date": si el evento ocurre hoy (${dtContext.currentDate}) y la hora calculada aún está en el futuro respecto a ${dtContext.currentTime}, asigna la fecha de hoy. Si hoy no ocurre ese evento o la hora ya pasó, calcula la fecha de la próxima ocurrencia de dicho evento (ej: el próximo día laboral).
     * Incluye siempre en data el campo "contextExplanation" explicando la sincronización amigablemente (ej: "Programado para las 17:50 (10 min antes de terminar tu evento 'Trabajo' a las 18:00)").
   - "antes de [evento]" (ej: "antes de la reunión", "antes de entrar a trabajar"):
     * Toma la hora de inicio (startTime) del evento.
     * Programa el recordatorio 10 minutos antes (o la anticipación solicitada, ej: 30 minutos).
     * Incluye en data "contextExplanation", ej: "Programado para las 07:50 (10 min antes de iniciar 'Trabajo')".
   - "durante [evento]" o "en [evento]":
     * Programa en un horario intermedio del evento.

2. REGLA DE NO DUPLICAR (Mover o cambiar eventos ya agendados):
   - Si el usuario pide MOVER, CAMBIAR, o PASAR un evento ya existente a otro horario o "después de [otro evento/clase]":
     * ¡CRÍTICO! NUNCA crees un evento nuevo (NO devuelvas action: "create_event"), porque eso copiaría/duplicaría el evento.
     * En su lugar, devuelve action: "update_event".
     * targetId: el ID [id: ...] del evento que se va a mover que ya existe en la agenda.
     * targetTitle: el título del evento a mover.
     * En "changes":
       - startTime: la hora de fin (endTime) del evento de referencia (ej: si la clase termina a las 12:00, el nuevo startTime es "12:00").
       - endTime: la nueva hora de término manteniendo la duración del evento original (o +1 hora por defecto).
       - date: la fecha en que ocurre el evento de referencia.
     * summary: "Mover [evento] a las [nuevaHora] (después de [referencia])".
`;
}

/**
 * AIService - Servicio orquestador desacoplado de Veyra
 * Expone métodos de alto nivel para la UI y la lógica de negocio sin que conozcan los detalles del LLM.
 */
export class AIService {
  private provider: AIProvider;
  private inFlightRequests: Set<string> = new Set();

  constructor(provider: AIProvider = new GeminiProvider()) {
    this.provider = provider;
  }

  /**
   * Permite cambiar dinámicamente el proveedor (ej. en tests o migración futura a Groq)
   */
  public setProvider(provider: AIProvider): void {
    this.provider = provider;
  }

  /**
   * AI Quick Add: Interpreta texto libre en lenguaje natural y determina si es Reminder, Event o Note.
   */
  async parseQuickAdd(text: string, context?: Record<string, unknown>): Promise<AIActionProposal> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw {
        code: 'validation_error',
        message: 'Empty prompt provided',
        userMessage: 'Por favor escribe qué deseas registrar.',
        retryable: false,
      } as AIError;
    }

    const dtContext = buildDateTimeContext();
    const [agendaSummary, remindersSummary, notesSummary] = await Promise.all([
      typeof context?.agendaContext === 'string' ? context.agendaContext : getAgendaContextSummary(),
      typeof context?.remindersContext === 'string' ? context.remindersContext : getRemindersContextSummary(),
      typeof context?.notesContext === 'string' ? context.notesContext : getNotesContextSummary(),
    ]);
    const agendaInstructions = buildAgendaSystemInstructions(agendaSummary, dtContext);

    const requestId = `quickadd_${Date.now()}_${trimmed.slice(0, 15)}`;

    if (this.inFlightRequests.has(requestId)) {
      throw {
        code: 'rate_limit',
        message: 'Duplicate request in flight',
        userMessage: 'La solicitud ya está en proceso.',
        retryable: false,
      } as AIError;
    }

    this.inFlightRequests.add(requestId);

    try {
      const input: AIInput = {
        text: trimmed,
        requestId,
        context: {
          ...dtContext,
          agendaContext: agendaSummary,
          remindersContext: remindersSummary,
          notesContext: notesSummary,
          ...(context || {}),
        },
      };

      const systemPrompt = `Eres el asistente inteligente de Veyra, una app de productividad con Recordatorios, Eventos y Notas.
Tu objetivo es clasificar e interpretar la intención del usuario devolviendo ÚNICAMENTE un objeto JSON válido acorde al schema 'AIActionProposal'.

Contexto temporal del usuario:
- Fecha actual: ${dtContext.currentDate} (${dtContext.dayOfWeek})
- Hora actual: ${dtContext.currentTime}
- Timezone: ${dtContext.timezone}

DATOS ACTUALES DEL USUARIO:
${remindersSummary}

${agendaInstructions}
${notesSummary}

Estructura obligatoria (ejemplo para recordatorio):
{
  "action": "create_reminder",
  "transcription": "${trimmed}",
  "data": {
    "title": "Pagar el agua",
    "date": "2026-10-23",
    "time": "09:00",
    "controlLevel": "normal",
    "recurrence": "monthly",
    "contextExplanation": "Programado para las 17:50 (10 min antes de terminar tu evento 'Trabajo')"
  }
}

Reglas:
1. Si el usuario pide un recordatorio o una acción/tarea directa puntual (ej: "regar las plantas", "comprar leche", "llamar al médico") -> action: "create_reminder". Si no especifica fecha ni hora, asume automáticamente fecha de hoy (${dtContext.currentDate}).
2. Si el usuario pide agendar una reunión, cita o bloque de tiempo con rango horario -> action: "create_event"
3. Si el usuario pide guardar ideas, reflexiones, listas o apuntes de texto informativos (ej: "nota de...", "guardar apunte...") -> action: "create_note"
4. Resuelve fechas relativas ("mañana", "el viernes") basándote estrictamente en la fecha actual YYYY-MM-DD.
5. Recurrencia y Repetición en recordatorios:
   - Si el usuario indica repetición periódica (ej: "cada mes", "los 23 de cada mes", "todos los días", "los lunes", "cada año"), debes:
     a) Asignar "recurrence": "daily" | "weekly" | "monthly" | "yearly".
     b) En "date", calcular la fecha de la PRIMERA ocurrencia futura a partir de ${dtContext.currentDate}. Por ejemplo, si hoy es 2026-09-28 y el usuario dice "los 23 de cada mes", la primera fecha futura es 2026-10-23.
   - Si no es recurrente, asigna "recurrence": "none".
6. CREACIÓN MÚLTIPLE (LOTE / BATCH):
   - Si el usuario menciona varias tareas, recordatorios o citas distintas en la misma orden (ej: 'comprar pan hoy a las 6, sacar la basura a las 9 y reunión con Carlos mañana a las 3'):
     * Asigna action: "create_batch".
     * En "items", incluye cada elemento con su respectivo 'type' ('reminder', 'event', 'note') y su estructura 'data'.
     * En "summary", escribe un resumen breve (ej: '3 tareas detectadas').
7. MODIFICACIÓN O TRASLADO DE ELEMENTOS EXISTENTES (NO DUPLICAR / NO COPIAR):
   - Si la orden se refiere a MOVER, CAMBIAR, POSPONER, o REPROGRAMAR un elemento ya existente en los datos del usuario:
     * ¡CRÍTICO! NUNCA devuelvas action: 'create_reminder' ni 'create_event' (eso crearía una copia o duplicado indeseado).
     * Si es un evento existente en la agenda: usa action: "update_event", targetId: el ID [id: ...] del evento a mover, targetTitle: título actual, changes: { startTime?, endTime?, date?, location?, description? }, summary: "Mover [evento] a [hora]".
     * Si es un recordatorio existente: usa action: "update_reminder", targetId: el ID del recordatorio, targetTitle: título, changes: { title?, date?, time?, due_date_ms?, control_level?, description? }, summary: "Actualizar [recordatorio]".
     * Si afecta a varios ítems: usa action: "batch_update".
     * Si es mover notas: usa action: "move_note".
     * Si es eliminar: usa action: "delete_filtered".
8. Devuelve JSON sin formato markdown ni comillas triples adicionales.`;

      const rawProposal = await this.provider.generateStructured<unknown>(
        input,
        'AIActionProposal',
        systemPrompt
      );

      const normalized = normalizeRawProposal(rawProposal, trimmed);

      // Validación estricta con Zod
      const parsed = AIActionProposalSchema.safeParse(normalized);
      if (!parsed.success) {
        console.warn('[AIService] Failed to parse proposal schema:', parsed.error, normalized);
        return {
          action: 'unknown',
          reason: 'No se pudo determinar una acción clara con el formato esperado.',
        };
      }

      return parsed.data;
    } finally {
      this.inFlightRequests.delete(requestId);
    }
  }

  /**
   * AI Edit: Interpreta órdenes en lenguaje natural para modificar, mover o eliminar
   * recordatorios, eventos o notas existentes basándose en contexto real del usuario.
   */
  async parseEdit(text: string, context?: Record<string, unknown>): Promise<AIActionProposal> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw {
        code: 'validation_error',
        message: 'Empty prompt provided',
        userMessage: 'Por favor escribe qué deseas modificar.',
        retryable: false,
      } as AIError;
    }

    const dtContext = buildDateTimeContext();
    const [agendaSummary, remindersSummary, notesSummary] = await Promise.all([
      typeof context?.agendaContext === 'string' ? context.agendaContext : getAgendaContextSummary(),
      typeof context?.remindersContext === 'string' ? context.remindersContext : getRemindersContextSummary(),
      typeof context?.notesContext === 'string' ? context.notesContext : getNotesContextSummary(),
    ]);
    const agendaInstructions = buildAgendaSystemInstructions(agendaSummary, dtContext);

    const requestId = `edit_${Date.now()}_${trimmed.slice(0, 15)}`;
    if (this.inFlightRequests.has(requestId)) {
      throw {
        code: 'rate_limit',
        message: 'Duplicate request in flight',
        userMessage: 'La solicitud ya está en proceso.',
        retryable: false,
      } as AIError;
    }

    this.inFlightRequests.add(requestId);

    try {
      const input: AIInput = {
        text: trimmed,
        requestId,
        context: {
          ...dtContext,
          agendaContext: agendaSummary,
          remindersContext: remindersSummary,
          notesContext: notesSummary,
          ...(context || {}),
        },
      };

      const systemPrompt = `Eres el asistente inteligente de edición de Veyra. El usuario ya tiene datos creados y desea MODIFICARLOS, MOVERLOS o ELIMINARLOS usando lenguaje natural.
Tu objetivo es interpretar la orden del usuario y devolver ÚNICAMENTE un objeto JSON válido acorde al schema 'AIActionProposal'.

Contexto temporal del usuario:
- Fecha actual: ${dtContext.currentDate} (${dtContext.dayOfWeek})
- Hora actual: ${dtContext.currentTime}
- Timezone: ${dtContext.timezone}

DATOS DEL USUARIO:
${remindersSummary}

${agendaInstructions}
${notesSummary}

REGLAS CRÍTICAS DE EDICIÓN:
1. NUNCA inventes IDs. Debes usar EXACTAMENTE los IDs [id: ...] presentes en los datos del usuario listados arriba.
2. Si la orden se refiere a un único recordatorio existente (ej: "cambia la hora de la leche a las 5pm", "haz estricto el recordatorio del médico", "mueve la reunión de Carlos al viernes"):
   - action: "update_reminder"
   - targetId: el ID exacto del recordatorio.
   - targetTitle: título actual del recordatorio.
   - changes: { title?, date?, time?, due_date_ms?, control_level?, description?, repeat_rule? }
   - summary: resumen breve legible del cambio (ej: "Cambiar hora a las 17:00").
3. Si la orden se refiere a un único evento existente de la agenda (ej: "mueve el evento de almuerzo a las 2pm", "mueve la reunión a después de la clase"):
   - action: "update_event"
   - targetId: el ID exacto [id: ...] del evento a mover. ¡NUNCA uses create_event ni crees un evento nuevo!
   - targetTitle: título actual del evento.
   - Si se mueve a "después de [evento/clase de referencia]":
     * Busca el evento de referencia en la agenda (ej: "Clase" o "Trabajo").
     * Toma su hora de término (endTime) como el nuevo startTime (ej: si la clase termina a las 12:00, el nuevo startTime es "12:00").
     * En endTime: calcula la nueva hora de término manteniendo la duración del evento original.
     * En date: la fecha del evento de referencia.
   - changes: { title?, date?, startTime?, endTime?, location?, description? }
   - summary: resumen breve legible del cambio (ej: "Mover a las 12:00 (después de Clase)").
4. Si la orden afecta a múltiples elementos (ej: "cambia todos mis recordatorios de mañana para el sábado", "haz todos mis recordatorios estrictos", "pasa los pendientes de hoy a mañana"):
   - action: "batch_update"
   - targetType: "reminder" | "event"
   - items: lista con cada elemento afectado [{ id, title, currentValue?, newValue?, selected: true }]
   - changes: los campos modificados comunes a aplicar (ej: { date: "2026-10-03" } o { control_level: "strict" })
   - summary: resumen legible del lote (ej: "Mover 3 recordatorios al sábado").
5. Si la orden es mover notas a una carpeta (ej: "pon los relacionados con la universidad en mi carpeta Universidad", "mueve la nota de física a Universidad"):
   - action: "move_note"
   - targetIds: array de IDs de las notas coincidentes.
   - targetTitles: títulos de las notas.
   - folderId: el ID exacto de la carpeta destino (de las CARPETAS EXISTENTES).
   - folderName: el nombre de la carpeta destino.
   - summary: resumen legible (ej: "Mover 2 notas a Universidad").
6. Si la orden es eliminar elementos bajo un criterio (ej: "elimina los recordatorios completados de este mes", "borra las notas vacías"):
   - action: "delete_filtered"
   - targetType: "reminder" | "event" | "note"
   - targetIds: array de IDs a eliminar coincidentes con el criterio.
   - filterDescription: descripción amigable del criterio (ej: "Recordatorios completados").
   - summary: resumen legible (ej: "Eliminar 4 recordatorios completados").
   - requiresConfirmation: true
7. Si el texto es ambiguo o hay varios candidatos que no se pueden distinguir claramente:
   - action: "clarify"
   - question: pregunta corta para desambiguar (ej: "¿Te refieres al recordatorio de las 10 o al de las 14?").
8. Si la orden no coincide con ninguna edición o no se encuentra ningún elemento coincidente:
   - action: "unknown"
   - reason: explicación al usuario de por qué no se pudo encontrar o modificar el elemento.

Devuelve JSON sin formato markdown ni comillas triples adicionales.`;

      const rawProposal = await this.provider.generateStructured<unknown>(
        input,
        'AIActionProposal',
        systemPrompt
      );

      const normalized = normalizeRawProposal(rawProposal, trimmed);
      const parsed = AIActionProposalSchema.safeParse(normalized);
      if (!parsed.success) {
        console.warn('[AIService] Failed to parse edit proposal schema:', parsed.error, normalized);
        return {
          action: 'unknown',
          reason: 'No se pudo estructurar la orden de edición.',
        };
      }

      return parsed.data;
    } finally {
      this.inFlightRequests.delete(requestId);
    }
  }

  /**
   * AI Quick Add con Audio (Voz directa a Gemini multimodal):
   * Procesa el audio capturado y determina si es Reminder, Event, Note o Batch.
   */
  async parseQuickAddAudio(
    base64Audio: string,
    mimeType = 'audio/m4a',
    context?: Record<string, unknown>
  ): Promise<AIActionProposal> {
    if (!base64Audio || base64Audio.length < 50) {
      throw {
        code: 'validation_error',
        message: 'Audio too short or empty',
        userMessage: 'No se detectó audio. Por favor intenta hablar de nuevo.',
        retryable: false,
      } as AIError;
    }

    const dtContext = buildDateTimeContext();
    const [agendaSummary, remindersSummary, notesSummary] = await Promise.all([
      typeof context?.agendaContext === 'string' ? context.agendaContext : getAgendaContextSummary(),
      typeof context?.remindersContext === 'string' ? context.remindersContext : getRemindersContextSummary(),
      typeof context?.notesContext === 'string' ? context.notesContext : getNotesContextSummary(),
    ]);
    const agendaInstructions = buildAgendaSystemInstructions(agendaSummary, dtContext);

    const requestId = `quickadd_audio_${Date.now()}`;

    try {
      const input: AIInput = {
        requestId,
        attachments: [
          {
            uri: 'inline://voice_prompt.m4a',
            mimeType,
            size: base64Audio.length,
            name: 'voice_prompt.m4a',
            type: 'audio',
            base64Data: base64Audio,
          },
        ],
        context: {
          ...dtContext,
          agendaContext: agendaSummary,
          remindersContext: remindersSummary,
          notesContext: notesSummary,
          ...(context || {}),
        },
      };

      const systemPrompt = `Eres el asistente inteligente de Veyra, una app de productividad con Recordatorios, Eventos y Notas.
Escucha el audio adjunto en el que el usuario te dice qué desea registrar o modificar. Tu objetivo es clasificar e interpretar su intención devolviendo ÚNICAMENTE un objeto JSON válido con la acción y la transcripción.

Contexto temporal del usuario:
- Fecha actual: ${dtContext.currentDate} (${dtContext.dayOfWeek})
- Hora actual: ${dtContext.currentTime}
- Timezone: ${dtContext.timezone}

DATOS ACTUALES DEL USUARIO:
${remindersSummary}

${agendaInstructions}
${notesSummary}

Estructura obligatoria (ejemplo para recordatorio):
{
  "action": "create_reminder",
  "transcription": "Texto exacto y literal pronunciado por el usuario",
  "data": {
    "title": "Pagar el agua",
    "date": "2026-10-23",
    "time": "09:00",
    "controlLevel": "normal",
    "recurrence": "monthly",
    "contextExplanation": "Programado para las 17:50 (10 min antes de terminar tu evento 'Trabajo')"
  }
}

Reglas:
1. Si el usuario pide un recordatorio o una acción/tarea directa puntual (ej: "regar las plantas", "comprar leche", "llamar al médico") -> action: "create_reminder". Si no especifica fecha ni hora, asume automáticamente fecha de hoy (${dtContext.currentDate}).
2. Si el usuario pide agendar una reunión, cita o bloque de tiempo con rango horario -> action: "create_event"
3. Si el usuario pide guardar ideas, reflexiones, listas o apuntes de texto informativos (ej: "nota de...", "guardar apunte...") -> action: "create_note"
4. Resuelve fechas relativas ("mañana", "el viernes") basándote estrictamente en la fecha actual en formato YYYY-MM-DD.
5. Recurrencia y Repetición en recordatorios:
   - Si el usuario indica repetición periódica (ej: "cada mes", "los 23 de cada mes", "todos los días", "cada semana", "anual"), asigna "recurrence": "daily" | "weekly" | "monthly" | "yearly", y calcula en "date" la primera fecha futura.
   - Si no hay repetición, asigna "recurrence": "none".
6. CREACIÓN MÚLTIPLE (LOTE / BATCH):
   - Si el usuario menciona varias tareas, recordatorios o citas distintas en el audio (ej: 'comprar pan a las 6, sacar la basura a las 9 y reunión mañana a las 3'):
     * Asigna action: "create_batch".
     * En "items", incluye cada elemento con su 'type' ('reminder', 'event', 'note') y su estructura 'data'.
     * En "summary", escribe un resumen breve (ej: '3 tareas detectadas').
7. MODIFICACIÓN O TRASLADO DE ELEMENTOS EXISTENTES (NO DUPLICAR / NO COPIAR):
   - Si en el audio el usuario dice MOVER, CAMBIAR, POSPONER, o REPROGRAMAR un elemento ya existente:
     * ¡CRÍTICO! NUNCA uses 'create_reminder' ni 'create_event' (eso crearía un duplicado indeseado).
     * Si es un evento de la agenda: usa action: "update_event", targetId: el ID [id: ...] del evento en la agenda, targetTitle: título actual, changes: { startTime?, endTime?, date?, location?, description? }, summary: "Mover [evento] a [hora]".
     * Si es un recordatorio: usa action: "update_reminder", targetId: el ID del recordatorio, changes: { title?, date?, time?, due_date_ms?, control_level?, description? }.
     * Si afecta a varios: usa action: "batch_update".
     * Si es mover notas: usa action: "move_note".
     * Si es eliminar: usa action: "delete_filtered".
8. Incluye siempre en la raíz el campo "transcription" con las palabras que dijo el usuario.
9. Devuelve JSON sin formato markdown ni comillas triples adicionales.`;

      const rawOutput = await this.provider.generateMultimodal(input, systemPrompt);
      const rawProposal = rawOutput.structured || rawOutput.text;

      const normalized = normalizeRawProposal(rawProposal);

      // Validación estricta con Zod
      const parsed = AIActionProposalSchema.safeParse(normalized);
      if (!parsed.success) {
        console.warn('[AIService] Failed to parse proposal schema from audio:', parsed.error, normalized);
        return {
          action: 'unknown',
          reason: 'No se pudo interpretar una acción clara del audio. Intenta hablar más claro o escribirlo.',
        };
      }

      return parsed.data;
    } finally {
      this.inFlightRequests.delete(requestId);
    }
  }

  /**
   * AI Multimodal Quick Add con Imágenes o Documentos (Horarios, Facturas, Recibos, etc.):
   * Analiza una o varias imágenes / PDFs, detecta eventos/recordatorios simples o múltiples (Batch) y devuelve la propuesta.
   */
  async parseQuickAddMedia(
    media: string | Array<{ base64Data: string; mimeType?: string; name?: string; uri?: string }>,
    mimeType = 'image/jpeg',
    userHint?: string,
    context?: Record<string, unknown>
  ): Promise<AIActionProposal> {
    const mediaItems = Array.isArray(media)
      ? media
      : [{ base64Data: media, mimeType, name: 'media_attachment' }];

    if (mediaItems.length === 0 || mediaItems.every(m => !m.base64Data || m.base64Data.length < 50)) {
      throw {
        code: 'validation_error',
        message: 'Empty or invalid file data',
        userMessage: 'Los archivos adjuntos están vacíos o dañados. Por favor intenta seleccionarlos de nuevo.',
        retryable: false,
      } as AIError;
    }

    const dtContext = buildDateTimeContext();
    const agendaSummary = (typeof context?.agendaContext === 'string')
      ? context.agendaContext
      : await getAgendaContextSummary();
    const agendaInstructions = buildAgendaSystemInstructions(agendaSummary, dtContext);

    const requestId = `quickadd_media_${Date.now()}`;

    try {
      const isMediaAudio = mediaItems.some(i => (i.mimeType || mimeType).includes('audio'));
      const defaultMediaInstruction = isMediaAudio
        ? 'Escucha el audio adjunto con atención y extrae la intención correspondiente.'
        : 'Analiza la imagen o documento adjunto (puede ser un horario de clases o de trabajo, recibo, factura, lista de tareas o cita) y extrae todos los eventos o recordatorios en formato JSON.';

      const input: AIInput = {
        requestId,
        text: userHint ? `Instrucción del usuario: ${userHint}` : defaultMediaInstruction,
        attachments: mediaItems.map((item, idx) => ({
          uri: item.uri || `inline://media_attachment_${idx}`,
          mimeType: item.mimeType || mimeType,
          size: item.base64Data.length,
          name: item.name || `adjunto_${idx + 1}`,
          type: (item.mimeType || mimeType).includes('pdf') ? 'pdf' : 'image',
          base64Data: item.base64Data,
        })),
        context: {
          ...dtContext,
          agendaContext: agendaSummary,
          ...(context || {}),
        },
      };

      const systemPrompt = `Eres el asistente inteligente de Veyra, una app de productividad con Recordatorios, Eventos y Notas.
Analiza con máxima precisión la imagen, imágenes o documentos adjuntos (pueden ser horarios de clases, tablas semanales, facturas, recibos, citas médicas, volantes o apuntes). Si hay múltiples archivos adjuntos, integra y combina la información sin duplicar.

Contexto temporal del usuario:
- Fecha actual: ${dtContext.currentDate} (${dtContext.dayOfWeek})
- Hora actual: ${dtContext.currentTime}
- Timezone: ${dtContext.timezone}
${agendaInstructions}

REGLAS DE INTERPRETACIÓN VISUAL:
1. SI CONTIENE UN HORARIO DE CLASES O TABLA SEMANAL (tabla con materias, días de la semana en columnas y horarios en celdas, o turnos de trabajo):
   - Devuelve action: "create_batch".
   - En "summary", describe el horario (ej: "Horario de clases (3 materias detectadas)").
   - En "items", crea un elemento individual tipo 'event' por cada celda de materia que tenga horario asignado:
     * "type": "event"
     * En "data.title": Nombre limpio de la materia (ej. "Interacción Hombre Máquina", "Marketing", "Presupuesto y Finanzas TI").
     * En "data.startTime" y "data.endTime": Las horas en formato HH:MM (24 horas).
       - Si la celda dice "19:00 - 22:00" -> startTime: "19:00", endTime: "22:00".
       - Si la celda dice "17:00 - 20:00" -> startTime: "17:00", endTime: "20:00".
       - Si la celda dice "18:00 - 21:00" -> startTime: "18:00", endTime: "21:00".
     * En "data.date": Calcula la fecha YYYY-MM-DD del próximo día de la semana correspondiente a esa columna (a partir de la fecha actual: ${dtContext.currentDate}).
     * En "data.repeatRule": Configura la regla de repetición semanal como JSON string según el día de la columna:
       - Lunes: "{\"type\":\"weekly\",\"days\":[1]}"
       - Martes: "{\"type\":\"weekly\",\"days\":[2]}"
       - Miércoles: "{\"type\":\"weekly\",\"days\":[3]}"
       - Jueves: "{\"type\":\"weekly\",\"days\":[4]}"
       - Viernes: "{\"type\":\"weekly\",\"days\":[5]}"
       - Sábado: "{\"type\":\"weekly\",\"days\":[6]}"
       - Domingo: "{\"type\":\"weekly\",\"days\":[0]}"
     * En "data.location": El aula, paralelo o modalidad (ej. "Virtual", "TIN-S-NO-7-1 Virtual", "Aula 204") si aparece en la fila.
     * En "data.description": Jornada o nivel (ej. "Nocturno - Nivel 7").
     * En "data.tags": Siempre incluir ["clase"] para eventos de horario de clases o materias escolares.

2. SI CONTIENE UNA FACTURA O RECIBO (Luz, agua, internet, colegiatura, etc.):
   - Identifica el servicio/empresa, el monto total y la fecha límite o de vencimiento.
   - Si es un pago puntual, genera action: "create_reminder" (o un batch si hay varias cuentas).
   - En "title": ej. "Pagar recibo de Luz ($45.00)".
   - En "date": la fecha de vencimiento encontrada en el documento (o un día antes para mayor seguridad).
   - En "time": "09:00" por defecto.

3. SI ES UNA CITA O EVENTO ÚNICO (boleto, cita médica, entrada):
   - Genera action: "create_event" con título, fecha, startTime, endTime y lugar.

4. SI DETECTAS SOLO UN ELEMENTO DIRECTO:
   - Devuelve directamente "create_reminder", "create_event" o "create_note".

Estructura obligatoria para LOTE / BATCH:
{
  "action": "create_batch",
  "summary": "Horario de clases (3 materias detectadas)",
  "items": [
    {
      "type": "event",
      "data": {
        "title": "Marketing",
        "date": "2026-10-05",
        "startTime": "17:00",
        "endTime": "20:00",
        "location": "Virtual (TIN-S-NO-7-1)",
        "repeatRule": "{\"type\":\"weekly\",\"days\":[1]}",
        "tags": ["clase"]
      }
    },
    {
      "type": "event",
      "data": {
        "title": "Interacción Hombre Máquina",
        "date": "2026-10-08",
        "startTime": "19:00",
        "endTime": "22:00",
        "location": "Virtual (TIN-S-NO-7-3)",
        "repeatRule": "{\"type\":\"weekly\",\"days\":[4]}",
        "tags": ["clase"]
      }
    }
  ]
}

Devuelve ÚNICAMENTE JSON válido sin comillas triples ni texto introductorio.`;

      const rawOutput = await this.provider.generateMultimodal(input, systemPrompt);
      const rawProposal = rawOutput.structured || rawOutput.text;

      const normalized = normalizeRawProposal(rawProposal);

      let parsed = AIActionProposalSchema.safeParse(normalized);
      if (!parsed.success) {
        console.warn('[AIService] Failed to parse proposal schema from media, sanitizando items:', parsed.error, normalized);
        // Si normalized tiene items (lote), asegurar id y tipos estrictos
        if (normalized?.action === 'create_batch' && Array.isArray(normalized.items) && normalized.items.length > 0) {
          const sanitizedItems = normalized.items.map((it: any, i: number) => ({
            id: String(it.id || `batch_item_${Date.now()}_${i}`),
            type: it.type === 'event' || it.type === 'note' ? it.type : 'reminder',
            data: it.data || {},
            selected: it.selected !== false,
          }));
          normalized.items = sanitizedItems;
          parsed = AIActionProposalSchema.safeParse(normalized);
        }
      }

      if (!parsed.success) {
        console.warn('[AIService] Still failed to parse proposal schema from media:', parsed.error, normalized);
        return {
          action: 'unknown',
          reason: 'No se pudo interpretar una acción clara del archivo. Intenta subir una foto más nítida o iluminada.',
        };
      }

      return parsed.data;
    } finally {
      this.inFlightRequests.delete(requestId);
    }
  }

  /**
   * Extrae tareas estructuradas a partir del contenido de una nota existente.
   */
  async extractTasksFromNote(noteTitle: string, noteContent: string): Promise<TaskExtraction> {
    const dtContext = buildDateTimeContext();
    const input: AIInput = {
      text: `Título: ${noteTitle}\n\nContenido:\n${noteContent}`,
      context: dtContext as unknown as Record<string, unknown>,
    };

    const systemPrompt = `Eres un asistente que extrae ítems de acción y tareas pendientes a partir de notas.
Analiza el texto y genera una lista de tareas concretas.
Para cada tarea, si se deduce una fecha sugerida en base a la fecha actual (${dtContext.currentDate}), inclúyela en formato YYYY-MM-DD.
Devuelve únicamente JSON que cumpla con el esquema TaskExtraction.`;

    const raw = await this.provider.generateStructured<unknown>(
      input,
      'TaskExtraction',
      systemPrompt
    );

    const parsed = TaskExtractionSchema.safeParse(raw);
    if (!parsed.success) {
      return { tasks: [], summary: 'No se pudieron extraer tareas válidas.' };
    }

    return parsed.data;
  }

  /**
   * Analiza una imagen o documento fotografiando apuntes, tareas o fechas.
   */
  async analyzeImage(attachment: AIInputAttachment): Promise<ImageAnalysis> {
    const dtContext = buildDateTimeContext();
    const input: AIInput = {
      attachments: [attachment],
      context: dtContext as unknown as Record<string, unknown>,
    };

    const systemPrompt = `Eres un asistente multimodal de productividad.
Examina la imagen proporcionada (pizarra, apunte, documento o captura) y extrae:
1. Posibles tareas detectadas.
2. Fechas importantes mencionadas.
3. Resumen de información clave.
Devuelve exclusivamente un JSON conforme al schema ImageAnalysis.`;

    const raw = await this.provider.generateStructured<unknown>(
      input,
      'ImageAnalysis',
      systemPrompt
    );

    const parsed = ImageAnalysisSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        tasks: [],
        dates: [],
        importantInfo: [],
        rawText: 'No fue posible estructurar el contenido de la imagen.',
      };
    }

    return parsed.data;
  }

  /**
   * Consulta si la IA está disponible para usar
   */
  async isAvailable(): Promise<boolean> {
    return this.provider.isAvailable();
  }
}

// Instancia singleton por defecto
export const aiService = new AIService();
