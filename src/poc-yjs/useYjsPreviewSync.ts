import { useEffect, useRef } from 'react';
import { withDB } from '../db';
import { useNotesStore } from '../store/useNotesStore';
import { diagLog } from './diagLog';
import { supabase } from '../lib/supabase';

interface UseYjsPreviewSyncOptions {
    noteId: string | undefined;
    enabled: boolean;
}

export function useYjsPreviewSync({ noteId, enabled }: UseYjsPreviewSyncOptions) {
    const debounceTimerRef = useRef<any>(null);
    const lastPreviewRef = useRef<string>('');
    const lastOriginRef = useRef<string>('local');

    const onPreviewUpdate = (preview: string, origin: string = 'local') => {
        if (!enabled || !noteId || noteId === 'create') return;
        lastPreviewRef.current = preview;
        lastOriginRef.current = origin;

        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(async () => {
            try {
                const rawPreview = lastPreviewRef.current;
                const originStr = lastOriginRef.current || 'local';
                if (!rawPreview) return;

                const newPreview = rawPreview
                    .replace(/<[^>]*>?/gm, '')
                    .replace(/&nbsp;/gi, ' ')
                    .replace(/&amp;/gi, '&')
                    .replace(/&quot;/gi, '"')
                    .replace(/&#39;/gi, "'")
                    .replace(/&lt;/gi, '<')
                    .replace(/&gt;/gi, '>')
                    .replace(/[ \t]+/g, ' ')
                    .trim();

                const currentNote = useNotesStore.getState().notes.find(n => n.id === noteId);
                const previewChanged = !currentNote || currentNote.preview_text !== newPreview;
                const isRemoteOrigin =
                    originStr.startsWith('remote') ||
                    originStr.startsWith('sqlite') ||
                    originStr === 'repair-replay';
                const isLocalEdit = !isRemoteOrigin;

                if (!previewChanged && !isLocalEdit) return;

                diagLog('preview_debounce_fire', { noteId, origin: originStr, previewChanged, isLocalEdit });

                const now = Date.now();

                // 1. Actualizar SQLite local y store en memoria
                if (previewChanged || isLocalEdit) {
                    await withDB(async (db) => {
                        if (isLocalEdit) {
                            await db.runAsync(
                                'UPDATE notes SET preview_text = ?, updated_at_ms = ?, last_modified_ms = ?, last_opened_ms = ? WHERE id = ?',
                                [newPreview, now, now, now, noteId]
                            );
                        } else {
                            await db.runAsync(
                                'UPDATE notes SET preview_text = ? WHERE id = ?',
                                [newPreview, noteId]
                            );
                        }
                    });
                    useNotesStore.setState(state => {
                        const updated = state.notes.map(n =>
                            n.id === noteId
                                ? {
                                      ...n,
                                      preview_text: newPreview,
                                      ...(isLocalEdit
                                          ? { updated_at_ms: now, last_modified_ms: now, last_opened_ms: now }
                                          : {}),
                                  }
                                : n
                        );
                        updated.sort((a, b) => (b.is_pinned - a.is_pinned) || (b.updated_at_ms - a.updated_at_ms));
                        return {
                            isNotesDirty: true,
                            notes: updated,
                        };
                    });
                }

                // 2. Actualizar Supabase solo si es edición local
                if (isLocalEdit) {
                    const updatePayload: any = {
                        updated_at_ms: now,
                        last_modified_ms: now,
                    };
                    if (previewChanged) updatePayload.preview_text = newPreview;

                    try {
                        const { data, error } = await supabase
                            .from('notes')
                            .update(updatePayload)
                            .eq('id', noteId)
                            .select('preview_text, updated_at_ms, last_modified_ms');

                        if (error) {
                            console.warn('[useYjsPreviewSync] update Supabase error:', error.message);
                        } else if (!data || data.length === 0) {
                            console.warn('[useYjsPreviewSync] update Supabase: 0 rows affected (RLS o id incorrecto)');
                        } else {
                            console.log('[useYjsPreviewSync] update Supabase OK:', data[0]);
                        }
                    } catch (e) {
                        console.warn('[useYjsPreviewSync] red:', e);
                    }
                }
            } catch (err) {
                console.warn('[useYjsPreviewSync] error en debounce de preview:', err);
            }
        }, 200);
    };

    // Cleanup al desmontar: NO cancelar el timer (debe disparar y escribir)
    useEffect(() => {
        return () => {
            // intencionadamente no se hace nada con debounceTimerRef
        };
    }, []);

    return { onPreviewUpdate };
}
