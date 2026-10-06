import { useEventsStore } from '../../../store/useEventsStore';
import { EventIntentSchema } from '../schemas';
import { combineDateAndTimeToMs } from '../utils/dates';
import { ToolDefinition } from '../providers/provider';

export const eventToolDefinitions: ToolDefinition[] = [
  {
    name: 'create_event',
    description: 'Crea un nuevo evento o cita en el calendario de Veyra con rango horario.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título del evento' },
        date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
        startTime: { type: 'string', description: 'Hora de inicio en formato HH:MM' },
        endTime: { type: 'string', description: 'Hora de término en formato HH:MM' },
        location: { type: 'string', description: 'Ubicación física o enlace' },
        description: { type: 'string', description: 'Detalles del evento' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Etiquetas o categorías del evento (ej: ["clase", "universidad"])' },
      },
      required: ['title', 'date', 'startTime', 'endTime'],
    },
  },
];

export async function executeEventTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; requiresConfirmation?: boolean; message?: string }> {
  const eventsStore = useEventsStore.getState();

  switch (toolName) {
    case 'create_event': {
      const parsed = EventIntentSchema.parse(args);
      const startMs = combineDateAndTimeToMs(parsed.date, parsed.startTime);
      const endMs = combineDateAndTimeToMs(parsed.date, parsed.endTime);
      const tagsStr = parsed.tags && parsed.tags.length > 0 ? JSON.stringify(parsed.tags) : undefined;

      await eventsStore.createEvent({
        title: parsed.title,
        startTimeMs: startMs,
        endTimeMs: endMs,
        location: parsed.location,
        description: parsed.description,
        color: parsed.color,
        repeatRule: parsed.repeatRule,
        tags: tagsStr,
      });

      return {
        success: true,
        data: { title: parsed.title, startMs, endMs, tags: parsed.tags },
        message: `Evento "${parsed.title}" programado correctamente.`,
      };
    }

    case 'update_event': {
      const targetId = String(args.targetId || args.id);
      const changes = (args.changes || {}) as Record<string, any>;
      const updates: Record<string, any> = {};

      if (changes.title) updates.title = changes.title;
      if (changes.location !== undefined) updates.location = changes.location;
      if (changes.description !== undefined) updates.description = changes.description;
      if (changes.tags !== undefined) {
        updates.tags = Array.isArray(changes.tags) ? JSON.stringify(changes.tags) : changes.tags;
      }
      if (changes.repeatRule || changes.repeat_rule) {
        updates.repeat_rule = changes.repeatRule || changes.repeat_rule;
      }

      const existing = eventsStore.events.find((e) => e.id === targetId);

      if (changes.start_time_ms) {
        updates.start_time_ms = changes.start_time_ms;
      } else if (changes.startTime || changes.date) {
        const baseDate = existing?.start_time_ms ? new Date(existing.start_time_ms) : new Date();
        const dateStr = changes.date || `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(baseDate.getDate()).padStart(2, '0')}`;
        let startH = changes.startTime;
        if (!startH && existing?.start_time_ms) {
          const d = new Date(existing.start_time_ms);
          startH = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }
        updates.start_time_ms = combineDateAndTimeToMs(dateStr, startH || '09:00');
      }

      if (changes.end_time_ms) {
        updates.end_time_ms = changes.end_time_ms;
      } else if (changes.endTime || changes.date) {
        const baseDate = existing?.end_time_ms ? new Date(existing.end_time_ms) : new Date();
        const dateStr = changes.date || `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(baseDate.getDate()).padStart(2, '0')}`;
        let endH = changes.endTime;
        if (!endH && existing?.end_time_ms) {
          const d = new Date(existing.end_time_ms);
          endH = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }
        updates.end_time_ms = combineDateAndTimeToMs(dateStr, endH || '10:00');
      }

      await eventsStore.updateEvent(targetId, updates);
      return {
        success: true,
        data: { id: targetId, updates },
        message: 'Evento actualizado.',
      };
    }

    case 'batch_update_events': {
      const ids = (args.ids || args.targetIds || []) as string[];
      const changes = (args.changes || {}) as Record<string, any>;
      for (const id of ids) {
        const updates: Record<string, any> = {};
        if (changes.title) updates.title = changes.title;
        if (changes.location !== undefined) updates.location = changes.location;
        if (changes.description !== undefined) updates.description = changes.description;
        if (changes.tags !== undefined) {
          updates.tags = Array.isArray(changes.tags) ? JSON.stringify(changes.tags) : changes.tags;
        }

        const existing = eventsStore.events.find((e) => e.id === id);

        if (changes.date || changes.startTime) {
          const baseDate = existing?.start_time_ms ? new Date(existing.start_time_ms) : new Date();
          const dateStr = changes.date || `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(baseDate.getDate()).padStart(2, '0')}`;
          let startH = changes.startTime;
          if (!startH && existing?.start_time_ms) {
            const d = new Date(existing.start_time_ms);
            startH = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          }
          updates.start_time_ms = combineDateAndTimeToMs(dateStr, startH || '09:00');
        }

        if (changes.date || changes.endTime) {
          const baseDate = existing?.end_time_ms ? new Date(existing.end_time_ms) : new Date();
          const dateStr = changes.date || `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(baseDate.getDate()).padStart(2, '0')}`;
          let endH = changes.endTime;
          if (!endH && existing?.end_time_ms) {
            const d = new Date(existing.end_time_ms);
            endH = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          }
          updates.end_time_ms = combineDateAndTimeToMs(dateStr, endH || '10:00');
        }

        await eventsStore.updateEvent(id, updates);
      }
      return {
        success: true,
        data: { count: ids.length },
        message: `${ids.length} evento(s) actualizado(s).`,
      };
    }

    case 'delete_filtered_events': {
      const ids = (args.ids || args.targetIds || []) as string[];
      for (const id of ids) {
        await eventsStore.deleteEvent(id);
      }
      return {
        success: true,
        data: { count: ids.length },
        message: `${ids.length} evento(s) eliminado(s).`,
      };
    }

    default:
      throw new Error(`Tool de evento no reconocida: ${toolName}`);
  }
}
