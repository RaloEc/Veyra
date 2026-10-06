# 📱 Guía Oficial de Publicación en Tiendas — Veyra
> Documento preparado para copiar y pegar directamente en **Google Play Console** y **Apple App Store Connect**.

---

## 1. Justificaciones de Permisos Sensibles (Google Play Console)

Google Play exige justificaciones detalladas para los permisos declarados en tu `AndroidManifest.xml`. Copia y pega estos textos exactos cuando te lo solicite la consola:

### A. `android.permission.RECORD_AUDIO` (Micrófono)
*   **Pregunta de Google:** *¿Por qué la app necesita acceso al micrófono?*
*   **Respuesta:**  
    > *"Veyra permite a los usuarios crear recordatorios, notas y tareas mediante comandos de voz y dictado rápido (Speech-to-Text). El permiso solo se activa de manera explícita cuando el usuario pulsa el botón del micrófono en los formularios de creación. El audio se procesa de forma transitoria para transcribir el texto solicitado y nunca se almacena, graba en segundo plano ni comparte con terceros."*

### B. `android.permission.SCHEDULE_EXACT_ALARM` y `USE_EXACT_ALARM`
*   **Pregunta de Google:** *¿Por qué tu app requiere programar alarmas exactas?*
*   **Caso de uso declarado:** **Alarms & Reminders / Temporizadores**
*   **Respuesta:**  
    > *"La función central de Veyra es la entrega de recordatorios y alarmas con puntualidad de segundo crítico (toma de medicamentos, reuniones programadas y plazos improrrogables). El uso de temporizadores inexactos provocaría retrasos inaceptables para el usuario. Por tanto, se requiere el uso de AlarmManager con alarmas exactas para garantizar la puntualidad de los avisos programados por el usuario."*

### C. `android.permission.USE_FULL_SCREEN_INTENT`
*   **Pregunta de Google:** *¿Por qué la app necesita mostrar intents a pantalla completa?*
*   **Respuesta:**  
    > *"Veyra cuenta con un modo de alarma de nivel 'Crítico' diseñado para eventos de máxima urgencia configurados explícitamente por el usuario. Cuando suena una alarma crítica mientras el dispositivo está bloqueado, se invoca una pantalla completa de alarma (CriticalAlarmActivity) para que el usuario pueda visualizar el aviso y posponer o descartar la alarma de inmediato, emulando el comportamiento de una alarma despertador o médica nativa."*

### D. `android.permission.SYSTEM_ALERT_WINDOW` (Mostrar sobre otras apps)
*   **Pregunta de Google:** *¿Por qué la app necesita superponerse sobre otras aplicaciones?*
*   **Respuesta:**  
    > *"Se utiliza exclusivamente para las alarmas de nivel 'Crítico' cuando el usuario tiene otra aplicación en primer plano, permitiendo que la alerta prioritaria capture la atención visual del usuario inmediatamente sin cerrarse por optimizaciones del sistema operativo."*

### E. `android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`
*   **Pregunta de Google:** *¿Por qué solicitas ignorar optimizaciones de batería?*
*   **Respuesta:**  
    > *"Se ofrece como ajuste opcional dentro de la sección de Garantía de Alarmas para evitar que los gestores de batería agresivos de ciertos fabricantes (como Doze mode) suspendan los servicios en segundo plano que ejecutan las alarmas críticas programadas."*

---

## 2. Formulario de Seguridad de los Datos (Data Safety - Google Play)

Rellena las secciones del formulario de la siguiente manera:

| Categoría de Datos | ¿Se recopila? | ¿Se comparte con terceros? | ¿Cifrado en tránsito? | ¿El usuario puede solicitar el borrado? |
|---|---|---|---|---|
| **Nombre** | Sí (Opcional) | No | Sí (HTTPS) | Sí (Directo en App) |
| **Correo electrónico** | Sí (Al registrarse) | No | Sí (HTTPS) | Sí (Directo en App) |
| **Identificadores de usuario (ID Supabase)** | Sí | No | Sí (HTTPS) | Sí |
| **Voz / Grabaciones de audio** | No permanente (Transitorio) | No | Sí | N/A |
| **Fotos y vídeos** | Opcional (si adjunta a notas) | No | Sí | Sí |
| **Otros mensajes / notas creadas** | Sí (Notas y recordatorios) | No | Sí | Sí |
| **Información financiera / tarjetas** | **No** (Procesado por Google Play) | No | N/A | N/A |
| **Ubicación precisa** | **No** | No | N/A | N/A |
| **Contactos / Libreta de direcciones** | **No** | No | N/A | N/A |

### URLs Obligatorias para la Consola:
- **URL de Política de Privacidad:** `https://veyra.app/privacy` *(o tu URL en GitHub Pages / Veyra)*
- **URL para solicitud de eliminación de datos:** `https://veyra.app/privacy#delete-account` *(o enlace a soporte@veyra.app)*

---

## 3. Acceso a la Aplicación para Revisores (App Reviewer Credentials)

Google y Apple necesitan probar una cuenta real sin bloqueos por autenticación SMS o pagos:
*   **Nombre de usuario / Correo:** `demo.reviewer@veyra.app` *(o una cuenta de prueba que crees en tu Supabase)*
*   **Contraseña:** `ReviewerPass2026!`
*   **Instrucciones para el revisor:**
    > *"La aplicación permite el uso tanto en modo local (sin cuenta) como con cuenta en la nube. Para probar la sincronización en la nube y el perfil, utilice las credenciales proporcionadas. Para probar las compras integradas, utilice cuentas de sandbox de Google Play / TestFlight."*

---

## 4. Ficha de la Tienda (ASO - App Store Optimization)

### Nombre de la App:
`Veyra: Recordatorios y Notas` (Google Play: máx 30 caracteres)

### Descripción Corta (máx 80 caracteres):
`Recordatorios inteligentes, alarmas de alta precisión, notas y widgets.`

### Descripción Larga:
```
Veyra es tu centro integral de productividad y disciplina diaria. Diseñada para garantizar que nunca más olvides un compromiso importante, una clase o una idea brillante.

CARACTERÍSTICAS PRINCIPALES:
⏰ NIVELES DE CONTROL INTELIGENTES:
• Normal: Notificaciones elegantes para el día a día.
• Strict: Avisos recurrentes insistentes para tareas que no admiten postergación.
• Critical: Alarmas a pantalla completa que suenan incluso con el teléfono bloqueado o en silencio.

📝 NOTAS Y CUADERNOS ENRIQUECIDOS:
• Crea notas rápidas con texto enriquecido, formato visual y listas de verificación.
• Organiza todo mediante carpetas jerárquicas y colores personalizados.
• Búsqueda instantánea y papelera de recuperación.

🎙️ DICTADO POR VOZ INTEGRADO:
• Crea tareas y anota pensamientos al instante usando tu voz sin teclear.

📱 WIDGETS NATIVOS DE ÚLTIMA GENERACIÓN:
• Widgets Glance para tu pantalla de inicio: Agenda del día, Notas rápidas, Combo dúo y Horario de clases.
• Personaliza el tamaño del texto y el modo de alto contraste para máxima visibilidad en exteriores.

☁️ SINCRONIZACIÓN CIFRADA:
• Tus datos están seguros en tu teléfono y se sincronizan cifrados con la nube solo si tú lo decides.
• Funciona 100% sin conexión a internet (Offline-first).

🔒 PRIVACIDAD Y SEGURIDAD:
• Sin anuncios molestos ni venta de datos personales.
• Conexión cifrada de extremo a extremo mediante HTTPS.
• Control total: puedes exportar o eliminar tu cuenta y todos tus datos en cualquier momento con un solo toque.

Descarga Veyra hoy y transforma tu productividad diaria.
```
