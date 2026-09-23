# Veyra — Design System & UI Redesign Guide

## Objetivo

Rediseñar progresivamente la interfaz de Veyra para que deje de sentirse como una aplicación de productividad genérica y desarrolle una identidad visual propia.

El rediseño debe conservar:

- Todas las funcionalidades existentes.
- La arquitectura actual.
- El comportamiento offline-first.
- La sincronización con Supabase.
- Las notificaciones y lógica de disciplina.
- El rendimiento en dispositivos móviles.
- La accesibilidad y legibilidad.
- El soporte para modo claro y oscuro.
- El sistema de colores de acento existente.

El trabajo debe hacerse **página por página**, reutilizando un sistema visual común. No hacer un rediseño global destructivo ni reescribir la aplicación completa.

---

# 1. Dirección visual de Veyra

## Concepto

Veyra debe transmitir:

**Precision · Focus · Control · Discipline**

La interfaz debe sentirse:

- Premium.
- Minimalista.
- Moderna.
- Precisa.
- Tecnológica, pero no futurista de forma exagerada.
- Elegante.
- Calmadamente dinámica.
- Orientada a la acción.

Evitar que parezca una copia visual de:

- Notion.
- Todoist.
- Apple Reminders.
- Google Tasks.
- Dashboards SaaS genéricos.

La personalidad debe surgir principalmente de:

- Tipografía.
- Espaciado.
- Jerarquía.
- Microinteracciones.
- Indicadores de estado.
- Superficies.
- Contraste.
- Uso controlado del color de acento.

No depender de gradients, sombras fuertes o blur para crear personalidad.

---

# 2. Regla principal: Solid + Glass

Veyra utilizará un único lenguaje visual híbrido.

## Superficies sólidas

Usar superficies sólidas para el contenido principal:

- Dashboard.
- Tareas.
- Notas.
- Estadísticas.
- Listas.
- Métricas.
- Configuración.
- Formularios.
- Contenido persistente.

Las superficies deben ser limpias, discretas y con separación visual mediante:

- Contraste.
- Bordes sutiles.
- Espaciado.
- Jerarquía tipográfica.

## Glass / Crystal

Usar glassmorphism únicamente para elementos secundarios o que aparecen encima del contenido:

- Modales.
- Bottom sheets.
- Menús.
- Tooltips.
- Floating controls.
- Overlays.
- Controles contextuales.
- Elementos temporales.

No convertir cada card en glass.

### Regla práctica

Si un elemento representa el **contenido principal**, usar Solid.

Si un elemento aparece **sobre otro contenido o tiene comportamiento contextual**, puede usar Glass.

---

# 3. Filosofía de superficies

Evitar una interfaz basada en:

- Grandes sombras.
- Border-radius excesivo.
- Blur constante.
- Transparencias excesivas.
- Gradients decorativos.
- Cards dentro de cards dentro de cards.

Priorizar:

```text
spacing
+
contrast
+
typography
+
borders
+
accent indicators
+
motion
```

La interfaz debe seguir viéndose bien incluso con todos los efectos visuales desactivados.

---

# 4. Design Tokens

Centralizar todos los valores visuales.

No introducir colores, radios, sombras, tamaños o duraciones arbitrarias directamente en páginas o componentes.

Crear/reutilizar tokens para:

- Backgrounds.
- Surfaces.
- Elevated surfaces.
- Glass surfaces.
- Borders.
- Text colors.
- Accent colors.
- Semantic colors.
- Radius.
- Spacing.
- Typography.
- Motion.
- Elevation.

El objetivo es que cambiar la identidad visual de Veyra no requiera editar decenas de componentes.

---

# 5. Color

## Base

### Modo Oscuro (Fondo grafito `#121212` con barra nativa `#1B1B1B`)
```text
Background      #121212
Navigation Bar  #1B1B1B
Surface         #242424
Surface 2       #2C2C2C
Border          rgba(255,255,255,0.06)

Primary Text    #F4F4F5
Secondary Text  #A1A1AA
Muted Text      #71717A
```

### Modo Claro (Basado en el blanco nativo de Android `#FFFFFF`)
```text
Background      #FFFFFF
Surface         #F4F4F5
Surface 2       #EAEAEC
Border          rgba(0,0,0,0.06)

Primary Text    #0F172A
Secondary Text  #475569
Muted Text      #94A3B8
```

Estos valores son referencias iniciales. Adaptarlos al sistema de temas existente de Tamagui en lugar de duplicar colores.

## Accent colors

Mantener soporte para las seis variantes existentes:

- Purple.
- Blue.
- Red.
- Green.
- Amber.
- Pink.

El accent debe utilizarse principalmente para:

- Acción primaria.
- Estados activos.
- Indicadores.
- Progreso.
- Elementos seleccionados.
- Feedback importante.

Evitar inundar toda la pantalla con el accent.

---

# 6. Estados semánticos

Los niveles de control de Veyra también deben formar parte del lenguaje visual.

## Normal

Sensación:

- Neutral.
- Limpia.
- Poco invasiva.

Visual:

- Accent sutil.
- Sin animación constante.

## Strict

Sensación:

- Mayor urgencia.
- Mayor presencia.

Visual:

- Accent con mayor contraste.
- Indicador visual más visible.
- Posible microanimación puntual.

## Critical

Sensación:

- Prioridad máxima.

Visual:

- Rojo/Pink/Acento crítico.
- Indicador claramente visible.
- Glow extremadamente sutil.
- Pulse o breathing animation muy controlada.

La animación no debe convertirse en una distracción permanente.

---

# 7. Tipografía

Mantener Inter como fuente principal.

Jerarquía clara:

```text
Display
Heading
Section
Body
Label
Caption
Micro label
```

Utilizar tipografía para crear personalidad en lugar de aumentar efectos visuales.

Las métricas importantes pueden utilizar:

- Tamaños grandes.
- Peso semibold/bold.
- Espaciado limpio.
- Alto contraste.

Evitar saturar con texto en mayúsculas.

---

# 8. Border Radius

Evitar el patrón:

```text
everything = borderRadius: 24
```

Crear pocos niveles de radius.

Ejemplo conceptual:

```text
Small       6-8
Medium      10-12
Large       14-16
Pill        999
```

Utilizar el menor radius que mantenga una apariencia agradable.

Los elementos críticos, botones y cards importantes no necesitan ser excesivamente redondeados.

---

# 9. Borders

Los borders deben ser parte importante del lenguaje visual.

Preferir:

```text
1px
low opacity
high consistency
```

Ejemplo:

```text
rgba(255,255,255,0.05)
rgba(255,255,255,0.08)
```

El border debe separar superficies sin llamar demasiado la atención.

---

# 10. Glassmorphism

El glass de Veyra debe ser **sutil y funcional**.

Características:

- Fondo semitransparente.
- Border ligeramente visible.
- Blur moderado.
- Contraste suficiente.
- Sin saturación excesiva.

Conceptualmente:

```text
background:
rgba(surface, 0.65)

border:
rgba(255,255,255,0.08)

blur:
moderate
```

## Rendimiento

No utilizar BlurView en grandes cantidades.

Evitar:

```text
lista de 20 elementos
+
20 BlurViews
```

Preferir:

```text
contenido sólido
+
1 overlay glass
```

Cuando un efecto pueda conseguirse con una superficie semitransparente en vez de blur, preferir la solución más barata.

---

# 11. Elevación

No crear profundidad solamente con shadows.

Usar una jerarquía:

```text
Level 0
Background

Level 1
Surface

Level 2
Elevated Surface

Level 3
Glass / Overlay

Level 4
Critical / Focused
```

La profundidad debe entenderse incluso sin sombras.

---

# 12. Motion System

Veyra debe sentirse viva, pero no animada constantemente.

Las animaciones deben ser:

- Rápidas.
- Suaves.
- Predecibles.
- Cortas.
- Con propósito.

Crear tokens de motion.

Referencia:

```text
fast        120-160ms
normal      180-240ms
slow        260-320ms
spring      use for natural interaction
```

No inventar duraciones nuevas en cada componente.

---

# 13. Qué animar

Priorizar microinteracciones:

## Aparición

```text
opacity: 0 -> 1
scale: 0.97 -> 1
```

## Entrada de modal

```text
opacity
+
small scale
+
optional backdrop blur
```

## Completion

Cuando se completa una tarea:

```text
checkbox transition
+
small scale feedback
+
content transition
```

## Snooze

Cuando se pospone:

```text
item moves/fades
+
next item becomes prominent
```

## Critical

Puede utilizar:

```text
subtle pulse
```

Nunca usar un efecto exagerado.

---

# 14. Reglas de rendimiento para animaciones

Preferir animar:

- opacity.
- transform.
- scale.
- translate.
- rotation.
- propiedades que no provoquen re-layout.

Evitar animar continuamente:

- width.
- height.
- margin.
- padding.
- top.
- left.

No ejecutar animaciones innecesarias en elementos que están fuera de pantalla.

No crear loops infinitos salvo que tengan una función real.

No usar animaciones para decorar cada elemento.

---

# 15. Componentes base de Veyra

Antes de rediseñar muchas páginas, crear o adaptar una pequeña biblioteca visual reutilizable.

Conceptualmente:

```text
VeyraSurface
VeyraGlass
VeyraCard
VeyraButton
VeyraIconButton
VeyraBadge
VeyraIndicator
VeyraMetric
VeyraProgress
VeyraListItem
VeyraModal
VeyraSheet
VeyraDivider
VeyraSectionHeader
```

Estos componentes deben encapsular:

- Color.
- Radius.
- Border.
- Padding.
- Motion.
- Estados.
- Tema.
- Variantes.

Evitar duplicar estilos entre páginas.

---

# 16. Dashboard

El Dashboard debe convertirse en la pantalla que mejor represente Veyra.

La sección **NOW** debe ser visualmente dominante.

Jerarquía aproximada:

```text
NOW
↓
tarea más importante
↓
estado / deadline / control level
↓
acciones
↓
TODAY
↓
otras tareas
↓
métricas
```

La interfaz debe transmitir prioridad sin necesitar muchos colores.

Una tarea importante debe ganar jerarquía mediante:

- Tamaño.
- Posición.
- Espaciado.
- Tipografía.
- Indicador de accent.
- Motion.

No crear una colección de cards idénticas.

---

# 17. Sistema "Now"

El concepto NOW es parte de la identidad de Veyra.

Cuando existe una tarea urgente:

- Debe sentirse presente.
- Debe reducirse la información secundaria.
- Debe existir una acción clara.
- El usuario debe entender rápidamente qué debe hacer.

Cuando no existe una tarea urgente, utilizar un estado calmado.

Por ejemplo:

```text
NOW

Nothing requires your attention.

     You're clear.
```

El estado vacío también debe sentirse diseñado, no como un simple "No tasks".

---

# 18. Dashboard: agrupación

Mantener la lógica existente:

```text
Overdue
Today
Upcoming
```

Pero evitar tres grandes bloques visualmente pesados.

Utilizar:

- Section headers.
- Dividers.
- Espaciado.
- Indicadores.
- List items.

La pantalla debe sentirse ligera.

---

# 19. Notes

El módulo de Notes debe compartir el mismo lenguaje visual, pero sentirse más editorial.

Priorizar:

- Typography.
- Espaciado.
- Lectura.
- Jerarquía.
- Imágenes.
- Metadata.

No convertir Notes en otra pantalla llena de cards.

Las notas pueden funcionar mejor con superficies mínimas y separators sutiles.

---

# 20. Stats

Las estadísticas deben sentirse analíticas, pero minimalistas.

Priorizar:

```text
big number
+
small context
+
trend
```

Ejemplo:

```text
84%

COMPLIANCE

↑ 7% this week
```

Evitar dashboards saturados con gráficos innecesarios.

Cada métrica debe responder una pregunta útil.

---

# 21. Discipline Mode

Discipline Mode puede tener una identidad visual ligeramente más intensa sin crear un tema completamente diferente.

Usar:

- Mayor contraste.
- Menos elementos secundarios.
- Mayor foco en la tarea actual.
- Motion más deliberado.
- Estados visuales claros.

No crear una pantalla visualmente desconectada del resto de Veyra.

---

# 22. Settings

Settings debe ser la pantalla más conservadora.

Priorizar:

- legibilidad.
- agrupación.
- consistencia.
- interacción clara.

Glass puede aparecer en:

- selectors.
- sheets.
- diálogos.
- menus.

Evitar decorar Settings innecesariamente.

---

# 23. Floating Action Button

El FloatingCreateButton debe ser uno de los elementos reconocibles de Veyra.

Debe sentirse:

- preciso.
- ligero.
- accesible.
- premium.

Utilizar:

```text
subtle scale on press
+
small haptic feedback
+
controlled shadow/glow
```

No usar una animación constante.

---

# 24. Feedback háptico

El feedback háptico debe utilizarse únicamente en interacciones relevantes:

- completion.
- critical confirmation.
- button press importante.
- cambio de modo.
- acciones destructivas.

No hacer vibrar cada interacción.

---

# 25. Iconografía

Mantener Lucide.

Reglas:

- Consistencia de stroke.
- Tamaños limitados.
- No mezclar estilos.
- No utilizar iconos únicamente como decoración.

Usar iconos para reforzar el significado de una acción o estado.

---

# 26. Accesibilidad

El rediseño no debe sacrificar:

- contraste.
- touch targets.
- legibilidad.
- feedback de estados.
- navegación clara.

El color nunca debe ser la única forma de comunicar un estado.

Por ejemplo:

```text
Critical
icon + label + accent
```

no solamente:

```text
red
```

---

# 27. Regla de oro para el agente

Antes de modificar una pantalla:

1. Analizar el diseño actual.
2. Identificar qué componentes ya existen.
3. Reutilizar tokens y componentes existentes.
4. Determinar qué elementos son contenido principal y cuáles son secundarios.
5. Aplicar Solid al contenido principal.
6. Aplicar Glass únicamente a overlays/contextual UI.
7. Añadir motion solamente cuando aporte feedback.
8. Mantener la lógica de negocio intacta.
9. Evitar cambios innecesarios de arquitectura.
10. Comprobar rendimiento y posibles renders adicionales.

No rehacer componentes funcionales únicamente para cambiar su apariencia.

---

# 28. Proceso de rediseño página por página

Trabajar en este orden:

```text
1. Design Tokens
2. Surface / Glass primitives
3. Buttons / Inputs / Badges / Indicators
4. Dashboard
5. Tasks
6. Notes
7. Stats
8. Discipline Mode
9. Sounds
10. Settings
11. Upgrade / Premium
12. Remaining secondary screens
```

Cada página debe reutilizar lo construido anteriormente.

No crear una nueva estética por pantalla.

---

# 29. Checklist después de cada página

## Visual

- [ ] Se siente parte de Veyra.
- [ ] No parece una UI SaaS genérica.
- [ ] La jerarquía visual es clara.
- [ ] Hay suficiente espacio.
- [ ] El accent está controlado.
- [ ] Las superficies no están excesivamente decoradas.
- [ ] Glass solamente aparece donde tiene sentido.

## Motion

- [ ] Las animaciones tienen propósito.
- [ ] No existen loops innecesarios.
- [ ] Las interacciones tienen feedback.
- [ ] No hay movimiento excesivo.

## Performance

- [ ] No se agregaron BlurViews innecesarios.
- [ ] No se introdujeron animaciones de layout innecesarias.
- [ ] No se crearon renders adicionales sin motivo.
- [ ] Las listas siguen siendo eficientes.
- [ ] El rediseño no rompe el comportamiento offline.

## Funcionalidad

- [ ] Ninguna función fue eliminada.
- [ ] Ninguna lógica de negocio fue cambiada accidentalmente.
- [ ] Notificaciones siguen funcionando.
- [ ] SQLite sigue funcionando.
- [ ] Supabase sync sigue funcionando.
- [ ] Temas siguen funcionando.
- [ ] Idiomas ES/EN siguen funcionando.

---

# 30. Restricción importante

**No convertir Veyra en una demo visual.**

El objetivo es que parezca una aplicación premium real que podría publicarse en App Store / Google Play.

Prioridad:

```text
Usability
>
Performance
>
Consistency
>
Visual polish
>
Effects
```

Nunca sacrificar rendimiento o claridad para agregar un efecto visual.

---

# 31. Resultado esperado

Al finalizar el proceso, Veyra debe sentirse como un producto con un lenguaje visual reconocible:

```text
Veyra

Dark
Precise
Minimal
Focused
Controlled
Responsive

Solid core
Glass context
Subtle motion
Strong typography
Controlled accent
```

El usuario debería reconocer que una pantalla pertenece a Veyra incluso sin ver el logo.

---

# 32. Instrucción para futuras tareas del agente

Cuando se solicite rediseñar una página o componente:

> Rediseña únicamente la página/componente solicitado siguiendo este documento como fuente de verdad visual. Mantén intacta la lógica de negocio y la arquitectura existente. Reutiliza los tokens y componentes de Veyra antes de crear otros nuevos. Usa superficies sólidas para contenido principal y glass únicamente para elementos secundarios, overlays y contenido contextual. Las animaciones deben ser sutiles, funcionales y eficientes. No agregues efectos solo por decoración. La página debe sentirse parte del mismo sistema visual que el resto de Veyra.

Si para implementar el diseño es necesario crear una nueva primitive reutilizable, créala dentro del Design System y reutilízala posteriormente en lugar de crear estilos duplicados.
