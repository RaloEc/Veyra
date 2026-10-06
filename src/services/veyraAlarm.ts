import { NativeModules, Platform } from 'react-native';

const { VeyraAlarmModule } = NativeModules;

export interface VeyraAlarmPayload {
    id: string;
    triggerAt: number; // timestamp in milliseconds
    title: string;
    description?: string;
    sound?: string;
    controlLevel?: string;
}

export const VeyraAlarm = {
    /**
     * Comprueba si el módulo nativo está disponible (solo Android nativo)
     */
    isAvailable(): boolean {
        return Platform.OS === 'android' && Boolean(VeyraAlarmModule);
    },

    /**
     * Programa una alarma exacta que despierta el dispositivo mediante AlarmManager
     */
    async schedule(params: VeyraAlarmPayload): Promise<boolean> {
        if (!this.isAvailable()) {
            return false;
        }
        try {
            return await VeyraAlarmModule.schedule({
                id: params.id,
                triggerAt: params.triggerAt,
                title: params.title,
                description: params.description || '',
                sound: params.sound || 'alarma_fuego.mp3',
                controlLevel: params.controlLevel || 'critical',
            });
        } catch (error) {
            console.warn('[VeyraAlarm] Error programando alarma nativa:', error);
            return false;
        }
    },

    /**
     * Cancela la alarma nativa y su notificación asociada
     */
    async cancel(alarmId: string): Promise<boolean> {
        if (!this.isAvailable()) {
            return false;
        }
        try {
            return await VeyraAlarmModule.cancel(alarmId);
        } catch (error) {
            console.warn('[VeyraAlarm] Error cancelando alarma nativa:', error);
            return false;
        }
    },

    /**
     * Comprueba si el sistema tiene permitido programar alarmas exactas (Android 12+)
     */
    async canScheduleExactAlarms(): Promise<boolean> {
        if (!this.isAvailable()) {
            return true;
        }
        try {
            return await VeyraAlarmModule.canScheduleExactAlarms();
        } catch {
            return true;
        }
    },

    /**
     * Comprueba si el sistema permite usar Full Screen Intent (Android 14+)
     */
    async canUseFullScreenIntent(): Promise<boolean> {
        if (!this.isAvailable()) {
            return true;
        }
        try {
            return await VeyraAlarmModule.canUseFullScreenIntent();
        } catch {
            return true;
        }
    },

    /**
     * Abre los ajustes del sistema para conceder permiso de alarmas exactas si fue revocado
     */
    async openExactAlarmSettings(): Promise<boolean> {
        if (!this.isAvailable()) {
            return false;
        }
        try {
            return await VeyraAlarmModule.openExactAlarmSettings();
        } catch {
            return false;
        }
    },

    /**
     * Abre los ajustes del sistema para conceder Full Screen Intent (Android 14+)
     */
    async openFullScreenIntentSettings(): Promise<boolean> {
        if (!this.isAvailable()) {
            return false;
        }
        try {
            return await VeyraAlarmModule.openFullScreenIntentSettings();
        } catch {
            return false;
        }
    },

    /**
     * Obtiene la lista de alarmas activas guardadas en el store nativo
     */
    async getActiveAlarms(): Promise<VeyraAlarmPayload[]> {
        if (!this.isAvailable()) {
            return [];
        }
        try {
            return await VeyraAlarmModule.getActiveAlarms();
        } catch {
            return [];
        }
    },

    /**
     * Activa los flags de pantalla de bloqueo de la Activity (showWhenLocked, turnScreenOn)
     */
    async setLockScreenFlags(): Promise<boolean> {
        if (!this.isAvailable() || typeof VeyraAlarmModule.setLockScreenFlags !== 'function') {
            return false;
        }
        try {
            return await VeyraAlarmModule.setLockScreenFlags();
        } catch {
            return false;
        }
    },

    /**
     * Limpia los flags de pantalla de bloqueo de la Activity para restaurar la barra de navegación estándar
     */
    async clearLockScreenFlags(): Promise<boolean> {
        if (!this.isAvailable() || typeof VeyraAlarmModule.clearLockScreenFlags !== 'function') {
            return false;
        }
        try {
            return await VeyraAlarmModule.clearLockScreenFlags();
        } catch {
            return false;
        }
    },

    /**
     * Verifica si la app tiene permiso para mostrarse sobre otras apps (SYSTEM_ALERT_WINDOW)
     */
    async canDrawOverlays(): Promise<boolean> {
        if (!this.isAvailable() || typeof VeyraAlarmModule.canDrawOverlays !== 'function') {
            return true;
        }
        try {
            return await VeyraAlarmModule.canDrawOverlays();
        } catch {
            return false;
        }
    },

    /**
     * Abre los ajustes del sistema para conceder permiso de mostrarse sobre otras apps
     */
    async openOverlaySettings(): Promise<boolean> {
        if (!this.isAvailable() || typeof VeyraAlarmModule.openOverlaySettings !== 'function') {
            return false;
        }
        try {
            return await VeyraAlarmModule.openOverlaySettings();
        } catch {
            return false;
        }
    },

    /**
     * Comprueba si la app tiene activada la excepción de optimización de batería (sin restricciones)
     */
    async isIgnoringBatteryOptimizations(): Promise<boolean> {
        if (!this.isAvailable() || typeof VeyraAlarmModule.isIgnoringBatteryOptimizations !== 'function') {
            return false;
        }
        try {
            return await VeyraAlarmModule.isIgnoringBatteryOptimizations();
        } catch {
            return false;
        }
    },

    /**
     * Abre el diálogo del sistema para solicitar excluir a Veyra de las restricciones de batería
     */
    async requestIgnoreBatteryOptimizations(): Promise<boolean> {
        if (!this.isAvailable() || typeof VeyraAlarmModule.requestIgnoreBatteryOptimizations !== 'function') {
            return false;
        }
        try {
            return await VeyraAlarmModule.requestIgnoreBatteryOptimizations();
        } catch {
            return false;
        }
    },
};
