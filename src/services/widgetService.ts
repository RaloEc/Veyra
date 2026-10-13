import { NativeModules, Platform } from 'react-native';
import { Reminder, CalendarEvent, Note } from '../types/db';
import { getDB } from '../db';
import { EventService } from './eventService';
import { extractPlainTextFromPages } from '../utils/pageUtils';

const { VeyraWidgetModule } = NativeModules;

export interface WidgetAgendaItem {
    id: string;
    type: 'reminder' | 'event';
    title: string;
    timeMs: number;
    endTimeMs?: number;
    controlLevel?: string;
    status?: string;
    color?: string;
    location?: string;
    priority?: number;
    dayLabel?: string;
}

export function formatDayLabel(timeMs: number): string {
    if (!timeMs) return '';
    const target = new Date(timeMs);
    const now = new Date();

    const isToday = target.getFullYear() === now.getFullYear() &&
                    target.getMonth() === now.getMonth() &&
                    target.getDate() === now.getDate();
    if (isToday) return 'Hoy';

    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = target.getFullYear() === tomorrow.getFullYear() &&
                       target.getMonth() === tomorrow.getMonth() &&
                       target.getDate() === tomorrow.getDate();
    if (isTomorrow) return 'Mañana';

    const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const dayName = DAYS_ES[target.getDay()];
    const dayNum = target.getDate();
    return `${dayName} ${dayNum}`;
}

export interface WidgetNoteItem {
    id: string;
    title: string;
    snippet: string;
    updatedAtMs: number;
    isPinned: boolean;
    color?: string;
}

export interface WidgetScheduleItem {
    id: string;
    subject: string;
    classroom?: string;
    room?: string;
    professor?: string;
    startTime: string; // "08:00"
    endTime: string;   // "09:30"
    dayOfWeek: number; // 1 (Mon) - 7 (Sun)
    color?: string;
    isCurrent?: boolean;
}

/**
 * Limpia el texto HTML, formato paginado o Markdown y extrae un fragmento legible para los widgets
 */
export function createTextSnippet(htmlOrText?: string, maxLength: number = 140): string {
    if (!htmlOrText || typeof htmlOrText !== 'string' || !htmlOrText.trim()) return '';

    // Extrae el texto plano resolviendo formato paginado JSON v1/v2 ({ isPaginated: true, pages: [...] }) o HTML
    const plainFromPages = extractPlainTextFromPages(htmlOrText);
    const target = plainFromPages || htmlOrText;

    let clean = target
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();

    // En caso de que tras procesar quede residuo de JSON por formato inesperado
    if (clean.startsWith('{') && clean.endsWith('}')) {
        try {
            const parsed = JSON.parse(clean);
            if (parsed && typeof parsed === 'object') {
                clean = '';
            }
        } catch {}
    }

    if (clean.length > maxLength) {
        return clean.substring(0, maxLength).trim() + '...';
    }
    return clean;
}

export const WidgetService = {
    /**
     * Comprueba si el módulo nativo del widget está disponible (Android nativo)
     */
    isAvailable(): boolean {
        return Platform.OS === 'android' && Boolean(VeyraWidgetModule);
    },

    /**
     * Sincroniza la Agenda (Recordatorios + Eventos de calendario) con el widget "Hoy"
     */
    async syncAgenda(reminders?: Reminder[], events?: CalendarEvent[]): Promise<boolean> {
        if (!this.isAvailable()) {
            return false;
        }

        try {
            let reminderList: Reminder[];
            if (reminders) {
                reminderList = reminders;
            } else {
                const db = await getDB();
                reminderList = await db.getAllAsync<Reminder>(
                    `SELECT id, title, due_date_ms, control_level, status, priority, deleted
                     FROM reminders 
                     WHERE (status = 'pending' OR status = 'snoozed') AND deleted = 0 
                     ORDER BY due_date_ms ASC 
                     LIMIT 20`
                );
            }

            let eventList: CalendarEvent[];
            const nowMs = Date.now();
            const sevenDaysLater = nowMs + 7 * 24 * 60 * 60 * 1000;

            const isEventActive = (e: CalendarEvent): boolean => {
                if (e.deleted) return false;
                const end = (e.end_time_ms && e.end_time_ms > e.start_time_ms)
                    ? e.end_time_ms
                    : (e.start_time_ms + 60 * 60 * 1000);
                // Excluir eventos que ya pasaron (terminados antes de ahora)
                return end >= nowMs && e.start_time_ms <= sevenDaysLater;
            };

            if (events) {
                eventList = events.filter(isEventActive);
            } else {
                try {
                    const allEvents = await EventService.getAllEvents();
                    eventList = allEvents.filter(isEventActive);
                } catch {
                    const todayEvents = await EventService.getEventsForDate(new Date());
                    eventList = todayEvents.filter(isEventActive);
                }
            }

            const reminderItems: WidgetAgendaItem[] = reminderList
                .filter(r => !r.deleted && (r.status === 'pending' || r.status === 'snoozed'))
                .map(r => ({
                    id: r.id,
                    type: 'reminder' as const,
                    title: r.title,
                    timeMs: r.due_date_ms,
                    controlLevel: r.control_level || 'normal',
                    status: r.status,
                    priority: r.priority ?? 1,
                    dayLabel: formatDayLabel(r.due_date_ms),
                }));

            const eventItems: WidgetAgendaItem[] = eventList
                .filter(e => !e.deleted)
                .map(e => ({
                    id: e.id,
                    type: 'event' as const,
                    title: e.title,
                    timeMs: e.start_time_ms,
                    endTimeMs: e.end_time_ms,
                    color: e.color || '',
                    location: e.location || '',
                    status: 'confirmed',
                    dayLabel: formatDayLabel(e.start_time_ms),
                }));

            // Determinar si un evento está cursando (en curso ahora mismo)
            const isOngoing = (item: WidgetAgendaItem): boolean => {
                if (item.type !== 'event') return false;
                const end = (item.endTimeMs && item.endTimeMs > item.timeMs)
                    ? item.endTimeMs
                    : (item.timeMs + 60 * 60 * 1000);
                return nowMs >= item.timeMs && nowMs <= end;
            };

            // Combinar y ordenar: primero los cursando (en curso), luego el resto cronológicamente
            const combinedAgenda: WidgetAgendaItem[] = [...reminderItems, ...eventItems].sort((a, b) => {
                const aOngoing = isOngoing(a) ? 0 : 1;
                const bOngoing = isOngoing(b) ? 0 : 1;
                if (aOngoing !== bOngoing) return aOngoing - bOngoing;
                return a.timeMs - b.timeMs;
            }).slice(0, 25);

            await VeyraWidgetModule.syncAgendaData(combinedAgenda);

            try {
                const { useStore } = await import('../store/useStore');
                const store = useStore.getState();
                const currentTheme = store.theme || 'system';
                const currentAccent = store.accentTheme || 'blue';
                await this.syncTheme(currentTheme, currentAccent);
            } catch {}

            return true;
        } catch (error) {
            console.warn('[WidgetService] Error sincronizando agenda con el widget:', error);
            return false;
        }
    },

    /**
     * Sincroniza las notas recientes y ancladas con el widget de Notas
     */
    async syncNotes(notes?: Note[]): Promise<boolean> {
        if (!this.isAvailable()) {
            return false;
        }

        try {
            let noteList: Note[];
            if (notes) {
                noteList = notes;
            } else {
                const db = await getDB();
                noteList = await db.getAllAsync<Note>(
                    `SELECT id, title, content, attachments, updated_at_ms, is_pinned
                     FROM notes 
                     WHERE deleted = 0 
                     ORDER BY is_pinned DESC, updated_at_ms DESC 
                     LIMIT 15`
                );
            }

            const payload: WidgetNoteItem[] = noteList
                .filter(n => !n.deleted)
                .slice(0, 12)
                .map(n => {
                    let snippet = createTextSnippet(n.content, 140);
                    if (!snippet && n.attachments) {
                        try {
                            const att = JSON.parse(n.attachments);
                            if (Array.isArray(att) && att.length > 0) {
                                snippet = `📎 ${att.length} archivo${att.length > 1 ? 's' : ''}`;
                            }
                        } catch {}
                    }
                    return {
                        id: n.id,
                        title: n.title?.trim() || 'Sin título',
                        snippet,
                        updatedAtMs: n.updated_at_ms || Date.now(),
                        isPinned: Boolean(n.is_pinned),
                        color: '',
                    };
                });

            if (typeof VeyraWidgetModule.syncNotesData === 'function') {
                await VeyraWidgetModule.syncNotesData(payload);
            }

            return true;
        } catch (error) {
            console.warn('[WidgetService] Error sincronizando notas con el widget:', error);
            return false;
        }
    },

    /**
     * Sincroniza todo (Agenda + Notas + Horario)
     */
    async syncAll(): Promise<boolean> {
        const [agendaOk, notesOk, scheduleOk] = await Promise.all([
            this.syncAgenda(),
            this.syncNotes(),
            this.syncSchedule()
        ]);
        return agendaOk && notesOk && scheduleOk;
    },

    /**
     * Compatibilidad hacia atrás: actualiza la agenda
     */
    async sync(reminders?: Reminder[]): Promise<boolean> {
        return this.syncAgenda(reminders);
    },

    /**
     * Procesa las acciones realizadas desde el widget (por ej. completar tareas con el check ✓)
     * mientras la app estaba cerrada o en segundo plano, actualizando la base de datos y cancelando alarmas.
     */
    async processPendingActions(): Promise<void> {
        if (!this.isAvailable()) return;
        try {
            if (typeof VeyraWidgetModule.getPendingCompletions === 'function') {
                const pendingIds: string[] = await VeyraWidgetModule.getPendingCompletions();
                if (pendingIds && pendingIds.length > 0) {
                    const { useStore } = await import('../store/useStore');
                    for (const id of pendingIds) {
                        try {
                            await useStore.getState().markAsCompleted(id);
                        } catch (err) {
                            console.warn('[WidgetService] Error completando recordatorio pendiente del widget:', id, err);
                        }
                    }
                    if (typeof VeyraWidgetModule.clearPendingCompletions === 'function') {
                        await VeyraWidgetModule.clearPendingCompletions();
                    }
                }
            }
        } catch (error) {
            console.warn('[WidgetService] Error procesando acciones pendientes del widget:', error);
        }
    },

    /**
     * Sincroniza el modo de tema ('system', 'light', 'dark') y color de acento con todos los widgets nativos
     */
    async syncTheme(themeMode?: 'system' | 'light' | 'dark', accentTheme?: string): Promise<boolean> {
        if (!this.isAvailable()) {
            return false;
        }

        try {
            const mode = themeMode || 'system';
            let ok = true;
            if (typeof VeyraWidgetModule.setWidgetTheme === 'function') {
                ok = await VeyraWidgetModule.setWidgetTheme(mode);
            }
            if (accentTheme && typeof VeyraWidgetModule.setWidgetAccentTheme === 'function') {
                await VeyraWidgetModule.setWidgetAccentTheme(accentTheme);
            }
            return ok;
        } catch (error) {
            console.warn('[WidgetService] Error sincronizando tema con el widget:', error);
            return false;
        }
    },

    /**
     * Establece la escala del tamaño de texto de los widgets (0.85 = Compacto, 1.0 = Normal, 1.15 = Grande, 1.30 = Extra)
     */
    async setTextScale(scale: number): Promise<boolean> {
        if (!this.isAvailable()) {
            return false;
        }

        try {
            if (typeof VeyraWidgetModule.setWidgetTextScale === 'function') {
                return await VeyraWidgetModule.setWidgetTextScale(scale);
            }
            return false;
        } catch (error) {
            console.warn('[WidgetService] Error estableciendo escala de texto:', error);
            return false;
        }
    },

    /**
     * Habilita o deshabilita el modo de alto contraste para los widgets
     */
    async setHighContrast(enabled: boolean): Promise<boolean> {
        if (!this.isAvailable()) {
            return false;
        }

        try {
            if (typeof VeyraWidgetModule.setWidgetHighContrast === 'function') {
                return await VeyraWidgetModule.setWidgetHighContrast(enabled);
            }
            return false;
        } catch (error) {
            console.warn('[WidgetService] Error estableciendo alto contraste:', error);
            return false;
        }
    },

    /**
     * Sincroniza las preferencias de accesibilidad (escala de texto y alto contraste)
     */
    async syncAccessibility(scale: number = 1.0, highContrast: boolean = false): Promise<boolean> {
        if (!this.isAvailable()) {
            return false;
        }

        try {
            await this.setTextScale(scale);
            await this.setHighContrast(highContrast);
            return true;
        } catch (error) {
            console.warn('[WidgetService] Error sincronizando accesibilidad de widgets:', error);
            return false;
        }
    },

    /**
     * Obtiene la configuración actual de los widgets desde SharedPreferences nativo
     */
    async getWidgetConfig(): Promise<{ textScale: number; highContrast: boolean; themeMode: string; accentTheme: string } | null> {
        if (!this.isAvailable()) {
            return null;
        }

        try {
            if (typeof VeyraWidgetModule.getWidgetConfig === 'function') {
                return await VeyraWidgetModule.getWidgetConfig();
            }
            return null;
        } catch (error) {
            console.warn('[WidgetService] Error obteniendo configuración de widgets:', error);
            return null;
        }
    },

    /**
     * Solicita una actualización visual inmediata de todos los widgets
     */
    async refresh(): Promise<boolean> {
        if (!this.isAvailable()) {
            return false;
        }

        try {
            return await VeyraWidgetModule.refreshWidget();
        } catch (error) {
            console.warn('[WidgetService] Error refrescando widgets:', error);
            return false;
        }
    },

    /**
     * Solicita refrescar el widget de notas
     */
    async refreshNotes(): Promise<boolean> {
        if (!this.isAvailable()) {
            return false;
        }

        try {
            if (typeof VeyraWidgetModule.refreshNotesWidget === 'function') {
                return await VeyraWidgetModule.refreshNotesWidget();
            }
            return false;
        } catch (error) {
            console.warn('[WidgetService] Error refrescando el widget de notas:', error);
            return false;
        }
    },

    /**
     * Solicita al sistema anclar el widget de Hoy en la pantalla de inicio (Android 8.0+)
     */
    async requestPin(): Promise<boolean> {
        if (!this.isAvailable()) {
            return false;
        }

        try {
            return await VeyraWidgetModule.requestPinWidget();
        } catch (error) {
            console.warn('[WidgetService] Error solicitando anclar el widget:', error);
            return false;
        }
    },

    /**
     * Solicita al sistema anclar el widget de Notas en la pantalla de inicio (Android 8.0+)
     */
    async requestPinNotes(): Promise<boolean> {
        if (!this.isAvailable()) {
            return false;
        }

        try {
            if (typeof VeyraWidgetModule.requestPinNotesWidget === 'function') {
                return await VeyraWidgetModule.requestPinNotesWidget();
            }
            return false;
        } catch (error) {
            console.warn('[WidgetService] Error solicitando anclar el widget de notas:', error);
            return false;
        }
    },

    /**
     * Solicita al sistema anclar el widget Combinado (Agenda + Notas) en la pantalla de inicio (Android 8.0+)
     */
    async requestPinCombo(): Promise<boolean> {
        if (!this.isAvailable()) {
            return false;
        }

        try {
            if (typeof VeyraWidgetModule.requestPinComboWidget === 'function') {
                return await VeyraWidgetModule.requestPinComboWidget();
            }
            return false;
        } catch (error) {
            console.warn('[WidgetService] Error solicitando anclar el widget combinado:', error);
            return false;
        }
    },

    /**
     * Solicita al sistema anclar el widget de Acciones Rápidas en la pantalla de inicio (Android 8.0+)
     */
    async requestPinQuick(): Promise<boolean> {
        if (!this.isAvailable()) {
            return false;
        }

        try {
            if (typeof VeyraWidgetModule.requestPinQuickWidget === 'function') {
                return await VeyraWidgetModule.requestPinQuickWidget();
            }
            return false;
        } catch (error) {
            console.warn('[WidgetService] Error solicitando anclar el widget de acciones rápidas:', error);
            return false;
        }
    },

    /**
     * Sincroniza el horario de clases con el widget de Horario
     */
    async syncSchedule(items?: WidgetScheduleItem[]): Promise<boolean> {
        if (!this.isAvailable()) {
            return false;
        }

        try {
            let scheduleList = items;
            if (!scheduleList) {
                // Extracción de clases desde eventos y recordatorios con #clase
                const pad = (n: number) => n.toString().padStart(2, '0');

                const isClassTagged = (tags?: string, title?: string, description?: string): boolean => {
                    if (tags) {
                        try {
                            const parsed = JSON.parse(tags);
                            if (Array.isArray(parsed)) {
                                if (parsed.some(t => typeof t === 'string' && t.trim().toLowerCase().replace(/^#/, '') === 'clase')) {
                                    return true;
                                }
                            } else if (typeof parsed === 'string') {
                                if (parsed.trim().toLowerCase().replace(/^#/, '') === 'clase') {
                                    return true;
                                }
                            }
                        } catch {
                            if (tags.toLowerCase().replace(/#/g, '').includes('clase')) return true;
                        }
                    }
                    const text = `${title || ''} ${description || ''}`.toLowerCase();
                    return /(?:^|\s|[#])clase(?:s)?\b/i.test(text);
                };

                const getScheduleIsoDays = (startMs: number, repeatRuleStr?: string): number[] => {
                    const start = new Date(startMs);
                    const defaultIso = start.getDay() === 0 ? 7 : start.getDay();

                    if (!repeatRuleStr || repeatRuleStr === 'null') {
                        return [defaultIso];
                    }

                    try {
                        const rr = typeof repeatRuleStr === 'object' ? repeatRuleStr : JSON.parse(repeatRuleStr);
                        if (rr) {
                            if (rr.type === 'daily') {
                                return [1, 2, 3, 4, 5, 6, 7];
                            }
                            if (rr.type === 'weekdays') {
                                return [1, 2, 3, 4, 5];
                            }
                            if (rr.type === 'weekly') {
                                if (Array.isArray(rr.days) && rr.days.length > 0) {
                                    return rr.days.map((d: number) => (d === 0 ? 7 : d));
                                }
                                return [defaultIso];
                            }
                        }
                    } catch {}

                    return [defaultIso];
                };

                const cleanSubject = (rawTitle: string): string => {
                    const cleaned = rawTitle.replace(/#clase(?:s)?\b/gi, '').trim();
                    return cleaned.length > 0 ? cleaned : rawTitle.trim();
                };

                scheduleList = [];

                // 1. Clases desde Eventos
                try {
                    const allEvents = await EventService.getAllEvents();
                    const classEvents = allEvents.filter(e => !e.deleted && isClassTagged(e.tags, e.title, e.description));

                    for (const e of classEvents) {
                        const start = new Date(e.start_time_ms);
                        const end = new Date(e.end_time_ms && e.end_time_ms > e.start_time_ms ? e.end_time_ms : e.start_time_ms + 50 * 60 * 1000);
                        const startTime = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
                        const endTime = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
                        const isoDays = getScheduleIsoDays(e.start_time_ms, e.repeat_rule);

                        for (const dayIso of isoDays) {
                            scheduleList.push({
                                id: isoDays.length > 1 ? `${e.id}_${dayIso}` : e.id,
                                subject: cleanSubject(e.title),
                                classroom: e.location || '',
                                room: e.location || '',
                                professor: '',
                                dayOfWeek: dayIso,
                                startTime,
                                endTime,
                                color: e.color || '',
                            });
                        }
                    }
                } catch (eventErr) {
                    console.warn('[WidgetService] Error cargando eventos para horario:', eventErr);
                }

                // 2. Clases desde Recordatorios (si el usuario los categorizó con #clase)
                try {
                    const db = await getDB();
                    const activeReminders = await db.getAllAsync<Reminder>(
                        `SELECT * FROM reminders WHERE deleted = 0 AND (status = 'pending' OR status = 'snoozed')`
                    );
                    const classReminders = activeReminders.filter(r => isClassTagged(undefined, r.title, r.description));

                    for (const r of classReminders) {
                        const start = new Date(r.due_date_ms);
                        const end = new Date(r.due_date_ms + 50 * 60 * 1000);
                        const startTime = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
                        const endTime = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
                        const isoDays = getScheduleIsoDays(r.due_date_ms, r.repeat_rule);

                        for (const dayIso of isoDays) {
                            scheduleList.push({
                                id: isoDays.length > 1 ? `${r.id}_${dayIso}` : r.id,
                                subject: cleanSubject(r.title),
                                classroom: '',
                                room: '',
                                professor: '',
                                dayOfWeek: dayIso,
                                startTime,
                                endTime,
                                color: '',
                            });
                        }
                    }
                } catch (remErr) {
                    console.warn('[WidgetService] Error cargando recordatorios para horario:', remErr);
                }
            }
            if (typeof VeyraWidgetModule.syncScheduleData === 'function') {
                return await VeyraWidgetModule.syncScheduleData(scheduleList || []);
            }
            return false;
        } catch (error) {
            console.warn('[WidgetService] Error sincronizando horario con el widget:', error);
            return false;
        }
    },

    /**
     * Solicita al sistema anclar el widget de Horario de Clases en la pantalla de inicio (Android 8.0+)
     */
    async requestPinSchedule(): Promise<boolean> {
        if (!this.isAvailable()) {
            return false;
        }

        try {
            if (typeof VeyraWidgetModule.requestPinScheduleWidget === 'function') {
                return await VeyraWidgetModule.requestPinScheduleWidget();
            }
            return false;
        } catch (error) {
            console.warn('[WidgetService] Error solicitando anclar el widget de horario:', error);
            return false;
        }
    }
};
