import { z } from 'zod';

/**
 * Esquemas Zod para la interpretación y estructuración de respuestas de la IA.
 * Reutilizan y validan los enums y contratos existentes de Veyra.
 */

// Nivel de control para recordatorios
export const ControlLevelSchema = z.enum(['normal', 'strict', 'critical']);

// Tipos de recurrencia soportados en Veyra
export const RecurrenceTypeSchema = z.enum(['none', 'daily', 'weekly', 'monthly', 'yearly']);

// Schema para intención de creación de Recordatorio
export const ReminderIntentSchema = z.object({
  title: z.string().min(1, 'El título es requerido').max(250),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha debe ser YYYY-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Formato de hora debe ser HH:MM').optional(),
  controlLevel: ControlLevelSchema.default('normal'),
  recurrence: RecurrenceTypeSchema.default('none').optional(),
  description: z.string().max(1500).optional(),
  contextExplanation: z.string().max(300).optional(),
  subtasks: z.array(
    z.object({
      title: z.string().min(1).max(200),
    })
  ).optional(),
});

// Schema para intención de creación de Evento
export const EventIntentSchema = z.object({
  title: z.string().min(1, 'El título es requerido').max(250),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha debe ser YYYY-MM-DD'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato de hora de inicio debe ser HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato de hora de fin debe ser HH:MM'),
  location: z.string().max(300).optional(),
  description: z.string().max(1500).optional(),
  color: z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/).optional(),
  repeatRule: z.string().optional(),
  tags: z.array(z.string()).optional(),
  contextExplanation: z.string().max(300).optional(),
});

// Schema para intención de creación de Nota
export const NoteIntentSchema = z.object({
  title: z.string().max(250).optional(),
  content: z.string().min(1, 'El contenido es requerido'),
  folderId: z.string().uuid().optional(),
});

// Ítem individual dentro de un lote (Batch)
export const BatchItemSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('reminder'),
    data: ReminderIntentSchema,
    selected: z.boolean().default(true),
  }),
  z.object({
    id: z.string(),
    type: z.literal('event'),
    data: EventIntentSchema,
    selected: z.boolean().default(true),
  }),
  z.object({
    id: z.string(),
    type: z.literal('note'),
    data: NoteIntentSchema,
    selected: z.boolean().default(true),
  }),
]);

// Propuesta de creación múltiple (Lote / Batch)
export const BatchProposalSchema = z.object({
  action: z.literal('create_batch'),
  summary: z.string().optional(),
  items: z.array(BatchItemSchema).min(1),
  transcription: z.string().optional(),
  contextExplanation: z.string().optional(),
});

// Schema para extracción de tareas de una Nota o texto libre
export const TaskExtractionItemSchema = z.object({
  title: z.string().min(1),
  suggestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  suggestedTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  suggestedControlLevel: ControlLevelSchema.optional(),
});

export const TaskExtractionSchema = z.object({
  tasks: z.array(TaskExtractionItemSchema),
  summary: z.string().optional(),
});

// Schema para análisis de imágenes / documentos
export const ImageAnalysisSchema = z.object({
  title: z.string().optional(),
  tasks: z.array(z.string()),
  dates: z.array(
    z.object({
      text: z.string(),
      resolvedDate: z.string().optional(),
    })
  ),
  importantInfo: z.array(z.string()),
  rawText: z.string().optional(),
});

// --- Esquemas para Edición en Lenguaje Natural ---

export const UpdateReminderProposalSchema = z.object({
  action: z.literal('update_reminder'),
  targetId: z.string(),
  targetTitle: z.string().optional(),
  changes: z.object({
    title: z.string().optional(),
    due_date_ms: z.number().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    control_level: ControlLevelSchema.optional(),
    description: z.string().optional(),
    repeat_rule: z.string().optional(),
  }),
  summary: z.string(),
  contextExplanation: z.string().optional(),
  transcription: z.string().optional(),
});

export const UpdateEventProposalSchema = z.object({
  action: z.literal('update_event'),
  targetId: z.string(),
  targetTitle: z.string().optional(),
  changes: z.object({
    title: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    start_time_ms: z.number().optional(),
    end_time_ms: z.number().optional(),
    location: z.string().optional(),
    description: z.string().optional(),
    repeatRule: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
  summary: z.string(),
  contextExplanation: z.string().optional(),
  transcription: z.string().optional(),
});

export const BatchUpdateProposalSchema = z.object({
  action: z.literal('batch_update'),
  targetType: z.enum(['reminder', 'event']),
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      currentValue: z.string().optional(),
      newValue: z.string().optional(),
      selected: z.boolean().default(true),
    })
  ),
  changes: z.record(z.string(), z.unknown()),
  summary: z.string(),
  contextExplanation: z.string().optional(),
  transcription: z.string().optional(),
});

export const MoveNoteProposalSchema = z.object({
  action: z.literal('move_note'),
  targetIds: z.array(z.string()),
  targetTitles: z.array(z.string()).optional(),
  folderId: z.string(),
  folderName: z.string(),
  summary: z.string(),
  contextExplanation: z.string().optional(),
  transcription: z.string().optional(),
});

export const DeleteFilteredProposalSchema = z.object({
  action: z.literal('delete_filtered'),
  targetType: z.enum(['reminder', 'event', 'note']),
  targetIds: z.array(z.string()),
  targetTitles: z.array(z.string()).optional(),
  filterDescription: z.string(),
  summary: z.string(),
  requiresConfirmation: z.literal(true).default(true),
  transcription: z.string().optional(),
});

// Unión discriminada de propuestas de acción generadas por la IA
export const AIActionProposalSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_reminder'),
    data: ReminderIntentSchema,
    confidence: z.number().min(0).max(1).optional(),
    transcription: z.string().optional(),
  }),
  z.object({
    action: z.literal('create_event'),
    data: EventIntentSchema,
    confidence: z.number().min(0).max(1).optional(),
    transcription: z.string().optional(),
  }),
  z.object({
    action: z.literal('create_note'),
    data: NoteIntentSchema,
    confidence: z.number().min(0).max(1).optional(),
    transcription: z.string().optional(),
  }),
  BatchProposalSchema,
  UpdateReminderProposalSchema,
  UpdateEventProposalSchema,
  BatchUpdateProposalSchema,
  MoveNoteProposalSchema,
  DeleteFilteredProposalSchema,
  z.object({
    action: z.literal('extract_tasks'),
    data: TaskExtractionSchema,
    transcription: z.string().optional(),
  }),
  z.object({
    action: z.literal('analyze_image'),
    data: ImageAnalysisSchema,
    transcription: z.string().optional(),
  }),
  z.object({
    action: z.literal('clarify'),
    question: z.string(),
    transcription: z.string().optional(),
  }),
  z.object({
    action: z.literal('unknown'),
    reason: z.string(),
    transcription: z.string().optional(),
  }),
]);

export type ReminderIntent = z.infer<typeof ReminderIntentSchema>;
export type EventIntent = z.infer<typeof EventIntentSchema>;
export type NoteIntent = z.infer<typeof NoteIntentSchema>;
export type BatchItem = z.infer<typeof BatchItemSchema>;
export type BatchProposal = z.infer<typeof BatchProposalSchema>;
export type TaskExtraction = z.infer<typeof TaskExtractionSchema>;
export type ImageAnalysis = z.infer<typeof ImageAnalysisSchema>;
export type UpdateReminderProposal = z.infer<typeof UpdateReminderProposalSchema>;
export type UpdateEventProposal = z.infer<typeof UpdateEventProposalSchema>;
export type BatchUpdateProposal = z.infer<typeof BatchUpdateProposalSchema>;
export type MoveNoteProposal = z.infer<typeof MoveNoteProposalSchema>;
export type DeleteFilteredProposal = z.infer<typeof DeleteFilteredProposalSchema>;
export type AIActionProposal = z.infer<typeof AIActionProposalSchema>;
