import { EventService } from '../../../services/eventService';
import { CalendarEvent } from '../../../types/db';
import { format, isSameDay, addDays, startOfDay } from 'date-fns';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function formatDaysList(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  // Lun a Vie (1,2,3,4,5)
  if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) {
    return 'Lunes a Viernes';
  }
  // Fin de semana (0, 6)
  if (sorted.length === 2 && sorted.includes(0) && sorted.includes(6)) {
    return 'Fines de semana';
  }
  // Todos los días
  if (sorted.length === 7) {
    return 'Todos los días';
  }
  return sorted.map(d => DAY_SHORT[d] || `${d}`).join(', ');
}

/**
 * Genera un resumen compacto de la agenda y eventos del usuario para inyectar en el contexto de IA.
 * Incluye eventos recurrentes (ej: horarios de trabajo o clases) y eventos próximos (próximos 14 días).
 */
export async function getAgendaContextSummary(referenceDate: Date = new Date()): Promise<string> {
  try {
    const allEvents = await EventService.getAllEvents(false);
    if (!allEvents || allEvents.length === 0) {
      return '';
    }

    const todayStart = startOfDay(referenceDate).getTime();
    const twoWeeksAhead = addDays(referenceDate, 14).getTime();

    const recurringLines: string[] = [];
    const upcomingLines: string[] = [];

    for (const event of allEvents) {
      if (!event.title) continue;

      const startTimeStr = format(new Date(event.start_time_ms), 'HH:mm');
      const endTimeStr = format(new Date(event.end_time_ms), 'HH:mm');

      // 1. Eventos recurrentes
      if (event.repeat_rule && event.repeat_rule !== 'null') {
        try {
          const rule = JSON.parse(event.repeat_rule);
          if (rule.type === 'weekly' && Array.isArray(rule.days) && rule.days.length > 0) {
            const daysText = formatDaysList(rule.days);
            recurringLines.push(`- [id: ${event.id}] "${event.title}": Recurrente (${daysText}) de ${startTimeStr} a ${endTimeStr}${event.location ? ` en ${event.location}` : ''}`);
            continue;
          } else if (rule.type === 'daily') {
            recurringLines.push(`- [id: ${event.id}] "${event.title}": Recurrente (Todos los días) de ${startTimeStr} a ${endTimeStr}${event.location ? ` en ${event.location}` : ''}`);
            continue;
          }
        } catch {
          // Ignorar error de parsing y tratar como evento puntual
        }
      }

      // 2. Eventos puntuales dentro del rango de 14 días
      const evStartDate = new Date(event.start_time_ms);
      const evStartMs = evStartDate.getTime();
      const evEndMs = event.end_time_ms;

      // Incluir si no ha terminado o está en los próximos 14 días
      if (evEndMs >= todayStart && evStartMs <= twoWeeksAhead) {
        let dayLabel = format(evStartDate, 'yyyy-MM-dd');
        if (isSameDay(evStartDate, referenceDate)) {
          dayLabel = 'Hoy';
        } else if (isSameDay(evStartDate, addDays(referenceDate, 1))) {
          dayLabel = 'Mañana';
        } else {
          dayLabel = `${DAY_NAMES[evStartDate.getDay()]} (${format(evStartDate, 'yyyy-MM-dd')})`;
        }

        upcomingLines.push(`- [id: ${event.id}] "${event.title}": ${dayLabel} de ${startTimeStr} a ${endTimeStr}${event.location ? ` en ${event.location}` : ''}`);
      }
    }

    const lines: string[] = [];
    if (recurringLines.length > 0) {
      lines.push('Horarios fijos y eventos recurrentes del usuario:');
      lines.push(...recurringLines);
    }

    if (upcomingLines.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push('Eventos agendados en el calendario:');
      lines.push(...upcomingLines);
    }

    return lines.join('\n');
  } catch (error) {
    console.warn('[AgendaContext] Error fetching events for AI context:', error);
    return '';
  }
}
