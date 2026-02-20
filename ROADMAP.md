# 🚀 Roadmap de Mejoras Futuras - Veyra

## Prioridad 1: Críticas (Implementar Próximamente)

### 1.1 Deep Linking con Expo Router ⚡
**Problema:** Las notificaciones no pueden abrir la app en una pantalla específica desde el background.

**Solución:**
```typescript
// app.json
{
  "expo": {
    "scheme": "veyra",
    "android": {
      "intentFilters": [
        {
          "action": "VIEW",
          "data": [
            {
              "scheme": "veyra",
              "host": "*"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    },
    "ios": {
      "associatedDomains": ["applinks:veyra.app"]
    }
  }
}

// En notificaciones
data: { 
  reminderId: reminder.id,
  url: `veyra://confirm/${reminder.id}` 
}
```

**Beneficio:** Abrir directamente la pantalla de confirmación desde notificaciones en background.

---

### 1.2 Límite de Notificaciones iOS (64 max) ⚡
**Problema:** iOS solo permite 64 notificaciones programadas simultáneamente.

**Solución:**
```typescript
// src/services/notificationService.ts
async scheduleWithLimit(reminder: Reminder): Promise<string[]> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  
  // Si estamos cerca del límite, cancelar las más lejanas
  if (scheduled.length > 60) {
    const sorted = scheduled.sort((a, b) => 
      a.trigger.value - b.trigger.value
    );
    
    // Cancelar las últimas 10
    for (let i = scheduled.length - 10; i < scheduled.length; i++) {
      await Notifications.cancelScheduledNotificationAsync(sorted[i].identifier);
    }
  }
  
  return await this.scheduleReminderNotification(reminder);
}
```

**Beneficio:** Evitar errores silenciosos cuando se supera el límite.

---

### 1.3 Testing en Modo Doze (Android) ⚡
**Problema:** Android puede bloquear notificaciones en modo ahorro de batería.

**Comandos de Testing:**
```bash
# Forzar modo Doze
adb shell dumpsys deviceidle force-idle

# Ver estado
adb shell dumpsys deviceidle get deep

# Salir de Doze
adb shell dumpsys deviceidle unforce

# Whitelist de la app (para testing)
adb shell dumpsys deviceidle whitelist +com.yourapp
```

**Verificar:**
- Notificaciones críticas se disparan incluso en Doze
- Follow-ups funcionan correctamente

---

## Prioridad 2: Importantes (Próximas Semanas)

### 2.1 Background Fetch para Verificación Periódica 🔄
**Objetivo:** Verificar recordatorios vencidos cada 15 minutos en background.

**Implementación:**
```typescript
// app/_layout.tsx
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

const BACKGROUND_FETCH_TASK = 'background-reminder-check';

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    const overdue = await ReminderService.getOverdueReminders();
    
    for (const reminder of overdue) {
      if (reminder.retry_count < reminder.max_retries) {
        // Programar follow-up inmediato
        await NotificationService.scheduleImmediateNotification(reminder);
        await ReminderService.incrementRetryCount(reminder.id);
      } else {
        // Marcar como fallido
        await ReminderService.markAsFailed(reminder.id);
      }
    }
    
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Registrar en useEffect
await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
  minimumInterval: 15 * 60, // 15 minutos
  stopOnTerminate: false,
  startOnBoot: true,
});
```

**Beneficio:** Garantizar que no se pierdan recordatorios críticos.

---

### 2.2 Sonidos Personalizados para Nivel Critical 🔊
**Objetivo:** Usar sonidos más molestos/efectivos para recordatorios críticos.

**Pasos:**
1. Agregar archivo de audio:
```
assets/sounds/
  ├── alarm_critical.wav
  ├── alarm_strict.wav
  └── alarm_normal.wav
```

2. Configurar en Android:
```typescript
// android/app/src/main/res/raw/alarm_critical.wav
await Notifications.setNotificationChannelAsync('critical', {
  name: 'Críticos',
  importance: Notifications.AndroidImportance.MAX,
  sound: 'alarm_critical.wav',
  vibrationPattern: [0, 500, 200, 500, 200, 500],
  lightColor: '#FF0000',
});
```

3. iOS:
```typescript
content: {
  sound: 'alarm_critical.wav',
  // ...
}
```

**Beneficio:** Mayor efectividad en recordatorios críticos.

---

### 2.3 Dashboard de Estadísticas 📊
**Objetivo:** Pantalla dedicada a mostrar productividad del usuario.

**Métricas a mostrar:**
- Tasa de cumplimiento (%)
- Racha actual de días completados
- Total completados vs fallidos
- Promedio de posposiciones por tarea
- Horas del día más productivas
- Nivel de control más usado

**Implementación:**
```typescript
// app/stats.tsx
export default function StatsScreen() {
  const [stats, setStats] = useState(null);
  
  useEffect(() => {
    async function load() {
      const data = await ComplianceService.getComplianceStats();
      setStats(data);
    }
    load();
  }, []);
  
  return (
    <YStack>
      <Card>
        <H2>{stats.completionRate.toFixed(1)}%</H2>
        <Text>Tasa de Cumplimiento</Text>
      </Card>
      {/* Más métricas */}
    </YStack>
  );
}
```

---

## Prioridad 3: Mejoras de UX (Futuro)

### 3.1 Modo "Strict Global" 🔒
**Idea:** Activar temporalmente modo estricto para TODOS los recordatorios.

**Casos de uso:**
- Semana de exámenes
- Sprint de trabajo importante
- Período de alta productividad

**Implementación:**
```typescript
// useStore.ts
strictModeActive: boolean;
strictModeUntil: number | null;

enableStrictMode: (durationHours: number) => {
  set({ 
    strictModeActive: true,
    strictModeUntil: Date.now() + (durationHours * 60 * 60 * 1000)
  });
  
  // Reprogramar todas las notificaciones con nivel strict
  // ...
}
```

---

### 3.2 Templates de Recordatorios 📝
**Idea:** Guardar plantillas para recordatorios recurrentes.

**Ejemplos:**
- "Tomar medicamento" (diario, 8am, critical)
- "Revisar emails" (lunes-viernes, 9am, normal)
- "Ejercicio" (lun-mie-vie, 6pm, strict)

**Beneficio:** Crear recordatorios complejos en 1 tap.

---

### 3.3 Integración con Calendario 📅
**Idea:** Sincronizar recordatorios con Google Calendar / Apple Calendar.

**Beneficio:** 
- Ver recordatorios en calendario nativo
- Crear recordatorios desde eventos de calendario

---

### 3.4 Widget de Home Screen 📱
**Idea:** Widget que muestra próximo recordatorio + acciones rápidas.

**Expo:** Usar `expo-widgets` (experimental)

---

## Prioridad 4: Monetización (Futuro)

### 4.1 Límite Freemium Mejorado 💎
**Actual:** 3 recordatorios activos gratis

**Propuesta:**
- **Free:** 5 recordatorios, solo nivel Normal
- **Pro:** Ilimitados, todos los niveles, estadísticas avanzadas
- **Ultra:** + Sincronización en la nube, backup automático

---

### 4.2 Sincronización en la Nube ☁️
**Stack sugerido:**
- Backend: Supabase / Firebase
- Sync: Offline-first con resolución de conflictos
- Backup: Automático cada 24h

---

## 📋 Checklist de Implementación

### Próxima Sesión
- [x] Implementar Deep Linking
- [x] Manejar límite de 64 notificaciones iOS
- [ ] Testing en Modo Doze

### Próximas 2 Semanas
- [ ] Background Fetch
- [ ] Sonidos personalizados
- [ ] Dashboard de estadísticas

### Próximo Mes
- [ ] Modo Strict Global
- [ ] Templates de recordatorios
- [ ] Widget de home screen

---

## 🛠️ Herramientas Recomendadas

### Testing
- **Expo Go** - Testing rápido en desarrollo
- **EAS Build** - Builds nativas para testing de notificaciones
- **adb** - Testing de Doze mode en Android
- **Xcode Simulator** - Testing de límite de notificaciones iOS

### Monitoreo
- **Sentry** - Error tracking
- **Analytics** - Mixpanel / Amplitude para eventos de usuario
- **RevenueCat** - Gestión de suscripciones (ya integrado)

---

**Última actualización:** 2026-02-06  
**Mantenedor:** Equipo Veyra
