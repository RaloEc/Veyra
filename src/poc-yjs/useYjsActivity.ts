import { useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const SESSION_WINDOW_MS = 5 * 60 * 1000; // Ventanas de 5 minutos

export interface UseYjsActivityOptions {
    noteId?: string;
    userId?: string;
    enabled?: boolean;
}

/**
 * Hook para registrar y auditar la actividad de edición en notas Yjs
 * agrupando en sesiones de 5 minutos y aplicando un debounce de 15 segundos.
 */
export function useYjsActivity(
    noteIdOrOptions?: string | UseYjsActivityOptions,
    userIdParam?: string,
    enabledParam: boolean = true
) {
    let noteId: string | undefined;
    let userId: string | undefined;
    let enabled: boolean = true;

    if (typeof noteIdOrOptions === 'object' && noteIdOrOptions !== null) {
        noteId = noteIdOrOptions.noteId;
        userId = noteIdOrOptions.userId;
        enabled = noteIdOrOptions.enabled ?? true;
    } else {
        noteId = noteIdOrOptions;
        userId = userIdParam;
        enabled = enabledParam;
    }

    const timerRef = useRef<any>(null);
    const pendingCountRef = useRef<number>(0);
    const hasPendingEditRef = useRef<boolean>(false);
    const latestSnippetRef = useRef<string>('');
    const snippetsRef = useRef<string[]>([]);
    const currentBucketRef = useRef<number>(0);

    const noteIdRef = useRef(noteId);
    noteIdRef.current = noteId;
    const userIdRef = useRef(userId);
    userIdRef.current = userId;
    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;

    const flush = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        hasPendingEditRef.current = false;

        const count = pendingCountRef.current;
        const snippets = [...snippetsRef.current];
        const snippet = latestSnippetRef.current;
        const bucket = currentBucketRef.current || Math.floor(Date.now() / SESSION_WINDOW_MS) * SESSION_WINDOW_MS;
        const activeNoteId = noteIdRef.current;
        const activeUserId = userIdRef.current;
        const isActEnabled = enabledRef.current;

        console.log('[useYjsActivity] flush() invocado:', {
            count,
            isActEnabled,
            activeNoteId,
            activeUserId,
            snippetsCount: snippets.length,
            bucket,
        });

        if (count === 0 || !isActEnabled || !activeNoteId || !activeUserId || activeNoteId === 'create') {
            return;
        }

        // Resetear contador local para evitar envíos duplicados
        pendingCountRef.current = 0;

        const targetSnippets = snippets.length > 0 ? snippets : (snippet ? [snippet] : []);

        // Fire-and-forget: No bloquea el unmount ni se cancela en la limpieza de React
        void (async () => {
            try {
                console.log('[useYjsActivity] 🚀 Enviando RPC upsert_yjs_activity:', {
                    p_note_id: activeNoteId,
                    p_session_bucket_ms: bucket,
                    p_increment: count,
                    p_snippets: targetSnippets,
                });

                // 1. Intentar con la firma moderna basada en p_snippets
                let { data, error } = await supabase.rpc('upsert_yjs_activity', {
                    p_note_id: activeNoteId,
                    p_session_bucket_ms: bucket,
                    p_increment: count,
                    p_snippets: targetSnippets,
                });

                // 2. Si falla por incompatibilidad de firma, intentar fallback con p_last_snippet
                if (error && (error.code === 'PGRST202' || error.message?.includes('p_snippets') || error.message?.includes('function'))) {
                    console.warn('[useYjsActivity] ⚠️ Error con p_snippets, reintentando con fallback legacy (p_last_snippet):', error.message);
                    const legacyRes = await supabase.rpc('upsert_yjs_activity', {
                        p_note_id: activeNoteId,
                        p_session_bucket_ms: bucket,
                        p_increment: count,
                        p_last_snippet: snippet || (targetSnippets.length > 0 ? targetSnippets[targetSnippets.length - 1] : null),
                    });
                    error = legacyRes.error;
                }

                if (error) {
                    console.error('[useYjsActivity] ❌ Error en upsert_yjs_activity:', error);
                } else {
                    console.log('[useYjsActivity] ✅ Actividad guardada exitosamente en Supabase');
                }
            } catch (err) {
                console.error('[useYjsActivity] ❌ Excepción al registrar actividad:', err);
            }
        })();
    }, []);

    const recordEdit = useCallback((rawSnippet: string) => {
        const activeNoteId = noteIdRef.current;
        const activeUserId = userIdRef.current;
        const isActEnabled = enabledRef.current;

        if (!isActEnabled || !activeNoteId || !activeUserId || activeNoteId === 'create') {
            return;
        }

        // Limpieza y sanitización de etiquetas (HTML estándar y variantes Tiptap como <bold>, <italic>)
        const cleanSnippet = (rawSnippet || '')
            .replace(/<\/?(bold|italic|strong|em|p|div|span|br)[^>]*>?/gmi, '')
            .replace(/<[^>]*>?/g, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();

        if (!cleanSnippet) return;

        // Limitar longitud por fragmento a 300 caracteres para optimizar memoria
        const finalSnippet = cleanSnippet.length > 300 ? cleanSnippet.substring(0, 300) : cleanSnippet;

        const now = Date.now();
        const bucket = Math.floor(now / SESSION_WINDOW_MS) * SESSION_WINDOW_MS;

        // Si cambió el bucket de 5 min y teníamos cambios pendientes, vaciar la ventana anterior
        if (currentBucketRef.current && currentBucketRef.current !== bucket && pendingCountRef.current > 0) {
            flush();
            snippetsRef.current = [];
        }

        currentBucketRef.current = bucket;

        // Gestión de fragmentos HTML (máximo 3 por sesión, FIFO o reemplazo si es el mismo bloque)
        const list = [...snippetsRef.current];
        const lastItem = list[list.length - 1];

        const stripTags = (s: string) =>
            s
                .replace(/<\/?(bold|italic|strong|em|p|div|span|br)[^>]*>?/gmi, '')
                .replace(/<[^>]*>/g, '')
                .trim();
        const lastText = lastItem ? stripTags(lastItem) : '';
        const newText = stripTags(finalSnippet);

        const isSameBlock = Boolean(
            lastItem && (
                lastItem === finalSnippet ||
                (lastText && newText && (
                    newText.includes(lastText) ||
                    lastText.includes(newText) ||
                    Math.abs(newText.length - lastText.length) <= 15
                ))
            )
        );

        if (isSameBlock && list.length > 0) {
            list[list.length - 1] = finalSnippet;
        } else {
            if (list.length >= 3) {
                list.shift(); // FIFO: remover el más antiguo
            }
            list.push(finalSnippet);
        }

        snippetsRef.current = list;
        latestSnippetRef.current = finalSnippet;

        // Agrupación en ráfaga (burst grouping):
        // Solo incrementamos el contador de cambios al iniciar un bloque de edición continuo.
        if (!hasPendingEditRef.current) {
            hasPendingEditRef.current = true;
            pendingCountRef.current += 1;
        }

        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }
        // Debounce de 3 segundos
        timerRef.current = setTimeout(() => {
            hasPendingEditRef.current = false;
            flush();
        }, 3000);
    }, [flush]);

    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            hasPendingEditRef.current = false;
            if (pendingCountRef.current > 0) {
                console.log('[useYjsActivity] 🧹 Cleanup al desmontar: vaciando actividad pendiente (' + pendingCountRef.current + ' cambios)...');
                flush();
            }
        };
    }, [flush]);

    return {
        recordEdit,
        flush,
    };
}
