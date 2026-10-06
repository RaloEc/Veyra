import { ReminderService } from '../../../services/reminderService';
import { format, isSameDay, addDays } from 'date-fns';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Genera un resumen compacto de los recordatorios del usuario para inyectar en el contexto de IA
 * cuando se solicitan modificaciones o eliminaciones mediante lenguaje natural.
 */
export async function getRemindersContextSummary(
  referenceDate: Date = new Date(),
  maxPending = 50,
  maxCompleted = 20
): Promise<string> {
  try {
    const pendingReminders = await ReminderService.getReminders('pending');
    const historyReminders = await ReminderService.getHistory(maxCompleted, 0);

    const pendingLines: string[] = [];
    const completedLines: string[] = [];

    // 1. Recordatorios pendientes / pospuestos
    const itemsToProcess = (pendingReminders || []).slice(0, maxPending);
    for (const rem of itemsToProcess) {
      if (!rem.title) continue;

      const dueDate = new Date(rem.due_date_ms);
      const timeStr = format(dueDate, 'HH:mm');

      let dateLabel = format(dueDate, 'yyyy-MM-dd');
      if (isSameDay(dueDate, referenceDate)) {
        dateLabel = 'Hoy';
      } else if (isSameDay(dueDate, addDays(referenceDate, 1))) {
        dateLabel = 'Mañana';
      } else {
        dateLabel = `${DAY_NAMES[dueDate.getDay()]} (${format(dueDate, 'yyyy-MM-dd')})`;
      }

      const statusTag = rem.status === 'snoozed' ? ' [pospuesto]' : '';
      pendingLines.push(
        `- [id: ${rem.id}] "${rem.title}" — ${dateLabel} a las ${timeStr} · nivel: ${rem.control_level}${statusTag}${rem.description ? ` · "${rem.description}"` : ''}`
      );
    }

    // 2. Recordatorios completados recientemente (para operaciones como "elimina los completados")
    const completedItems = (historyReminders || []).filter((r) => r.status === 'completed');
    for (const rem of completedItems) {
      if (!rem.title) continue;
      const modifiedDate = new Date(rem.last_modified_ms);
      completedLines.push(
        `- [id: ${rem.id}] "${rem.title}" — Completado el ${format(modifiedDate, 'yyyy-MM-dd HH:mm')}`
      );
    }

    const sections: string[] = [];
    if (pendingLines.length > 0) {
      sections.push('RECORDATORIOS PENDIENTES DEL USUARIO:');
      sections.push(...pendingLines);
    } else {
      sections.push('RECORDATORIOS PENDIENTES: Ninguno.');
    }

    if (completedLines.length > 0) {
      sections.push('');
      sections.push('RECORDATORIOS RECIENTEMENTE COMPLETADOS:');
      sections.push(...completedLines);
    }

    return sections.join('\n');
  } catch (error) {
    console.warn('[RemindersContext] Error fetching reminders for AI context:', error);
    return '';
  }
}
