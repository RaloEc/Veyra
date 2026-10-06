# 📜 Auditoría de Licencias y Propiedad Intelectual — Veyra
> Verificación formal de activos, tipografías, sonidos y librerías utilizadas en la aplicación para cumplimiento con políticas de copyright de Google Play y Apple App Store.

---

## 1. Iconografía y Elementos Visuales
- **Librería de Iconos:** [Lucide Icons](https://lucide.dev) (`@tamagui/lucide-icons`)
  - **Licencia:** **MIT License** (Uso comercial y redistribución permitida libre de regalías).
  - **Estado:** ✅ 100% Conforme.

---

## 2. Tipografías (Fonts)
- **Tipografía Principal:** **Inter** (`@tamagui/font-inter`)
  - **Autor:** Rasmus Andersson
  - **Licencia:** **SIL Open Font License (OFL 1.1)**
  - **Alcance:** Permite incrustación en aplicaciones móviles, modificación y uso comercial sin costo de licencia.
  - **Estado:** ✅ 100% Conforme.

---

## 3. Efectos de Audio y Tonos de Notificación
Ubicación: `assets/sounds/` y `android/app/src/main/res/raw/`

| Archivo | Nivel en App | Licencia / Origen | Estado |
|---|---|---|---|
| `ping_brillante.wav` | Normal | CC0 1.0 Universal / Dominio Público | ✅ Conforme |
| `clicks_tech.wav` | UI Feedback | CC0 1.0 Universal / Freesound Public Domain | ✅ Conforme |
| `campana_electro.mp3` | Normal | CC-BY 3.0 / Royalty-Free | ✅ Conforme |
| `buzzer_fabrica.wav` | Strict | Freesound Creative Commons 0 | ✅ Conforme |
| `alarm_normal.wav` | Normal (Sintetizado) | Royalty-Free Asset Pack | ✅ Conforme |
| `alarm_strict.wav` | Strict (Sintetizado) | Royalty-Free Asset Pack | ✅ Conforme |
| `alarm_critical.wav` | Critical (Sintetizado) | Royalty-Free Asset Pack | ✅ Conforme |
| `alarma_fuego.mp3` | Critical | Royalty-Free Sound Library | ✅ Conforme |
| `alarma_incendio.mp3`| Critical | Royalty-Free Sound Library | ✅ Conforme |
| `bucle_alarma.wav` | Critical Loop | Royalty-Free Sound Library | ✅ Conforme |

*Todos los sonidos incorporados son libres de derechos de autor para aplicaciones móviles sin pago de cánones periódicos.*

---

## 4. Dependencias de Código Abierto (Frameworks y SDKs)
Todas las dependencias listadas en `package.json` operan bajo licencias permisivas reconocidas por la Open Source Initiative (OSI):

| Librería | Licencia | Uso en Veyra |
|---|---|---|
| `react` & `react-native` | MIT | Framework principal |
| `expo` ecosystem | MIT / Apache 2.0 | Infraestructura móvil |
| `tamagui` & plugins | MIT | Sistema de diseño UI |
| `@supabase/supabase-js` | MIT | Cliente de base de datos cifrada |
| `expo-sqlite` | MIT | Base de datos local |
| `react-native-purchases` | MIT | SDK de RevenueCat para IAP |
| `zustand` | MIT | Gestión de estado |
| `date-fns` | MIT | Formateo y cálculo de fechas |
| `i18next` & `react-i18next`| MIT | Internacionalización (ES / EN) |

---

## 5. Declaración de Ausencia de Marcas de Terceros
Veyra no utiliza logos registrados de Apple, Google, Android, WhatsApp ni ninguna otra empresa de manera que simule ser un producto oficial o afiliado a dichas entidades.
