# Política de Privacidad — Veyra
**Última actualización:** 5 de Octubre de 2026  
**Sitio Web:** https://veyra.app  
**Contacto de Privacidad:** soporte@veyra.app  

En **Veyra** ("nosotros", "nuestro" o "la Aplicación"), nos tomamos muy en serio la privacidad y la seguridad de los datos de nuestros usuarios. Esta Política de Privacidad describe cómo recopilamos, usamos, almacenamos y protegemos tu información personal al utilizar nuestra aplicación móvil en Android e iOS, de conformidad con las directrices de **Google Play Store**, **Apple App Store** y normativas internacionales de protección de datos (como el **RGPD** europeo y la **LGPD**).

---

## 1. Responsable del Tratamiento
El responsable del tratamiento de los datos recabados a través de la aplicación móvil Veyra es el equipo de desarrollo de Veyra.  
Para cualquier duda, solicitud o ejercicio de derechos ARCO (Acceso, Rectificación, Cancelación y Oposición), puedes contactarnos en:  
📧 **soporte@veyra.app**

---

## 2. Datos que Recopilamos y Finalidad

### A. Información de la Cuenta y Autenticación
- **Datos recopilados:** Dirección de correo electrónico, nombre de usuario y avatar seleccionado.
- **Finalidad:** Creación de cuenta, autenticación segura y recuperación de acceso a través de **Supabase Auth**.
- **Base legal:** Ejecución del contrato de servicio solicitado por el usuario.

### B. Datos de Productividad y Contenido del Usuario
- **Datos recopilados:** Recordatorios, fechas de vencimiento, subtareas, notas con formato enriquecido, carpetas y eventos de calendario.
- **Finalidad:** Proporcionar las funciones principales de la aplicación: gestión del tiempo, organización de notas, alertas de vencimiento y sincronización opcional multidispositivo.
- **Almacenamiento:** Los datos se guardan primeramente en la base de datos local cifrada en el dispositivo (**SQLite**). Si inicias sesión, se sincronizan con la nube a través de conexiones seguras (**HTTPS/TLS**).

### C. Permisos Sensibles del Dispositivo
- **Reconocimiento de Voz (`RECORD_AUDIO` / `expo-speech-recognition`):**  
  Se solicita únicamente cuando pulsas el botón del micrófono para transcribir recordatorios o notas mediante dictado por voz. **Veyra no graba conversaciones de fondo ni almacena tus archivos de audio en servidores externos.** La conversión de audio a texto se procesa de forma transitoria.
- **Notificaciones y Alarmas Exactas (`SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `POST_NOTIFICATIONS`):**  
  Necesarios para que el sistema operativo despierte la app en el minuto exacto en que programaste una alarma o recordatorio de alta prioridad (Normal, Strict o Critical).
- **Pantalla de Bloqueo (`USE_FULL_SCREEN_INTENT`, `SYSTEM_ALERT_WINDOW`):**  
  Utilizados exclusivamente en recordatorios de nivel Crítico para mostrar la interfaz de alarma sobre la pantalla de bloqueo o sobre otras aplicaciones, asegurando que no pierdas recordatorios vitales.
- **Optimización de Batería (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`):**  
  Opcional, solicitado con consentimiento para evitar que el fabricante del teléfono cierre el temporizador de la alarma en segundo plano.

---

## 3. Seguridad de los Datos y Cifrado
- **Cifrado en tránsito:** Toda comunicación entre la app y el backend se realiza de manera forzada y obligatoria mediante **HTTPS (TLS 1.3)**. No se admiten conexiones en texto plano (`cleartextTraffic` deshabilitado).
- **Cifrado en reposo:** Los datos en la nube se almacenan en infraestructura de **Supabase** con políticas de seguridad a nivel de fila (**Row Level Security - RLS**), garantizando que ningún usuario pueda leer o modificar datos que no le pertenezcan.
- **No venta de datos:** Veyra **NO vende, alquila ni comparte** tus datos personales o contenido con agencias de publicidad, corredores de datos ni redes sociales de terceros.

---

## 4. Servicios de Terceros
Utilizamos exclusivamente proveedores de infraestructura reconocidos por sus altos estándares de seguridad:
- **Supabase Inc.:** Proveedor de base de datos PostgreSQL, autenticación y almacenamiento en la nube bajo estándares SOC2 e ISO 27001.
- **RevenueCat:** Gestión de transacciones y validación de recibos para compras integradas (In-App Purchases) de Google Play y Apple App Store. RevenueCat no tiene acceso al contenido de tus notas o recordatorios.

---

## 5. Derecho de Eliminación de Cuenta y Datos (Obligatorio en Tiendas)
Reconocemos tu derecho inalienable a ser olvidado y a retirar todos tus datos en cualquier momento:

### Cómo eliminar tu cuenta de forma autónoma:
1. Abre la aplicación **Veyra**.
2. Dirígete a **Mi Perfil** (ícono de usuario en el menú o barra superior).
3. Desplázate hacia la parte inferior hasta la sección **"Zona de Riesgo"**.
4. Pulsa **"Eliminar mi cuenta definitivamente"**.
5. Escribe la palabra de confirmación **ELIMINAR** y confirma.

### Qué sucede al confirmar el borrado:
- Se eliminan inmediatamente todas tus notas, recordatorios, carpetas, eventos y perfil en la nube (Supabase).
- Se cancelan todas las notificaciones y alarmas programadas en el sistema operativo.
- Se borran las bases de datos locales (SQLite) y cachés en tu teléfono.
- Se cierra tu sesión por completo.

*Nota:* También puedes solicitar el borrado manual enviando un correo a **soporte@veyra.app** desde la dirección registrada en tu cuenta.

---

## 6. Privacidad Infantil (Menores de Edad)
Nuestros servicios no están dirigidos a niños menores de 13 años. No recopilamos conscientemente información personal de niños. Si eres padre o tutor y tienes conocimiento de que tu hijo menor nos ha proporcionado información personal, contáctanos en **soporte@veyra.app** para proceder a su eliminación inmediata.

---

## 7. Modificaciones a esta Política
Nos reservamos el derecho de actualizar esta Política de Privacidad para reflejar cambios en nuestras funciones o en las leyes aplicables. Cualquier modificación se reflejará con una nueva fecha de "Última actualización" y se notificará dentro de la aplicación.
