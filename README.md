# 📱 Veyra - Documentación del Proyecto

## 📖 Descripción General
**Veyra** es un gestor de productividad avanzado diseñado no solo para listar tareas, sino para **asegurar su cumplimiento** mediante diferentes niveles de "presión" o control. Está enfocada en la disciplina personal, diferenciando entre recordatorios casuales y tareas críticas que no pueden ser ignoradas, actuando como un asistente activo.

---

## 🛠️ Stack Tecnológico

La aplicación está construida sobre una arquitectura moderna, escalable y multiplataforma.

### **Core & Framework**
- **React Native (0.81.5)**: Motor principal para desarrollo móvil nativo.
- **Expo (SDK 54)**: Plataforma de herramientas y servicios para React Native.
- **TypeScript**: Lenguaje base para asegurar tipado estático y robustez.

### **Interfaz de Usuario (UI)**
- **Tamagui (v2.0 RC)**: Framework de UI de alto rendimiento, 100% tipado, con sistema de temas (Light/Dark mode) y animaciones fluidas.
- **Lucide Icons**: Iconografía vectorial moderna y consistente.

### **Gestión de Estado y Navegación**
- **Zustand**: Gestor de estado global ligero y rápido (gestiona recordatorios, configuración e historial).
- **Expo Router**: Enrutamiento basado en archivos (File-based routing), similar a Next.js.

### **Datos y Persistencia**
- **Expo SQLite**: Base de datos SQL local para almacenamiento robusto y relacional de usuarios, recordatorios y eventos de cumplimiento.
- **AsyncStorage**: Almacenamiento clave-valor para configuraciones simples.

### **Funcionalidades del Sistema**
- **Expo Notifications**: Sistema avanzado de notificaciones con soporte para canales personalizados en Android.
- **date-fns**: Manipulación profesional de fechas y horas.

---

## 🖥️ Estructura de Pantallas

### 1. Pantalla Principal (Dashboard) - `app/index.tsx`
El centro de mando de la aplicación. No es una simple lista, sino un panel de control jerarquizado:
- **Bloque "AHORA":** Destaca visualmente la tarea más urgente o vencida.
- **Secciones Inteligentes:** Organización automática en *Vencidos*, *Hoy* y *Próximos*.
- **Indicadores de Presión:** Contadores visuales para tareas críticas pendientes.
- **Micro-Estadísticas:** Resumen diario de *Completadas vs. Fallidas*.
- **Modo Estricto:** Indicador visual cuando hay tareas críticas activas.
- **Acciones Rápidas:** Botón "Posponer Todo" para emergencias y botón flotante (+) para crear.

### 2. Crear/Editar Recordatorio - `app/create.tsx`
Formulario intuitivo para la gestión de tareas:
- Títulos y descripciones.
- Selección de fecha y hora.
- **Selector de Nivel de Control:** Permite elegir la intensidad del recordatorio (Normal, Estricto, Crítico).

### 3. Historial - `app/history.tsx`
Registro permanente de la actividad del usuario:
- Visualización de tareas pasadas.
- Estado final de cada tarea (`completada` o `fallida`).

### 4. Onboarding - `app/onboarding.tsx`
Flujo de bienvenida para nuevos usuarios:
- Configuración inicial.
- Explicación de los niveles de control.

### 5. Confirmación - `app/confirm/[id].tsx`
Pantalla transaccional diseñada para abrirse desde notificaciones, permitiendo marcar una tarea como realizada rápidamente.

---

## ⚙️ Funciones Clave y Lógica de Negocio

### 🎯 Niveles de Control (Control Levels)
La característica distintiva de la app es cómo maneja la insistencia:

| Nivel | Comportamiento |
| :--- | :--- |
| **Normal** | Notificación estándar única. |
| **Strict** (Estricto) | Mayor insistencia. Repetición automática cada **15 minutos** (2 intentos extra). |
| **Critical** (Crítico) | Prioridad máxima. Usa canal de notificación especial (sonido/vibración fuerte en Android). Se repite cada **5 minutos** hasta 5 veces. |

### 🗄️ Base de Datos Relacional
Estructura SQLite optimizada para el rendimiento:
- **`reminders`**: Almacena estado (`pending`, `completed`, `failed`), prioridad, intentos y reglas de repetición.
- **`compliance_events`**: Auditoría de cada interacción del usuario.
- **`notification_attempts`**: Registro de cada alerta enviada por el sistema.

### 🔔 Sistema de Notificaciones Inteligente
- **Canales Android:** Separación entre canales `default` y `critical` para garantizar que las tareas importantes suenen incluso en modos restrictivos.
- **Acciones Interactivas:** Botones en la notificación para "Completar" o "Posponer" sin abrir la app.
- **Follow-ups Automáticos:** El sistema reprograma recordatorios automáticamente si no se detecta interacción en los niveles superiores.

---

## 📚 Documentación Adicional

Este proyecto incluye documentación técnica detallada:

- **[TECHNICAL_GUIDE.md](./TECHNICAL_GUIDE.md)** - Guía técnica completa de implementación del sistema de notificaciones
- **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** - Resumen ejecutivo de las mejoras implementadas
- **[ROADMAP.md](./ROADMAP.md)** - Roadmap de mejoras futuras priorizadas
- **[AVATAR_MENU.md](./AVATAR_MENU.md)** - Sistema moderno de menú de usuario con todas las pantallas

### Temas Cubiertos
- Sistema de tracking de notification IDs
- Compliance events y auditoría
- Manejo de acciones de notificación
- Arquitectura de datos (SQLite + Zustand)
- Mejores prácticas 2025-2026
- Testing y debugging
- Próximas mejoras recomendadas

