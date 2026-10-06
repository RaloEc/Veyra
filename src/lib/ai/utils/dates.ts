import { format, addDays, addHours, addMinutes, nextDay, Day } from 'date-fns';

/**
 * Utilidades deterministas para cálculo y normalización de fechas y horas.
 * NUNCA confiamos exclusivamente en la conversión del LLM para fechas relativas.
 */

export interface DateTimeContext {
  currentDate: string;    // YYYY-MM-DD
  currentTime: string;    // HH:MM
  timezone: string;       // e.g. America/Lima, America/Mexico_City
  dayOfWeek: string;      // lunes, martes, etc.
  referenceTimestampMs: number;
}

/**
 * Obtiene el contexto actual del dispositivo para inyectarlo en los prompts de IA.
 */
export function buildDateTimeContext(referenceDate: Date = new Date()): DateTimeContext {
  const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return {
    currentDate: format(referenceDate, 'yyyy-MM-dd'),
    currentTime: format(referenceDate, 'HH:mm'),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    dayOfWeek: dayNames[referenceDate.getDay()],
    referenceTimestampMs: referenceDate.getTime(),
  };
}

/**
 * Resuelve expresiones en lenguaje natural a fechas exactas.
 */
export function resolveRelativeExpression(
  expression: string,
  referenceDate: Date = new Date()
): Date | null {
  const norm = expression.toLowerCase().trim();

  if (norm === 'hoy' || norm === 'today') {
    return referenceDate;
  }
  if (norm === 'mañana' || norm === 'tomorrow') {
    return addDays(referenceDate, 1);
  }
  if (norm === 'pasado mañana') {
    return addDays(referenceDate, 2);
  }

  // "en X minutos"
  const minMatch = norm.match(/en\s+(\d+)\s+min/i);
  if (minMatch) {
    const mins = parseInt(minMatch[1], 10);
    return addMinutes(referenceDate, mins);
  }

  // "en X horas"
  const hourMatch = norm.match(/en\s+(\d+)\s+hora/i);
  if (hourMatch) {
    const hrs = parseInt(hourMatch[1], 10);
    return addHours(referenceDate, hrs);
  }

  // Días de la semana
  const daysMap: Record<string, Day> = {
    domingo: 0,
    lunes: 1,
    martes: 2,
    miercoles: 3,
    miércoles: 3,
    jueves: 4,
    viernes: 5,
    sabado: 6,
    sábado: 6,
  };

  for (const [name, dayIndex] of Object.entries(daysMap)) {
    if (norm.includes(name)) {
      return nextDay(referenceDate, dayIndex);
    }
  }

  return null;
}

/**
 * Combina un string de fecha (YYYY-MM-DD) y hora (HH:MM) en timestamp milisegundos.
 */
export function combineDateAndTimeToMs(dateStr: string, timeStr?: string, defaultHour = 9, defaultMinute = 0): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  let hour = defaultHour;
  let minute = defaultMinute;

  if (timeStr && timeStr.includes(':')) {
    const [h, m] = timeStr.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) {
      hour = h;
      minute = m;
    }
  }

  const d = new Date(year, month - 1, day, hour, minute, 0, 0);
  return d.getTime();
}
