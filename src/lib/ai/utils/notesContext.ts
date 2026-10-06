import { NoteService } from '../../../services/noteService';
import { FolderService } from '../../../services/folderService';

/**
 * Genera un resumen compacto de las notas y carpetas del usuario para inyectar en el contexto de IA
 * cuando se solicitan modificaciones o movimientos de notas mediante lenguaje natural.
 */
export async function getNotesContextSummary(maxNotes = 35): Promise<string> {
  try {
    const [notes, folders] = await Promise.all([
      NoteService.getNotes(false),
      FolderService.getFolders(false),
    ]);

    const folderMap = new Map<string, string>();
    const folderLines: string[] = [];

    for (const f of folders) {
      folderMap.set(f.id, f.name);
      folderLines.push(`- [id: ${f.id}] "${f.name}"`);
    }

    const noteLines: string[] = [];
    const itemsToProcess = (notes || []).slice(0, maxNotes);

    for (const n of itemsToProcess) {
      const folderName = n.folder_id && folderMap.has(n.folder_id)
        ? folderMap.get(n.folder_id)
        : 'Sin carpeta';
      
      const title = n.title?.trim() || '(Sin título)';
      const preview = (n.content || '').replace(/\s+/g, ' ').trim().slice(0, 70);
      noteLines.push(
        `- [id: ${n.id}] "${title}" · Carpeta: "${folderName}" · Contenido: "${preview}${preview.length >= 70 ? '...' : ''}"`
      );
    }

    const sections: string[] = [];

    if (folderLines.length > 0) {
      sections.push('CARPETAS EXISTENTES:');
      sections.push(...folderLines);
      sections.push('');
    }

    if (noteLines.length > 0) {
      sections.push('NOTAS DEL USUARIO:');
      sections.push(...noteLines);
    } else {
      sections.push('NOTAS DEL USUARIO: Ninguna.');
    }

    return sections.join('\n');
  } catch (error) {
    console.warn('[NotesContext] Error fetching notes/folders for AI context:', error);
    return '';
  }
}
