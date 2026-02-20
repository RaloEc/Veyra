import { create } from 'zustand';
import { NoteService } from '../services/noteService';
import { Note } from '../types/db';

interface NotesState {
    notes: Note[];
    isLoading: boolean;
    selectedNote: Note | null;
    loadNotes: () => Promise<void>;
    addNote: (title?: string, content?: string, attachments?: string, links?: string, isPinned?: boolean) => Promise<void>;
    updateNote: (id: string, updates: Partial<Note>) => Promise<void>;
    deleteNote: (id: string) => Promise<void>;
    restoreNote: (id: string) => Promise<void>;
    deleteForever: (id: string) => Promise<void>;
    selectNote: (note: Note | null) => void;
}

export const useNotesStore = create<NotesState>((set, get) => ({
    notes: [],
    isLoading: false,
    selectedNote: null,

    loadNotes: async () => {
        set({ isLoading: true });
        try {
            const notes = await NoteService.getNotes();
            set({ notes });
        } catch (error) {
            console.error('Failed to load notes', error);
        } finally {
            set({ isLoading: false });
        }
    },

    addNote: async (title, content, attachments, links, isPinned) => {
        try {
            await NoteService.createNote(title, content, attachments, links, isPinned);
            await get().loadNotes();
        } catch (error) {
            console.error('Failed to create note', error);
        }
    },

    updateNote: async (id, updates) => {
        try {
            await NoteService.updateNote(id, updates);
            await get().loadNotes();
        } catch (error) {
            console.error('Failed to update note', error);
        }
    },

    deleteNote: async (id) => {
        try {
            await NoteService.deleteNote(id);
            await get().loadNotes();
        } catch (error) {
            console.error('Failed to delete note', error);
        }
    },

    restoreNote: async (id) => {
        try {
            await NoteService.restoreNote(id);
            await get().loadNotes();
        } catch (error) {
            console.error('Failed to restore note', error);
        }
    },

    deleteForever: async (id) => {
        try {
            await NoteService.deleteNoteForever(id);
            await get().loadNotes();
        } catch (error) {
            console.error('Failed to delete note forever', error);
        }
    },

    selectNote: (note) => set({ selectedNote: note }),
}));
