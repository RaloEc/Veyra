import { ReminderService } from '../services/reminderService';
import { NoteService } from '../services/noteService';
import { FolderService } from '../services/folderService';
import { useStore } from '../store/useStore';
import { useNotesStore } from '../store/useNotesStore';
import { useFoldersStore } from '../store/useFoldersStore';

/**
 * seedTestData — Inserta un conjunto completo y realista de datos de demostración
 * que aprovecha todas las funcionalidades construidas en Veyra:
 * - Carpetas temáticas personalizadas con iconos Lucide y colores (fijadas y generales)
 * - Notas con formato enriquecido (organizadas en carpetas, fijadas y sin carpeta)
 * - Recordatorios con todos los niveles de control (normal, strict, critical)
 * - Subtareas interactivas (pendientes y completadas)
 * - Eventos a lo largo de todo el mes para nutrir el calendario interactivo
 */
export async function seedTestData() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();

    // ==========================================
    // 1. CARPETAS PERSONALIZADAS (LUCIDE + COLOR)
    // ==========================================
    const uniFolder = await FolderService.createFolder(
        'Universidad',
        'graduation-cap',
        '#3B82F6', // Azul
        'local_user',
        true // Fijada en Acceso Rápido
    );

    const workFolder = await FolderService.createFolder(
        'Proyectos & Trabajo',
        'briefcase',
        '#8B5CF6', // Púrpura
        'local_user',
        true // Fijada en Acceso Rápido
    );

    const ideasFolder = await FolderService.createFolder(
        'Ideas & Estrategia',
        'lightbulb',
        '#F59E0B', // Ámbar
        'local_user',
        false
    );

    const readingFolder = await FolderService.createFolder(
        'Lecturas & Recursos',
        'book-open',
        '#10B981', // Esmeralda
        'local_user',
        false
    );

    // ==========================================
    // 2. NOTAS PERSONALIZADAS POR CARPETA
    // ==========================================

    // En Carpeta Universidad (Fijada)
    await NoteService.createNote(
        'Sistemas Distribuidos — Apuntes de Clase',
        '<h1>Arquitectura y Modelos de Consistencia</h1><p>Resumen de conceptos clave para el examen parcial:</p><ul><li><b>Teorema CAP:</b> En un sistema distribuido solo se pueden garantizar 2 de 3 propiedades (Consistencia, Disponibilidad, Tolerancia a Particiones).</li><li><b>Consistencia Eventual:</b> Los nodos convergen tras un tiempo si no hay nuevas escrituras.</li><li><b>Replicación Raft/Paxos:</b> Consenso distribuido con líder elegido.</li></ul>',
        undefined,
        undefined,
        true, // Fijada
        'local_user',
        uniFolder.id
    );

    await NoteService.createNote(
        'Proyecto Final: Cronograma y Entregables',
        '<p>Plan de trabajo para la entrega final del semestre:</p><ol><li><b>Semana 1:</b> Diseño de base de datos relacional y esquemas.</li><li><b>Semana 2:</b> Implementación de API RESTful y autenticación JWT.</li><li><b>Semana 3:</b> Pruebas unitarias, documentación y despliegue.</li></ol>',
        undefined,
        undefined,
        false,
        'local_user',
        uniFolder.id
    );

    // En Carpeta Proyectos & Trabajo (Fijada)
    await NoteService.createNote(
        'Filosofía de Diseño y Arquitectura Veyra',
        '<h1>Principios Fundamentales de Veyra</h1><p>Veyra está concebida como una herramienta de disciplina y productividad personal enfocada en velocidad, control y elegancia.</p><ul><li><b>Local-First:</b> Almacenamiento local ultrarrápido con SQLite sin latencia de red.</li><li><b>Diseño Consistente:</b> Superficies con elevación sutil, tipografía cuidada y micro-animaciones fluidas.</li><li><b>Disciplina Inteligente:</b> Niveles de control estrictos para eliminar la procrastinación.</li></ul>',
        undefined,
        undefined,
        true, // Fijada
        'local_user',
        workFolder.id
    );

    await NoteService.createNote(
        'Lanzamiento Beta — Plan de QA y Pruebas',
        '<p>Puntos de verificación antes de compilar la versión de prueba:</p><ul><li>Probar persistencia de carpetas y notas tras reinicio de app.</li><li>Verificar respuesta del selector de fecha y rueda de hora.</li><li>Comprobar visualización correcta en tema Claro y Oscuro.</li></ul>',
        undefined,
        undefined,
        false,
        'local_user',
        workFolder.id
    );

    // En Carpeta Ideas & Estrategia
    await NoteService.createNote(
        'Brainstorming: Nuevas Funcionalidades 2026',
        '<p>Ideas potenciales para iteraciones futuras:</p><ul><li><b>Widgets de Inicio:</b> Vista rápida de recordatorios del día en pantalla principal.</li><li><b>Modo Enfoque Pomodoro:</b> Temporizador integrado con registro de bloques productivos.</li><li><b>Comandos de Voz:</b> Creación rápida de notas mediante transcripción local.</li></ul>',
        undefined,
        undefined,
        false,
        'local_user',
        ideasFolder.id
    );

    // En Carpeta Lecturas & Recursos
    await NoteService.createNote(
        'Resumen: Deep Work (Cal Newport)',
        '<h1>Las 4 Reglas del Trabajo Profundo</h1><ol><li><b>Trabajar con profundidad:</b> Establecer rituales y eliminar interrupciones.</li><li><b>Abrazar el aburrimiento:</b> Entrenar la mente para resistir estímulos constantes.</li><li><b>Renunciar a las redes sociales:</b> Evaluar herramientas según su impacto real.</li><li><b>Eliminar lo superficial:</b> Proteger el tiempo dedicado a actividades de alto valor.</li></ol>',
        undefined,
        undefined,
        false,
        'local_user',
        readingFolder.id
    );

    // Notas sin carpeta (Unassigned)
    await NoteService.createNote(
        'Receta: Pasta al Pesto Casero',
        '<p>Ingredientes necesarios para 4 porciones:</p><ul><li>Hojas de albahaca fresca (2 tazas bien compactas)</li><li>Piñones o nueces tostadas (1/3 taza)</li><li>Aceite de oliva extra virgen (1/2 taza)</li><li>Queso parmesano reggiano rallado (1/2 taza)</li><li>1 diente de ajo pequeño y una pizca de sal marina</li></ul>',
        undefined,
        undefined,
        false,
        'local_user',
        null
    );

    await NoteService.createNote(
        'Checklist Rápido: Equipaje de Viaje',
        '<p>No olvidar antes de salir:</p><ul><li>Cargador rápido USB-C y adaptador universal</li><li>Documento de identidad y pasaporte</li><li>Auriculares con cancelación de ruido</li><li>Botiquín básico de viaje</li></ul>',
        undefined,
        undefined,
        false,
        'local_user',
        null
    );

    // ==========================================
    // 3. RECORDATORIOS CON SUBTAREAS & DISCIPLINA
    // ==========================================

    // 1. Recordatorio Hoy (Urgente / Crítico a las 18:00)
    const todayCritical = new Date(currentYear, currentMonth, currentDay, 18, 0, 0);
    const subtasks1 = JSON.stringify([
        { id: 'st-1', title: 'Exportar datos del mes en CSV', completed: true },
        { id: 'st-2', title: 'Ajustar gráfico de conversión y métricas', completed: true },
        { id: 'st-3', title: 'Enviar reporte consolidado a dirección', completed: false },
    ]);
    await ReminderService.createReminder(
        'Entrega del reporte de métricas y balance',
        todayCritical.getTime(),
        'critical',
        'local_user',
        '<p>Validar los resultados antes del cierre de mes y compartir el informe consolidado.</p>',
        undefined,
        undefined,
        undefined,
        subtasks1
    );

    // 2. Recordatorio Hoy (Estricto a las 11:30)
    const todayStrict = new Date(currentYear, currentMonth, currentDay, 11, 30, 0);
    const subtasks2 = JSON.stringify([
        { id: 'st-4', title: 'Revisar orden del día y prioridades', completed: true },
        { id: 'st-5', title: 'Asignar responsables por bloque técnico', completed: false },
    ]);
    await ReminderService.createReminder(
        'Reunión de planificación semanal',
        todayStrict.getTime(),
        'strict',
        'local_user',
        '<p>Alinear objetivos del sprint y resolver bloqueos técnicos pendientes.</p>',
        undefined,
        undefined,
        undefined,
        subtasks2
    );

    // 3. Recordatorio Hoy (Normal a las 20:00)
    const todayNormal = new Date(currentYear, currentMonth, currentDay, 20, 0, 0);
    const subtasks3 = JSON.stringify([
        { id: 'st-6', title: 'Café de grano tostado', completed: false },
        { id: 'st-7', title: 'Frutas y verduras frescas', completed: false },
        { id: 'st-8', title: 'Agua mineral con gas', completed: false },
    ]);
    await ReminderService.createReminder(
        'Compras y provisiones de la semana',
        todayNormal.getTime(),
        'normal',
        'local_user',
        '<p>Pasar por el supermercado al salir de la oficina.</p>',
        undefined,
        undefined,
        undefined,
        subtasks3
    );

    // 4. Recordatorio Mañana (Normal a las 09:00)
    const tomorrowMorning = new Date(currentYear, currentMonth, currentDay + 1, 9, 0, 0);
    await ReminderService.createReminder(
        'Sesión de lectura y estudio de arquitectura',
        tomorrowMorning.getTime(),
        'normal',
        'local_user',
        '<p>Leer capítulos sobre diseño de sistemas distribuidos y bases de datos locales.</p>'
    );

    // 5. Recordatorio Vencido (Ayer a las 15:00)
    const yesterdayDate = new Date(currentYear, currentMonth, currentDay - 1, 15, 0, 0);
    const subtasks4 = JSON.stringify([
        { id: 'st-9', title: 'Verificar método de pago activo', completed: true },
        { id: 'st-10', title: 'Descargar comprobante de pago', completed: false },
    ]);
    await ReminderService.createReminder(
        'Renovación de suscripción del servidor',
        yesterdayDate.getTime(),
        'strict',
        'local_user',
        '<p>Confirmar que el débito automático se procesó correctamente.</p>',
        undefined,
        undefined,
        undefined,
        subtasks4
    );

    // 6. Recordatorios a lo largo del mes para enriquecer el Calendario
    const day5 = new Date(currentYear, currentMonth, 5, 10, 0, 0);
    await ReminderService.createReminder(
        'Mantenimiento preventivo del vehículo',
        day5.getTime(),
        'strict',
        'local_user',
        '<p>Cambio de aceite, filtro y revisión de frenos.</p>'
    );

    const day12 = new Date(currentYear, currentMonth, 12, 16, 30, 0);
    await ReminderService.createReminder(
        'Consulta de control médico general',
        day12.getTime(),
        'normal',
        'local_user',
        '<p>Llevar resultados de exámenes recientes y chequeo de rutina.</p>'
    );

    const day18 = new Date(currentYear, currentMonth, 18, 14, 0, 0);
    const subtasks5 = JSON.stringify([
        { id: 'st-11', title: 'Pago de arriendo mensual', completed: false },
        { id: 'st-12', title: 'Pago de energía e internet de alta velocidad', completed: false },
    ]);
    await ReminderService.createReminder(
        'Pago de servicios mensuales y arriendo',
        day18.getTime(),
        'critical',
        'local_user',
        '<p>Realizar transferencias antes de la fecha límite de corte bancario.</p>',
        undefined,
        undefined,
        undefined,
        subtasks5
    );

    const day25 = new Date(currentYear, currentMonth, 25, 17, 0, 0);
    const subtasks6 = JSON.stringify([
        { id: 'st-13', title: 'Conciliar facturas emitidas y recibidas', completed: false },
        { id: 'st-14', title: 'Archivar comprobantes contables en la nube', completed: false },
    ]);
    await ReminderService.createReminder(
        'Cierre de balances y auditoría contable',
        day25.getTime(),
        'critical',
        'local_user',
        '<p>Revisar estados contables y cuadrar diferencias.</p>',
        undefined,
        undefined,
        undefined,
        subtasks6
    );

    // ==========================================
    // 4. RECARGAR STORES GLOBALES
    // ==========================================
    const store = useStore.getState();
    await store.loadReminders();
    await store.loadHistory();
    await useNotesStore.getState().loadNotes();
    await useFoldersStore.getState().loadFolders();
}
