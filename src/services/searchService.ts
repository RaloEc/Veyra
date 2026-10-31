import AsyncStorage from '@react-native-async-storage/async-storage';
import { withDB, withSerializedTransaction } from '../db';
import { Reminder, Note, CalendarEvent, Folder, Subtask } from '../types/db';
import { parseNotePages, extractPlainTextFromPages } from '../utils/pageUtils';

export type SearchEntityType = 'reminder' | 'note' | 'event' | 'folder' | 'attachment' | 'schedule';
export type SearchFilterCategory = 'all' | 'reminders' | 'notes' | 'events' | 'folders' | 'schedule' | 'attachments';

export interface SearchResultMeta {
    pageIndex?: number;
    matchedPageTitle?: string;
    subtaskTitle?: string;
    subtaskCompleted?: boolean;
    controlLevel?: string;
    status?: string;
    dueDateMs?: number;
    startTimeMs?: number;
    endTimeMs?: number;
    color?: string;
    attachmentUri?: string;
    attachmentName?: string;
    folderId?: string | null;
    isPinned?: boolean;
    parentType?: 'reminder' | 'note' | 'event';
}

export interface SearchResultItem {
    id: string;
    type: SearchEntityType;
    title: string;
    snippet: string;
    highlightTerms: string[];
    keywords: string[];
    updatedAt: number;
    parentId?: string;
    parentTitle?: string;
    meta: SearchResultMeta;
    score: number;
}

const RECENT_SEARCHES_STORAGE_KEY = '@veyra_recent_searches_v1';
const MAX_RECENT_SEARCHES = 10;

/**
 * Normaliza una cadena de texto para comparación agnóstica a tildes, mayúsculas y signos.
 */
export function normalizeSearchText(text?: string | null): string {
    if (!text || typeof text !== 'string') return '';
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Genera un patrón de expresión regular insensible a tildes/diacríticos y mayúsculas
 * para localizar términos dentro de una cadena preservando los índices de corte reales.
 */
export function buildDiacriticRegexPattern(term: string): string {
    if (!term) return '';
    const norm = normalizeSearchText(term);
    if (!norm) return '';
    const escaped = norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped
        .replace(/a/gi, '[aáàäâã]')
        .replace(/e/gi, '[eéèëê]')
        .replace(/i/gi, '[iíìïî]')
        .replace(/o/gi, '[oóòöôõ]')
        .replace(/u/gi, '[uúùüû]')
        .replace(/n/gi, '[nñ]');
}

/**
 * Genera un fragmento de texto (snippet) de ~120 caracteres centrado en el término coincidente.
 */
export function generateSnippet(content: string, searchTerms: string[], maxLength = 120): string {
    if (!content) return '';
    const cleanContent = content.replace(/\s+/g, ' ').trim();
    if (!cleanContent) return '';

    let bestIndex = -1;

    for (const term of searchTerms) {
        if (!term) continue;
        const pattern = buildDiacriticRegexPattern(term);
        if (!pattern) continue;
        try {
            const rx = new RegExp(pattern, 'i');
            const match = cleanContent.match(rx);
            if (match && match.index !== undefined) {
                bestIndex = match.index;
                break;
            }
        } catch {}
    }

    if (bestIndex === -1) {
        return cleanContent.length > maxLength
            ? cleanContent.substring(0, maxLength) + '...'
            : cleanContent;
    }

    const start = Math.max(0, bestIndex - Math.floor(maxLength / 3));
    const end = Math.min(cleanContent.length, start + maxLength);

    let snippet = cleanContent.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < cleanContent.length) snippet = snippet + '...';

    return snippet;
}

let warmIndexPromise: Promise<void> | null = null;

export const SearchService = {
    /**
     * Normaliza texto para indexación y búsqueda.
     */
    normalize(text?: string | null): string {
        return normalizeSearchText(text);
    },

    // ─────────────────────────────────────────────────────────────
    // INDEXADORES INDIVIDUALES (OPTIMIZADOS CON TRANSACCIÓN)
    // ─────────────────────────────────────────────────────────────

    async indexReminderInternal(db: any, reminder: Reminder, preloadedTagsText?: string): Promise<void> {
        const now = reminder.last_modified_ms || Date.now();
        const titleNorm = normalizeSearchText(reminder.title);
        const descNorm = normalizeSearchText(reminder.description || '');

        let subtasksText = '';
        let subtasksList: Subtask[] = [];
        if (reminder.subtasks) {
            try {
                subtasksList = JSON.parse(reminder.subtasks);
                if (Array.isArray(subtasksList)) {
                    subtasksText = subtasksList.map(s => s.title).join(' ');
                }
            } catch {}
        }

        const subtasksNorm = normalizeSearchText(subtasksText);

        let tagsText = preloadedTagsText ?? '';
        if (preloadedTagsText === undefined) {
            try {
                const tagRows = (await db.getAllAsync(
                    `SELECT t.name, t.slug FROM tags t INNER JOIN item_tags it ON t.id = it.tag_id WHERE it.item_type = 'reminder' AND it.item_id = ?`,
                    [reminder.id]
                )) as Array<{ name: string; slug: string }>;
                if (tagRows && tagRows.length > 0) {
                    tagsText = tagRows.map((t: { name: string; slug: string }) => `${t.name} ${t.slug}`).join(' ');
                }
            } catch {}
        }

        const keywordsArr = [
            titleNorm,
            descNorm,
            subtasksNorm,
            normalizeSearchText(tagsText),
            reminder.control_level,
            reminder.status,
            reminder.repeat_rule ? 'recurrente' : '',
            reminder.status === 'completed' ? 'completado hecho finalizado' : 'pendiente activo',
            reminder.control_level === 'critical' ? 'critico urgente vital' : '',
            reminder.control_level === 'strict' ? 'estricto importante' : '',
        ].filter(Boolean);

        const keywords = keywordsArr.join(' ');
        const content = (reminder.description || '') + (subtasksText ? `\nSubtareas: ${subtasksText}` : '');

        const meta: SearchResultMeta = {
            controlLevel: reminder.control_level,
            status: reminder.status,
            dueDateMs: reminder.due_date_ms,
            isPinned: reminder.priority > 0,
        };

        await db.runAsync(
            `INSERT INTO search_index (entity_type, entity_id, title, content, keywords, parent_id, extra_meta, updated_at_ms, deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(entity_type, entity_id) DO UPDATE SET
               title = excluded.title,
               content = excluded.content,
               keywords = excluded.keywords,
               extra_meta = excluded.extra_meta,
               updated_at_ms = excluded.updated_at_ms,
               deleted = excluded.deleted`,
            [
                'reminder',
                reminder.id,
                reminder.title,
                content,
                keywords,
                null,
                JSON.stringify(meta),
                now,
                reminder.deleted ? 1 : 0,
            ]
        );

        if (reminder.attachments && !reminder.deleted) {
            try {
                const attachments = JSON.parse(reminder.attachments);
                if (Array.isArray(attachments)) {
                    for (let i = 0; i < attachments.length; i++) {
                        const att = attachments[i];
                        const uri = typeof att === 'string' ? att : att?.uri;
                        const isValidUri = typeof uri === 'string' && uri.length > 4 && (uri.includes('/') || uri.startsWith('http') || uri.startsWith('file:') || uri.startsWith('content:'));
                        if (!isValidUri) continue;
                        const name = (typeof att === 'object' ? att?.name : undefined) || uri.split('/').pop() || `Adjunto ${i + 1}`;
                        if (uri) {
                            const attMeta: SearchResultMeta = {
                                attachmentUri: uri,
                                attachmentName: name,
                                parentType: 'reminder',
                            };
                            await db.runAsync(
                                `INSERT INTO search_index (entity_type, entity_id, title, content, keywords, parent_id, extra_meta, updated_at_ms, deleted)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                                 ON CONFLICT(entity_type, entity_id) DO UPDATE SET
                                   title = excluded.title,
                                   parent_id = excluded.parent_id,
                                   extra_meta = excluded.extra_meta,
                                   updated_at_ms = excluded.updated_at_ms,
                                   deleted = excluded.deleted`,
                                [
                                    'attachment',
                                    `${reminder.id}_att_${i}`,
                                    name,
                                    `Adjunto de recordatorio: ${reminder.title}`,
                                    `archivo imagen adjunto ${normalizeSearchText(name)} ${titleNorm}`,
                                    reminder.id,
                                    JSON.stringify(attMeta),
                                    now,
                                    0,
                                ]
                            );
                        }
                    }
                }
            } catch {}
        }
    },

    async indexReminder(reminder: Reminder): Promise<void> {
        try {
            await withDB(async (db) => {
                await this.indexReminderInternal(db, reminder);
            });
        } catch (err) {
            console.warn('[SearchService] Error al indexar recordatorio:', err);
        }
    },

    async indexNoteInternal(db: any, note: Note): Promise<void> {
        const now = note.updated_at_ms || note.last_modified_ms || Date.now();
        const title = note.title || 'Nota sin título';

        const { pages } = parseNotePages(note.content);
        const fullText = extractPlainTextFromPages(note.content);
        const titleNorm = normalizeSearchText(title);
        const fullTextNorm = normalizeSearchText(fullText);

        const pagesSummary = pages.map((p, idx) => ({
            index: idx,
            id: p.id,
            title: p.title || `Página ${idx + 1}`,
            text: p.content
                ? p.content
                    .replace(/<img[^>]*>/gi, ' ')
                    .replace(/data:image\/[^"'\s>]+/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .substring(0, 1000)
                : '',
        }));

        const keywordsArr = [
            titleNorm,
            fullTextNorm,
            note.is_pinned ? 'fijada destacada' : '',
            note.sync_mode === 'yjs' ? 'colaborativa' : '',
            pagesSummary.map(p => normalizeSearchText(p.title)).join(' '),
        ].filter(Boolean);

        const meta: SearchResultMeta = {
            folderId: note.folder_id,
            isPinned: Boolean(note.is_pinned),
        };

        const extraMeta = {
            ...meta,
            pages: pagesSummary,
        };

        await db.runAsync(
            `INSERT INTO search_index (entity_type, entity_id, title, content, keywords, parent_id, extra_meta, updated_at_ms, deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(entity_type, entity_id) DO UPDATE SET
               title = excluded.title,
               content = excluded.content,
               keywords = excluded.keywords,
               parent_id = excluded.parent_id,
               extra_meta = excluded.extra_meta,
               updated_at_ms = excluded.updated_at_ms,
               deleted = excluded.deleted`,
            [
                'note',
                note.id,
                title,
                fullText,
                keywordsArr.join(' '),
                note.folder_id || null,
                JSON.stringify(extraMeta),
                now,
                note.deleted ? 1 : 0,
            ]
        );

        if (note.attachments && !note.deleted) {
            try {
                const attachments = JSON.parse(note.attachments);
                if (Array.isArray(attachments)) {
                    for (let i = 0; i < attachments.length; i++) {
                        const att = attachments[i];
                        const uri = typeof att === 'string' ? att : att?.uri;
                        const isValidUri = typeof uri === 'string' && uri.length > 4 && (uri.includes('/') || uri.startsWith('http') || uri.startsWith('file:') || uri.startsWith('content:'));
                        if (!isValidUri) continue;
                        const name = (typeof att === 'object' ? att?.name : undefined) || uri.split('/').pop() || `Adjunto ${i + 1}`;
                        if (uri) {
                            const attMeta: SearchResultMeta = {
                                attachmentUri: uri,
                                attachmentName: name,
                                folderId: note.folder_id,
                                parentType: 'note',
                            };
                            await db.runAsync(
                                `INSERT INTO search_index (entity_type, entity_id, title, content, keywords, parent_id, extra_meta, updated_at_ms, deleted)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                                 ON CONFLICT(entity_type, entity_id) DO UPDATE SET
                                   title = excluded.title,
                                   parent_id = excluded.parent_id,
                                   extra_meta = excluded.extra_meta,
                                   updated_at_ms = excluded.updated_at_ms,
                                   deleted = excluded.deleted`,
                                [
                                    'attachment',
                                    `${note.id}_att_${i}`,
                                    name,
                                    `Adjunto de nota: ${title}`,
                                    `archivo imagen adjunto ${normalizeSearchText(name)} ${titleNorm}`,
                                    note.id,
                                    JSON.stringify(attMeta),
                                    now,
                                    0,
                                ]
                            );
                        }
                    }
                }
            } catch {}
        }
    },

    async indexNote(note: Note): Promise<void> {
        try {
            await withDB(async (db) => {
                await this.indexNoteInternal(db, note);
            });
        } catch (err) {
            console.warn('[SearchService] Error al indexar nota:', err);
        }
    },

    async indexEventInternal(db: any, event: CalendarEvent, preloadedTagsText?: string): Promise<void> {
        const now = event.updated_at_ms || event.last_modified_ms || Date.now();
        const title = event.title || 'Evento sin título';
        const desc = event.description || '';
        const location = event.location || '';
        const titleNorm = normalizeSearchText(title);
        const descNorm = normalizeSearchText(desc);
        const locationNorm = normalizeSearchText(location);

        let tagsArr: string[] = [];
        if (event.tags) {
            try {
                const parsed = JSON.parse(event.tags);
                if (Array.isArray(parsed)) tagsArr = parsed;
            } catch {}
        }

        let itemTagsText = preloadedTagsText ?? '';
        if (preloadedTagsText === undefined) {
            try {
                const tagRows = (await db.getAllAsync(
                    `SELECT t.name, t.slug FROM tags t INNER JOIN item_tags it ON t.id = it.tag_id WHERE it.item_type = 'event' AND it.item_id = ?`,
                    [event.id]
                )) as Array<{ name: string; slug: string }>;
                if (tagRows && tagRows.length > 0) {
                    itemTagsText = tagRows.map((t: { name: string; slug: string }) => `${t.name} ${t.slug}`).join(' ');
                }
            } catch {}
        }

        const keywordsArr = [
            titleNorm,
            descNorm,
            locationNorm ? `ubicacion lugar ${locationNorm}` : '',
            tagsArr.map(t => normalizeSearchText(t)).join(' '),
            normalizeSearchText(itemTagsText),
            event.is_all_day ? 'todo el dia allday' : '',
            event.is_birthday_like ? 'cumple cumpleanos birthday aniversario' : '',
            event.repeat_rule ? 'horario recurrente clase semanal anual' : '',
        ].filter(Boolean);

        const meta: SearchResultMeta = {
            startTimeMs: event.start_time_ms,
            endTimeMs: event.end_time_ms,
            color: event.color,
        };

        await db.runAsync(
            `INSERT INTO search_index (entity_type, entity_id, title, content, keywords, parent_id, extra_meta, updated_at_ms, deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(entity_type, entity_id) DO UPDATE SET
               title = excluded.title,
               content = excluded.content,
               keywords = excluded.keywords,
               extra_meta = excluded.extra_meta,
               updated_at_ms = excluded.updated_at_ms,
               deleted = excluded.deleted`,
            [
                event.repeat_rule ? 'schedule' : 'event',
                event.id,
                title,
                [desc, location, tagsArr.join(', ')].filter(Boolean).join('\n'),
                keywordsArr.join(' '),
                event.note_id || null,
                JSON.stringify(meta),
                now,
                event.deleted ? 1 : 0,
            ]
        );
    },

    async indexEvent(event: CalendarEvent): Promise<void> {
        try {
            await withDB(async (db) => {
                await this.indexEventInternal(db, event);
            });
        } catch (err) {
            console.warn('[SearchService] Error al indexar evento:', err);
        }
    },

    async indexFolderInternal(db: any, folder: Folder): Promise<void> {
        const now = folder.updated_at_ms || folder.last_modified_ms || Date.now();
        const nameNorm = normalizeSearchText(folder.name);
        const keywords = [
            nameNorm,
            'carpeta folder seccion',
            folder.is_pinned ? 'fijada destacada' : '',
            folder.icon || '',
        ].filter(Boolean).join(' ');

        const meta: SearchResultMeta = {
            color: folder.color,
            isPinned: Boolean(folder.is_pinned),
        };

        await db.runAsync(
            `INSERT INTO search_index (entity_type, entity_id, title, content, keywords, parent_id, extra_meta, updated_at_ms, deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(entity_type, entity_id) DO UPDATE SET
               title = excluded.title,
               keywords = excluded.keywords,
               parent_id = excluded.parent_id,
               extra_meta = excluded.extra_meta,
               updated_at_ms = excluded.updated_at_ms,
               deleted = excluded.deleted`,
            [
                'folder',
                folder.id,
                folder.name,
                `Carpeta: ${folder.name}`,
                keywords,
                folder.parent_id || null,
                JSON.stringify(meta),
                now,
                folder.deleted ? 1 : 0,
            ]
        );
    },

    async indexFolder(folder: Folder): Promise<void> {
        try {
            await withDB(async (db) => {
                await this.indexFolderInternal(db, folder);
            });
        } catch (err) {
            console.warn('[SearchService] Error al indexar carpeta:', err);
        }
    },

    async removeItem(entityType: SearchEntityType, entityId: string): Promise<void> {
        try {
            await withDB(async (db) => {
                await db.runAsync(
                    `UPDATE search_index SET deleted = 1 WHERE entity_type = ? AND (entity_id = ? OR parent_id = ?)`,
                    [entityType, entityId, entityId]
                );
            });
        } catch (err) {
            console.warn('[SearchService] Error al remover elemento de índice:', err);
        }
    },

    /**
     * Reconstruye por completo el índice de búsqueda en una única transacción ultra-rápida.
     */
    async rebuildIndex(): Promise<{ reminders: number; notes: number; events: number; folders: number }> {
        return withDB(async (db) => {
            console.log('[SearchService] Reconstruyendo search_index en transacción atómica...');
            const stats = { reminders: 0, notes: 0, events: 0, folders: 0 };

            const [reminders, notes, events, folders, reminderTags, eventTags] = await Promise.all([
                db.getAllAsync<Reminder>(`SELECT * FROM reminders WHERE deleted = 0`),
                db.getAllAsync<Note>(`SELECT * FROM notes WHERE deleted = 0`),
                db.getAllAsync<CalendarEvent>(`SELECT * FROM events WHERE deleted = 0`),
                db.getAllAsync<Folder>(`SELECT * FROM folders WHERE deleted = 0`),
                db.getAllAsync<{ item_id: string; name: string; slug: string }>(
                    `SELECT it.item_id, t.name, t.slug FROM tags t INNER JOIN item_tags it ON t.id = it.tag_id WHERE it.item_type = 'reminder'`
                ).catch(() => []),
                db.getAllAsync<{ item_id: string; name: string; slug: string }>(
                    `SELECT it.item_id, t.name, t.slug FROM tags t INNER JOIN item_tags it ON t.id = it.tag_id WHERE it.item_type = 'event'`
                ).catch(() => []),
            ]);

            const reminderTagsMap = new Map<string, string>();
            for (const r of reminderTags) {
                const prev = reminderTagsMap.get(r.item_id) || '';
                reminderTagsMap.set(r.item_id, prev ? `${prev} ${r.name} ${r.slug}` : `${r.name} ${r.slug}`);
            }

            const eventTagsMap = new Map<string, string>();
            for (const e of eventTags) {
                const prev = eventTagsMap.get(e.item_id) || '';
                eventTagsMap.set(e.item_id, prev ? `${prev} ${e.name} ${e.slug}` : `${e.name} ${e.slug}`);
            }

            await withSerializedTransaction(db, async () => {
                for (const r of reminders) {
                    await this.indexReminderInternal(db, r, reminderTagsMap.get(r.id));
                    stats.reminders++;
                }
                for (const n of notes) {
                    await this.indexNoteInternal(db, n);
                    stats.notes++;
                }
                for (const e of events) {
                    await this.indexEventInternal(db, e, eventTagsMap.get(e.id));
                    stats.events++;
                }
                for (const f of folders) {
                    await this.indexFolderInternal(db, f);
                    stats.folders++;
                }
            });

            console.log('[SearchService] Índice reconstruido con éxito (transacción única):', stats);
            return stats;
        });
    },

    /**
     * Asegura que el índice contiene datos y está sincronizado con las tablas principales.
     * Si faltan notas, recordatorios, eventos o carpetas, ejecuta la reconciliación.
     */
    async ensureIndexWarm(forceRebuild = false): Promise<void> {
        if (warmIndexPromise && !forceRebuild) {
            return warmIndexPromise;
        }

        warmIndexPromise = (async () => {
            try {
                await withDB(async (db) => {
                    if (forceRebuild) {
                        await this.rebuildIndex();
                        return;
                    }

                    // Comprobar si faltan elementos en search_index
                    const checkSql = `
                        SELECT 
                            (SELECT COUNT(*) FROM notes WHERE deleted = 0) as totalNotes,
                            (SELECT COUNT(*) FROM search_index WHERE entity_type = 'note' AND deleted = 0) as indexedNotes,
                            (SELECT COUNT(*) FROM reminders WHERE deleted = 0) as totalReminders,
                            (SELECT COUNT(*) FROM search_index WHERE entity_type = 'reminder' AND deleted = 0) as indexedReminders,
                            (SELECT COUNT(*) FROM events WHERE deleted = 0) as totalEvents,
                            (SELECT COUNT(*) FROM search_index WHERE entity_type IN ('event', 'schedule') AND deleted = 0) as indexedEvents,
                            (SELECT COUNT(*) FROM folders WHERE deleted = 0) as totalFolders,
                            (SELECT COUNT(*) FROM search_index WHERE entity_type = 'folder' AND deleted = 0) as indexedFolders
                    `;

                    interface HealthRow {
                        totalNotes: number;
                        indexedNotes: number;
                        totalReminders: number;
                        indexedReminders: number;
                        totalEvents: number;
                        indexedEvents: number;
                        totalFolders: number;
                        indexedFolders: number;
                    }

                    const rows = await db.getAllAsync<HealthRow>(checkSql);
                    const h = rows?.[0];

                    const needsSync = !h ||
                        h.indexedNotes < h.totalNotes ||
                        h.indexedReminders < h.totalReminders ||
                        h.indexedEvents < h.totalEvents ||
                        h.indexedFolders < h.totalFolders;

                    if (needsSync) {
                        console.log('[SearchService] Índice desincronizado o incompleto. Reconstruyendo...', h);
                        await this.rebuildIndex();
                    }
                });
            } catch (err) {
                console.warn('[SearchService] Error en ensureIndexWarm:', err);
            } finally {
                warmIndexPromise = null;
            }
        })();

        return warmIndexPromise;
    },

    // ─────────────────────────────────────────────────────────────
    // MOTOR DE BÚSQUEDA Y RANKING
    // ─────────────────────────────────────────────────────────────

    async search(
        query: string,
        category: SearchFilterCategory = 'all',
        limit: number = 40
    ): Promise<SearchResultItem[]> {
        const rawQuery = query?.trim() || '';
        if (!rawQuery) return [];

        const normalizedQuery = normalizeSearchText(rawQuery);
        if (!normalizedQuery) return [];

        const terms = normalizedQuery.split(' ').filter(t => t.length > 0);
        if (terms.length === 0) return [];

        await this.ensureIndexWarm();

        return withDB(async (db) => {
            // Construir condiciones SQL
            const whereParts: string[] = ['deleted = 0'];
            const params: any[] = [];

            if (category !== 'all') {
                if (category === 'reminders') {
                    whereParts.push(`entity_type = 'reminder'`);
                } else if (category === 'notes') {
                    whereParts.push(`entity_type = 'note'`);
                } else if (category === 'events') {
                    whereParts.push(`entity_type IN ('event', 'schedule')`);
                } else if (category === 'folders') {
                    whereParts.push(`entity_type = 'folder'`);
                } else if (category === 'schedule') {
                    whereParts.push(`entity_type = 'schedule'`);
                } else if (category === 'attachments') {
                    whereParts.push(`entity_type = 'attachment'`);
                }
            }

            // Cada término debe aparecer en title, content o keywords (coincidencia flexible)
            const termLikes = terms.map(t => {
                params.push(`%${t}%`, `%${t}%`, `%${t}%`);
                return `(title LIKE ? OR content LIKE ? OR keywords LIKE ?)`;
            });

            whereParts.push(`(${termLikes.join(' AND ')})`);

            const sql = `
                SELECT entity_type, entity_id, title, content, keywords, parent_id, extra_meta, updated_at_ms
                FROM search_index
                WHERE ${whereParts.join(' AND ')}
                LIMIT 120
            `;

            interface DbSearchRow {
                entity_type: string;
                entity_id: string;
                title: string;
                content: string | null;
                keywords: string | null;
                parent_id: string | null;
                extra_meta: string | null;
                updated_at_ms: number;
            }

            const rows = await db.getAllAsync<DbSearchRow>(sql, params);

            // Consultar títulos de padres para elementos que tienen parent_id (ej: adjuntos o notas en carpetas)
            const parentIds = Array.from(new Set(rows.map(r => r.parent_id).filter(Boolean))) as string[];
            const parentTitleMap = new Map<string, string>();
            if (parentIds.length > 0) {
                const parentPlaceholders = parentIds.map(() => '?').join(',');
                const parents = await db.getAllAsync<{ entity_id: string; title: string }>(
                    `SELECT entity_id, title FROM search_index WHERE entity_id IN (${parentPlaceholders})`,
                    parentIds
                );
                parents.forEach(p => parentTitleMap.set(p.entity_id, p.title));
            }

            // Calcular puntuación y generar snippets contextuales
            const results: SearchResultItem[] = [];

            for (const row of rows) {
                const normTitle = normalizeSearchText(row.title);
                const normContent = normalizeSearchText(row.content || '');
                const normKeywords = normalizeSearchText(row.keywords || '');

                let score = 0;

                // Coincidencia exacta de frase en título
                if (normTitle === normalizedQuery) {
                    score += 150;
                } else if (normTitle.startsWith(normalizedQuery)) {
                    score += 90;
                } else if (normTitle.includes(normalizedQuery)) {
                    score += 60;
                }

                // Coincidencia de términos individuales en título
                for (const t of terms) {
                    if (normTitle.includes(t)) {
                        score += 25;
                    }
                }

                // Coincidencia en keywords / etiquetas
                if (normKeywords.includes(normalizedQuery)) {
                    score += 35;
                }
                for (const t of terms) {
                    if (normKeywords.includes(t)) {
                        score += 15;
                    }
                }

                // Coincidencia en contenido
                if (normContent.includes(normalizedQuery)) {
                    score += 30;
                }
                for (const t of terms) {
                    if (normContent.includes(t)) {
                        score += 10;
                    }
                }

                // Parsear extra_meta
                let meta: SearchResultMeta = {};
                let pagesList: any[] = [];
                if (row.extra_meta) {
                    try {
                        const parsed = JSON.parse(row.extra_meta);
                        meta = parsed;
                        if (Array.isArray(parsed.pages)) {
                            pagesList = parsed.pages;
                        }
                    } catch {}
                }

                // Si es nota multipágina, identificar con precisión la página que contiene la coincidencia
                if (row.entity_type === 'note' && pagesList.length > 0) {
                    let matchedPageIndex = 0;
                    let matchedPageTitle = pagesList[0]?.title || 'Página 1';

                    for (const p of pagesList) {
                        const pTitleNorm = normalizeSearchText(p.title || '');
                        const pTextNorm = normalizeSearchText(p.text || '');
                        if (terms.some(t => pTitleNorm.includes(t) || pTextNorm.includes(t))) {
                            matchedPageIndex = p.index;
                            matchedPageTitle = p.title || `Página ${p.index + 1}`;
                            break;
                        }
                    }
                    meta.pageIndex = matchedPageIndex;
                    meta.matchedPageTitle = matchedPageTitle;
                }

                // Boost por fijado
                if (meta.isPinned) {
                    score += 10;
                }

                // Generar snippet contextual
                const snippet = generateSnippet(row.content || row.title, terms, 130);

                results.push({
                    id: row.entity_id,
                    type: row.entity_type as SearchEntityType,
                    title: row.title,
                    snippet,
                    highlightTerms: terms,
                    keywords: (row.keywords || '').split(' ').filter(Boolean),
                    updatedAt: row.updated_at_ms,
                    parentId: row.parent_id || undefined,
                    parentTitle: row.parent_id ? parentTitleMap.get(row.parent_id) : undefined,
                    meta,
                    score,
                });
            }

            // Ordenar por score descendente y secundariamente por fecha más reciente
            results.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return b.updatedAt - a.updatedAt;
            });

            return results.slice(0, limit);
        });
    },

    // ─────────────────────────────────────────────────────────────
    // HISTORIAL DE BÚSQUEDAS RECIENTES
    // ─────────────────────────────────────────────────────────────

    async getRecentSearches(): Promise<string[]> {
        try {
            const raw = await AsyncStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
            if (!raw) return [];
            const list = JSON.parse(raw);
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    },

    async addRecentSearch(query: string): Promise<string[]> {
        const trimmed = query.trim();
        if (!trimmed || trimmed.length < 2) return this.getRecentSearches();

        try {
            const existing = await this.getRecentSearches();
            const filtered = existing.filter(item => item.toLowerCase() !== trimmed.toLowerCase());
            const updated = [trimmed, ...filtered].slice(0, MAX_RECENT_SEARCHES);
            await AsyncStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(updated));
            return updated;
        } catch {
            return [];
        }
    },

    async removeRecentSearch(query: string): Promise<string[]> {
        try {
            const existing = await this.getRecentSearches();
            const updated = existing.filter(item => item.toLowerCase() !== query.toLowerCase());
            await AsyncStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(updated));
            return updated;
        } catch {
            return [];
        }
    },

    async clearRecentSearches(): Promise<void> {
        try {
            await AsyncStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
        } catch {}
    },
};
