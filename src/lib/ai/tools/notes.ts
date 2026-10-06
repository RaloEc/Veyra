import { useNotesStore } from '../../../store/useNotesStore';
import { NoteIntentSchema } from '../schemas';
import { ToolDefinition } from '../providers/provider';

export const noteToolDefinitions: ToolDefinition[] = [
  {
    name: 'create_note',
    description: 'Crea una nota con título y contenido en Veyra.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título de la nota' },
        content: { type: 'string', description: 'Cuerpo de la nota en texto enriquecido o plano' },
        folderId: { type: 'string', description: 'ID de la carpeta contenedora (opcional)' },
      },
      required: ['content'],
    },
  },
];

export async function executeNoteTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; requiresConfirmation?: boolean; message?: string }> {
  const notesStore = useNotesStore.getState();

  switch (toolName) {
    case 'create_note': {
      const parsed = NoteIntentSchema.parse(args);

      await notesStore.addNote(
        parsed.title || 'Nota sin título',
        parsed.content,
        undefined,
        undefined,
        false,
        parsed.folderId
      );

      return {
        success: true,
        data: { title: parsed.title },
        message: 'Nota creada exitosamente.',
      };
    }

    case 'move_note': {
      const targetIds = (args.targetIds || (args.targetId ? [args.targetId] : [])) as string[];
      const folderId = (args.folderId as string) || null;
      if (targetIds.length > 0) {
        await notesStore.moveNotesBatch(targetIds, folderId);
      }
      return {
        success: true,
        data: { count: targetIds.length, folderId },
        message: `${targetIds.length} nota(s) movida(s) correctamente.`,
      };
    }

    case 'delete_filtered_notes': {
      const ids = (args.ids || args.targetIds || []) as string[];
      if (ids.length > 0) {
        await notesStore.deleteNotesBatch(ids);
      }
      return {
        success: true,
        data: { count: ids.length },
        message: `${ids.length} nota(s) eliminada(s).`,
      };
    }

    case 'update_note': {
      const targetId = String(args.targetId || args.id);
      const changes = (args.changes || {}) as Record<string, any>;
      await notesStore.updateNote(targetId, changes);
      return {
        success: true,
        data: { id: targetId, changes },
        message: 'Nota actualizada.',
      };
    }

    default:
      throw new Error(`Tool de nota no reconocida: ${toolName}`);
  }
}
