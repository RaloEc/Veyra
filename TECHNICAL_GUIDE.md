# 🔧 Guía Técnica de Implementación - Veyra

## 📋 Resumen de Mejoras Implementadas

Este documento describe las mejoras críticas implementadas basadas en las mejores prácticas de 2025-2026 para sistemas de notificaciones insistentes en React Native + Expo.

---

## 1. Sistema de Notificaciones Mejorado

### ✅ Problema Resuelto
**Antes:** Las notificaciones se programaban sin guardar sus IDs, lo que hacía imposible cancelarlas de forma eficiente.

**Ahora:** Implementamos el patrón recomendado de **tracking de notification IDs**.

### 🔧 Cambios Implementados

#### 1.1 Base de Datos
- Agregado campo `notification_ids` (TEXT/JSON) a la tabla `reminders`
- Migración automática para bases de datos existentes

```typescript
// src/db/index.ts
ALTER TABLE reminders ADD COLUMN notification_ids TEXT;
```

#### 1.2 Servicio de Notificaciones
- `scheduleReminderNotification()` ahora **retorna** un array de IDs
- `cancelNotificationsForReminder()` acepta IDs almacenados para cancelación directa
- Fallback a búsqueda manual si no hay IDs (compatibilidad con datos legacy)

```typescript
// src/services/notificationService.ts
async scheduleReminderNotification(reminder: Reminder): Promise<string[]> {
  const notificationIds: string[] = [];
  
  // Notificación principal
  const primaryId = await Notifications.scheduleNotificationAsync({...});
  notificationIds.push(primaryId);
  
  // Follow-ups para Strict/Critical
  if (reminder.control_level === 'strict' || reminder.control_level === 'critical') {
    // ... programar follow-ups
    notificationIds.push(followUpId);
  }
  
  return notificationIds;
}
```

#### 1.3 Persistencia de IDs
Todos los métodos de `useStore` ahora:
1. Programan notificaciones
2. Guardan los IDs retornados en la DB
3. Usan esos IDs para cancelación eficiente

```typescript
// Ejemplo en addReminder
const notifIds = await NotificationService.scheduleReminderNotification(reminder);
if (notifIds.length > 0) {
  await ReminderService.updateReminder(reminder.id, { 
    notification_ids: JSON.stringify(notifIds) 
  });
}
```

---

## 2. Sistema de Compliance Events

### ✅ Objetivo
Registrar **cada interacción** del usuario para análisis de productividad y auditoría.

### 🔧 Implementación

#### 2.1 Nuevo Servicio
Creado `src/services/complianceService.ts` con:

- `logEvent()`: Registra eventos de cumplimiento
- `logNotificationAttempt()`: Registra intentos de notificación
- `getComplianceStats()`: Obtiene estadísticas de productividad

#### 2.2 Tipos de Eventos
```typescript
type ComplianceEventType = 
  | 'completed'     // Tarea completada
  | 'failed'        // Tarea eliminada/fallida
  | 'snoozed'       // Posposición individual
  | 'mass_snooze';  // Posposición masiva (botón "Posponer todo")
```

#### 2.3 Integración
Los eventos se registran automáticamente en:
- `markAsCompleted()` → 'completed'
- `deleteReminder()` → 'failed'
- `snoozeReminder()` → 'snoozed' o 'mass_snooze'

---

## 3. Manejo de Acciones de Notificación

### ✅ Problema Resuelto
**Antes:** Solo se manejaba el tap en la notificación (abrir app).

**Ahora:** Manejo completo de acciones interactivas.

### 🔧 Implementación

```typescript
// app/_layout.tsx
Notifications.addNotificationResponseReceivedListener(response => {
  const reminderId = data.reminderId as string;
  const actionId = response.actionIdentifier;

  if (actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    // Tap en notificación → Abrir pantalla de confirmación
    router.push(`/confirm/${reminderId}`);
  } 
  else if (actionId === 'DONE') {
    // Botón "Ya lo hice" → Marcar como completado
    useStore.getState().markAsCompleted(reminderId);
  } 
  else if (actionId === 'SNOOZE') {
    // Botón "Posponer" → Posponer 10 minutos
    useStore.getState().snoozeReminder(reminderId, 10);
  }
});
```

---

## 4. Arquitectura de Datos

### ✅ Estrategia Implementada

**SQLite** = Fuente de verdad
- Todos los recordatorios
- Historial completo
- Eventos de cumplimiento

**Zustand** = Caché en memoria + UI State
- Solo datos activos necesarios para la UI
- No se persiste la lista completa de recordatorios
- Se recarga desde SQLite cuando es necesario

### 🔧 Beneficios
- ✅ No hay conflictos de sincronización
- ✅ Mejor rendimiento
- ✅ Escalable a miles de recordatorios
- ✅ Persistencia garantizada

---

## 5. Próximas Mejoras Recomendadas

### 🚀 Prioridad Alta

#### 5.1 Deep Linking
Configurar `expo-linking` para abrir la app desde notificaciones:
```typescript
// app.json
{
  "expo": {
    "scheme": "veyra",
    "android": {
      "intentFilters": [...]
    }
  }
}
```

#### 5.2 Límite de Notificaciones iOS
iOS permite máximo **64 notificaciones programadas**. Implementar:
```typescript
// Cancelar notificaciones lejanas si se supera el límite
const scheduled = await Notifications.getAllScheduledNotificationsAsync();
if (scheduled.length > 60) {
  // Cancelar las más lejanas
}
```

#### 5.3 Modo Doze en Android
Probar con `adb` para verificar que las notificaciones críticas funcionan:
```bash
adb shell dumpsys deviceidle force-idle
```

### 🎯 Prioridad Media

#### 5.4 Background Tasks
Usar `expo-background-fetch` para verificar recordatorios vencidos cada X minutos.

#### 5.5 Sonidos Personalizados
Agregar sonidos más molestos para nivel "critical":
```typescript
// assets/sounds/alarm.wav
android: {
  channelId: 'critical',
  sound: 'alarm.wav'
}
```

---

## 6. Testing Checklist

### ✅ Casos de Prueba Críticos

- [ ] Crear recordatorio → Verificar que se programan N notificaciones (1 + follow-ups)
- [ ] Completar recordatorio → Verificar que se cancelan TODAS las notificaciones
- [ ] Editar fecha → Verificar que se cancelan las viejas y programan nuevas
- [ ] Posponer → Verificar que se reprograman correctamente
- [ ] "Posponer todo" → Verificar que se registra como `mass_snooze`
- [ ] Tap en notificación → Verificar que abre `/confirm/[id]`
- [ ] Botón "Ya lo hice" → Verificar que marca como completado sin abrir app
- [ ] Botón "Posponer" → Verificar que pospone 10 min sin abrir app

---

## 7. Notas de Migración

### ⚠️ Para Usuarios Existentes

La columna `notification_ids` se agrega automáticamente en la próxima ejecución.

Los recordatorios existentes funcionarán con el **fallback** (búsqueda manual de notificaciones), pero los nuevos usarán el sistema optimizado.

**No se requiere acción manual.**

---

## 8. Recursos y Referencias

- [Expo Notifications Docs](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Android Notification Channels](https://developer.android.com/develop/ui/views/notifications/channels)
- [iOS Notification Limits](https://developer.apple.com/documentation/usernotifications/scheduling_a_notification_locally_from_your_app)
- [Zustand Best Practices](https://docs.pmnd.rs/zustand/guides/practice-with-no-store-actions)

---

**Última actualización:** 2026-02-06  
**Versión:** 1.0.0
