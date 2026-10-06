import { useStore } from '../../../store/useStore';
import { ReminderService } from '../../../services/reminderService';
import { ReminderIntentSchema, ReminderIntent } from '../schemas';
import { combineDateAndTimeToMs } from '../utils/dates';
import { ToolDefinition } from '../providers/provider';

export const reminderToolDefinitions: ToolDefinition[] = [
  {
    name: 'create_reminder',
    description: 'Crea un recordatorio en Veyra con fecha, hora y nivel de prioridad.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título del recordatorio' },
        date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
        time: { type: 'string', description: 'Hora en formato HH:MM (opcional)' },
        controlLevel: {
          type: 'string',
          enum: ['normal', 'strict', 'critical'],
          description: 'Nivel de control y alarma de Veyra',
        },
        recurrence: {
          type: 'string',
          enum: ['none', 'daily', 'weekly', 'monthly', 'yearly'],
          description: 'Regla de repetición o periodicidad del recordatorio',
        },
        description: { type: 'string', description: 'Notas o descripción adicional' },
      },
      required: ['title', 'date'],
    },
  },
  {
    name: 'complete_reminder',
    description: 'Marca un recordatorio existente como completado',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID del recordatorio' },
      },
      required: ['id'],
    },
  },
];

export async function executeReminderTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; requiresConfirmation?: boolean; message?: string }> {
  const store = useStore.getState();

  switch (toolName) {
    case 'create_reminder': {
      // 1. Validación estricta con Zod
      const parsed = ReminderIntentSchema.parse(args);
      const dueDateMs = combineDateAndTimeToMs(parsed.date, parsed.time);
      const repeatRule = parsed.recurrence && parsed.recurrence !== 'none'
        ? JSON.stringify({ type: parsed.recurrence })
        : undefined;

      // 2. Ejecutar mediante el store / ReminderService existente de Veyra
      await store.addReminder(
        parsed.title,
        dueDateMs,
        parsed.controlLevel || 'normal',
        parsed.description,
        repeatRule,
        undefined,
        undefined,
        parsed.subtasks ? JSON.stringify(parsed.subtasks) : undefined
      );

      return {
        success: true,
        data: { title: parsed.title, dueDateMs },
        message: `Recordatorio "${parsed.title}" creado con éxito.`,
      };
    }

    case 'complete_reminder': {
      const id = String(args.id);
      await store.markAsCompleted(id);
      return {
        success: true,
        message: 'Recordatorio marcado como completado.',
      };
    }

    case 'update_reminder': {
      const targetId = String(args.targetId || args.id);
      const changes = (args.changes || {}) as Record<string, any>;
      const updates: Record<string, any> = {};

      if (changes.title) updates.title = changes.title;
      if (changes.description !== undefined) updates.description = changes.description;
      if (changes.control_level || changes.controlLevel) {
        updates.control_level = changes.control_level || changes.controlLevel;
      }
      if (changes.repeat_rule || changes.repeatRule) {
        updates.repeat_rule = changes.repeat_rule || changes.repeatRule;
      }

      if (changes.due_date_ms) {
        updates.due_date_ms = changes.due_date_ms;
      } else if (changes.date) {
        const existing = store.reminders.find((r) => r.id === targetId);
        let time = changes.time;
        if (!time && existing?.due_date_ms) {
          const d = new Date(existing.due_date_ms);
          time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }
        updates.due_date_ms = combineDateAndTimeToMs(changes.date, time || '09:00');
      } else if (changes.time) {
        const existing = store.reminders.find((r) => r.id === targetId);
        const baseDate = existing?.due_date_ms ? new Date(existing.due_date_ms) : new Date();
        const dateStr = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(baseDate.getDate()).padStart(2, '0')}`;
        updates.due_date_ms = combineDateAndTimeToMs(dateStr, changes.time);
      }

      await store.updateReminder(targetId, updates);
      return {
        success: true,
        data: { id: targetId, updates },
        message: 'Recordatorio actualizado.',
      };
    }

    case 'batch_update_reminders': {
      const ids = (args.ids || args.targetIds || []) as string[];
      const changes = (args.changes || {}) as Record<string, any>;
      for (const id of ids) {
        const updates: Record<string, any> = {};
        if (changes.title) updates.title = changes.title;
        if (changes.description !== undefined) updates.description = changes.description;
        if (changes.control_level || changes.controlLevel) {
          updates.control_level = changes.control_level || changes.controlLevel;
        }
        if (changes.due_date_ms) {
          updates.due_date_ms = changes.due_date_ms;
        } else if (changes.date) {
          const existing = store.reminders.find((r) => r.id === id);
          let time = changes.time;
          if (!time && existing?.due_date_ms) {
            const d = new Date(existing.due_date_ms);
            time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          }
          updates.due_date_ms = combineDateAndTimeToMs(changes.date, time || '09:00');
        } else if (changes.time) {
          const existing = store.reminders.find((r) => r.id === id);
          const baseDate = existing?.due_date_ms ? new Date(existing.due_date_ms) : new Date();
          const dateStr = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(baseDate.getDate()).padStart(2, '0')}`;
          updates.due_date_ms = combineDateAndTimeToMs(dateStr, changes.time);
        }
        await store.updateReminder(id, updates);
      }
      return {
        success: true,
        data: { count: ids.length },
        message: `${ids.length} recordatorio(s) actualizado(s).`,
      };
    }

    case 'delete_filtered_reminders': {
      const ids = (args.ids || args.targetIds || []) as string[];
      if (ids.length > 0) {
        await store.deleteReminders(ids);
      }
      return {
        success: true,
        data: { count: ids.length },
        message: `${ids.length} recordatorio(s) eliminado(s).`,
      };
    }

    case 'delete_reminder': {
      // Operación destructiva: Requiere confirmación del usuario
      return {
        success: false,
        requiresConfirmation: true,
        message: '¿Estás seguro de que deseas eliminar este recordatorio?',
        data: args,
      };
    }

    default:
      throw new Error(`Tool de recordatorio no reconocida: ${toolName}`);
  }
}
