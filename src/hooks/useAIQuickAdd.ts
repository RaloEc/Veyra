import { useState, useCallback, useRef } from 'react';
import { aiService } from '../lib/ai/service';
import { AIActionProposal, ReminderIntent, EventIntent, NoteIntent } from '../lib/ai/schemas';
import { dispatchToolCall } from '../lib/ai/tools';
import { AIError } from '../lib/ai/types';
import { detectIsEditIntent } from '../lib/ai/utils/intentDetector';

export interface UseAIQuickAddReturn {
  isLoading: boolean;
  proposal: AIActionProposal | null;
  error: string | null;
  successMessage: string | null;
  processPrompt: (text: string) => Promise<void>;
  processEditPrompt: (text: string) => Promise<AIActionProposal | null>;
  processAudioPrompt: (base64Audio: string, mimeType?: string) => Promise<AIActionProposal | null>;
  processMediaPrompt: (
    media: string | Array<{ base64Data: string; mimeType?: string; name?: string; uri?: string }>,
    mimeType?: string,
    userHint?: string
  ) => Promise<AIActionProposal | null>;
  confirmProposal: () => Promise<boolean>;
  cancelProposal: () => void;
  clearMessages: () => void;
  updateProposalData: (updater: (prevData: any) => any) => void;
  toggleBatchItem: (itemId: string) => void;
  updateBatchItemData: (itemId: string, updater: (prevData: any) => any) => void;
}

/**
 * Hook para gestionar el ciclo de vida de AI Quick Add y Edición NL:
 * Prompt natural (Texto o Voz) -> Interpretación -> Previsualización -> Confirmación/Ejecución
 */
function formatSafeErrorMessage(rawMessage?: string, fallback = 'No se pudo procesar la solicitud con la IA.'): string {
  if (!rawMessage) return fallback;

  const lower = rawMessage.toLowerCase();
  const isTechnicalDump =
    rawMessage.includes('GoogleGenerativeAI') ||
    rawMessage.includes('http://') ||
    rawMessage.includes('https://') ||
    rawMessage.includes('Edge Function') ||
    rawMessage.includes('status code') ||
    rawMessage.includes('Modelos fallaron') ||
    rawMessage.includes('QuotaFailure') ||
    rawMessage.includes('generateContent') ||
    rawMessage.includes('{\\') ||
    rawMessage.includes('{"');

  if (isTechnicalDump) {
    if (lower.includes('quota') || lower.includes('429') || lower.includes('too many requests')) {
      const retryMatch = rawMessage.match(/retry in ([0-9]+(?:\.[0-9]+)?)s/i) || rawMessage.match(/retryDelay["']?:\s*["']?([0-9]+)s/i);
      const seconds = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : null;
      if (seconds && seconds > 0 && seconds <= 120) {
        return `Límite de consultas alcanzado. Por favor, espera ${seconds} segundos para volver a intentarlo.`;
      }
      return 'Has alcanzado el límite temporal de consultas de la IA. Por favor, espera unos instantes e inténtalo de nuevo.';
    }

    if (lower.includes('503') || lower.includes('high demand') || lower.includes('overloaded')) {
      return 'Los servidores de la IA tienen alta demanda en este momento. Intenta de nuevo en unos segundos.';
    }

    return fallback;
  }

  return rawMessage;
}

export function useAIQuickAdd(): UseAIQuickAddReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [proposal, setProposal] = useState<AIActionProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const currentRequestIdRef = useRef<number>(0);

  const processEditPrompt = useCallback(async (text: string): Promise<AIActionProposal | null> => {
    const reqId = ++currentRequestIdRef.current;
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await aiService.parseEdit(text);
      if (currentRequestIdRef.current !== reqId) return null;
      if (result.action === 'unknown') {
        setError(result.reason || 'No se pudo interpretar una modificación clara.');
        setProposal(null);
      } else if (result.action === 'clarify') {
        setError(result.question);
        setProposal(null);
      } else {
        setProposal(result);
      }
      return result;
    } catch (err: any) {
      if (currentRequestIdRef.current !== reqId) return null;
      const aiErr = err as AIError;
      setError(formatSafeErrorMessage(aiErr.userMessage || err.message, 'Error al procesar la edición con la IA. Intenta de nuevo.'));
      setProposal(null);
      return null;
    } finally {
      if (currentRequestIdRef.current === reqId) {
        setIsLoading(false);
      }
    }
  }, []);

  const processPrompt = useCallback(async (text: string) => {
    // Si la orden empieza con palabras clave de edición/modificación, derivar automáticamente a parseEdit
    if (detectIsEditIntent(text)) {
      await processEditPrompt(text);
      return;
    }

    const reqId = ++currentRequestIdRef.current;
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await aiService.parseQuickAdd(text);
      if (currentRequestIdRef.current !== reqId) return;
      if (result.action === 'unknown') {
        setError(result.reason || 'No pudimos interpretar una acción clara. Intenta reformularlo.');
        setProposal(null);
      } else if (result.action === 'clarify') {
        setError(result.question);
        setProposal(null);
      } else {
        setProposal(result);
      }
    } catch (err: any) {
      if (currentRequestIdRef.current !== reqId) return;
      const aiErr = err as AIError;
      setError(formatSafeErrorMessage(aiErr.userMessage || err.message, 'Error al conectar con el servicio de IA. Intenta de nuevo.'));
      setProposal(null);
    } finally {
      if (currentRequestIdRef.current === reqId) {
        setIsLoading(false);
      }
    }
  }, [processEditPrompt]);

  const processAudioPrompt = useCallback(async (base64Audio: string, mimeType = 'audio/m4a') => {
    const reqId = ++currentRequestIdRef.current;
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await aiService.parseQuickAddAudio(base64Audio, mimeType);
      if (currentRequestIdRef.current !== reqId) return null;
      if (result.action === 'unknown') {
        setError(result.reason || 'No pudimos interpretar el audio. Intenta hablar más claro o escribirlo.');
        setProposal(null);
      } else if (result.action === 'clarify') {
        setError(result.question);
        setProposal(null);
      } else {
        setProposal(result);
      }
      return result;
    } catch (err: any) {
      if (currentRequestIdRef.current !== reqId) return null;
      const aiErr = err as AIError;
      setError(formatSafeErrorMessage(aiErr.userMessage || err.message, 'Error al procesar el audio con la IA. Intenta de nuevo.'));
      setProposal(null);
      return null;
    } finally {
      if (currentRequestIdRef.current === reqId) {
        setIsLoading(false);
      }
    }
  }, []);

  const processMediaPrompt = useCallback(
    async (
      media: string | Array<{ base64Data: string; mimeType?: string; name?: string; uri?: string }>,
      mimeType = 'image/jpeg',
      userHint?: string
    ) => {
      const reqId = ++currentRequestIdRef.current;
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const result = await aiService.parseQuickAddMedia(media, mimeType, userHint);
        if (currentRequestIdRef.current !== reqId) return null;
        if (result.action === 'unknown') {
          setError(result.reason || 'No se pudo interpretar el archivo adjunto. Intenta con una imagen más nítida.');
          setProposal(null);
        } else if (result.action === 'clarify') {
          setError(result.question);
          setProposal(null);
        } else {
          setProposal(result);
        }
        return result;
      } catch (err: any) {
        if (currentRequestIdRef.current !== reqId) return null;
        const aiErr = err as AIError;
        setError(formatSafeErrorMessage(aiErr.userMessage || err.message, 'Error al procesar el archivo con la IA. Intenta de nuevo.'));
        setProposal(null);
        return null;
      } finally {
        if (currentRequestIdRef.current === reqId) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  const confirmProposal = useCallback(async (): Promise<boolean> => {
    if (!proposal) return false;

    setIsLoading(true);
    setError(null);

    try {
      // 1. Creación en lote
      if (proposal.action === 'create_batch') {
        const selectedItems = proposal.items.filter((item) => item.selected !== false);
        if (selectedItems.length === 0) {
          setError('Por favor selecciona al menos un elemento para guardar.');
          return false;
        }

        let createdCount = 0;
        for (const item of selectedItems) {
          try {
            const toolName = `create_${item.type}`;
            const toolRes = await dispatchToolCall(toolName, item.data as unknown as Record<string, unknown>);
            if (toolRes.success) {
              createdCount++;
            }
          } catch (itemErr) {
            console.warn('[useAIQuickAdd] Failed to create batch item:', item, itemErr);
          }
        }

        if (createdCount > 0) {
          setSuccessMessage(`Se crearon ${createdCount} ${createdCount === 1 ? 'elemento' : 'elementos'} con éxito.`);
          setProposal(null);
          return true;
        } else {
          setError('No se pudieron crear los elementos seleccionados.');
          return false;
        }
      }

      // 2. Modificación en lote (Batch Update)
      if (proposal.action === 'batch_update') {
        const selectedItems = proposal.items.filter((item) => item.selected !== false);
        if (selectedItems.length === 0) {
          setError('Por favor selecciona al menos un elemento para actualizar.');
          return false;
        }

        const ids = selectedItems.map((i) => i.id);
        const res = await dispatchToolCall('batch_update', {
          targetType: proposal.targetType,
          ids,
          changes: proposal.changes,
        });

        if (res.success) {
          setSuccessMessage(res.message || `${ids.length} elementos actualizados.`);
          setProposal(null);
          return true;
        } else {
          setError(res.message || 'No se pudieron actualizar los elementos.');
          return false;
        }
      }

      // 3. Mover notas
      if (proposal.action === 'move_note') {
        const res = await dispatchToolCall('move_note', {
          targetIds: proposal.targetIds,
          folderId: proposal.folderId,
        });

        if (res.success) {
          setSuccessMessage(res.message || `Notas movidas a ${proposal.folderName}.`);
          setProposal(null);
          return true;
        } else {
          setError(res.message || 'No se pudieron mover las notas.');
          return false;
        }
      }

      // 4. Eliminación filtrada
      if (proposal.action === 'delete_filtered') {
        const res = await dispatchToolCall('delete_filtered', {
          targetType: proposal.targetType,
          ids: proposal.targetIds,
        });

        if (res.success) {
          setSuccessMessage(res.message || `${proposal.targetIds.length} elementos eliminados.`);
          setProposal(null);
          return true;
        } else {
          setError(res.message || 'No se pudieron eliminar los elementos.');
          return false;
        }
      }

      // 5. Actualización unitaria
      if (proposal.action === 'update_reminder') {
        const res = await dispatchToolCall('update_reminder', {
          targetId: proposal.targetId,
          changes: proposal.changes,
        });
        if (res.success) {
          setSuccessMessage(res.message || 'Recordatorio actualizado.');
          setProposal(null);
          return true;
        } else {
          setError(res.message || 'No se pudo actualizar el recordatorio.');
          return false;
        }
      }

      if (proposal.action === 'update_event') {
        const res = await dispatchToolCall('update_event', {
          targetId: proposal.targetId,
          changes: proposal.changes,
        });
        if (res.success) {
          setSuccessMessage(res.message || 'Evento actualizado.');
          setProposal(null);
          return true;
        } else {
          setError(res.message || 'No se pudo actualizar el evento.');
          return false;
        }
      }

      // 6. Creaciones individuales
      let res;
      switch (proposal.action) {
        case 'create_reminder':
          res = await dispatchToolCall('create_reminder', proposal.data as unknown as Record<string, unknown>);
          break;
        case 'create_event':
          res = await dispatchToolCall('create_event', proposal.data as unknown as Record<string, unknown>);
          break;
        case 'create_note':
          res = await dispatchToolCall('create_note', proposal.data as unknown as Record<string, unknown>);
          break;
        default:
          throw new Error('Tipo de acción no ejecutable directamente');
      }

      if (res.success) {
        setSuccessMessage(res.message || 'Creado con éxito');
        setProposal(null);
        return true;
      } else {
        setError(res.message || 'No se pudo completar la acción.');
        return false;
      }
    } catch (err: any) {
      setError(err.message || 'Error al ejecutar la acción.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [proposal]);

  const cancelProposal = useCallback(() => {
    currentRequestIdRef.current = 0;
    setIsLoading(false);
    setProposal(null);
    setError(null);
  }, []);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccessMessage(null);
  }, []);

  const updateProposalData = useCallback((updater: (prevData: any) => any) => {
    setProposal((prev) => {
      if (!prev || !('data' in prev)) return prev;
      const nextData = updater((prev as any).data);
      return {
        ...prev,
        data: nextData,
      } as AIActionProposal;
    });
  }, []);

  const toggleBatchItem = useCallback((itemId: string) => {
    setProposal((prev) => {
      if (!prev) return prev;
      if (prev.action === 'create_batch' || prev.action === 'batch_update') {
        return {
          ...prev,
          items: prev.items.map((item) =>
            item.id === itemId ? { ...item, selected: !item.selected } : item
          ),
        } as AIActionProposal;
      }
      return prev;
    });
  }, []);

  const updateBatchItemData = useCallback((itemId: string, updater: (prevData: any) => any) => {
    setProposal((prev) => {
      if (!prev || prev.action !== 'create_batch') return prev;
      return {
        ...prev,
        items: prev.items.map((item) => {
          if (item.id === itemId) {
            return {
              ...item,
              data: updater(item.data),
            };
          }
          return item;
        }),
      };
    });
  }, []);

  return {
    isLoading,
    proposal,
    error,
    successMessage,
    processPrompt,
    processEditPrompt,
    processAudioPrompt,
    processMediaPrompt,
    confirmProposal,
    cancelProposal,
    clearMessages,
    updateProposalData,
    toggleBatchItem,
    updateBatchItemData,
  };
}

