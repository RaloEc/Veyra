import { Reminder, CalendarEvent } from '../types/db';
import { WidgetService } from '../services/widgetService';
import { getDB } from '../db';
import { EventService } from '../services/eventService';

/**
 * Helper para forzar la actualización inmediata del widget "Hoy" (VeyraWidget).
 *
 * NOTA DE ARQUITECTURA:
 * En Veyra, los widgets de inicio no se construyen con la librería de terceros
 * 'react-native-android-widget' (la cual renderiza componentes React a imágenes estáticas),
 * sino que están implementados con Android Jetpack Glance nativo (androidx.glance.appwidget / VeyraWidget.kt).
 * La llamada nativa equivalente a `requestWidgetUpdate` es `VeyraWidget().updateAll(appContext)`,
 * la cual es invocada de inmediato por WidgetService a través de VeyraWidgetModule.
 */

/**
 * Fuerza la actualización inmediata del widget "Hoy" con los recordatorios y eventos actuales.
 * Si no se proveen listas, consulta directamente la base de datos SQLite para garantizar
 * que se envíen los datos más recientes sin depender de estados en memoria ni debounces.
 */
export async function updateTodayWidget(
    reminders?: Reminder[],
    events?: CalendarEvent[]
): Promise<boolean> {
    try {
        let finalReminders = reminders;
        let finalEvents = events;

        // Si no se pasaron recordatorios, consultar SQLite directamente
        if (!finalReminders) {
            try {
                const db = await getDB();
                finalReminders = await db.getAllAsync<Reminder>(
                    `SELECT id, title, due_date_ms, control_level, status, priority, deleted
                     FROM reminders 
                     WHERE (status = 'pending' OR status = 'snoozed') AND deleted = 0 
                     ORDER BY due_date_ms ASC 
                     LIMIT 50`
                );
            } catch (err) {
                console.warn('[widgetUpdater] Error consultando recordatorios para widget:', err);
            }
        }

        // Si no se pasaron eventos, consultar EventService directamente
        if (!finalEvents) {
            try {
                finalEvents = await EventService.getAllEvents(false);
            } catch (err) {
                console.warn('[widgetUpdater] Error consultando eventos para widget:', err);
            }
        }

        // Ejecutar sincronización inmediata sin debounce (updateAll nativo)
        const ok = await WidgetService.executeSyncAgenda(finalReminders, finalEvents);
        
        // Mantener sincronizado el widget de horario
        WidgetService.syncSchedule().catch(() => {});

        return ok;
    } catch (error) {
        console.warn('[widgetUpdater] Error al forzar actualización del widget Hoy:', error);
        return false;
    }
}

/**
 * Fuerza la actualización del tema y colores en el widget "Hoy" y todos los widgets nativos.
 */
export async function updateWidgetTheme(
    themeMode?: 'system' | 'light' | 'dark',
    accentTheme?: string,
    amoled?: boolean
): Promise<boolean> {
    try {
        const ok = await WidgetService.syncTheme(themeMode, accentTheme, amoled);
        await WidgetService.refresh();
        return ok;
    } catch (error) {
        console.warn('[widgetUpdater] Error al actualizar tema del widget:', error);
        return false;
    }
}

/**
 * Sincroniza y fuerza el refresco de todos los widgets activos
 */
export async function forceWidgetRefresh(): Promise<boolean> {
    try {
        await updateTodayWidget();
        return await WidgetService.refresh();
    } catch (error) {
        console.warn('[widgetUpdater] Error al refrescar widgets:', error);
        return false;
    }
}
