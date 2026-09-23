import { useRef, useState, useCallback, useEffect } from 'react';
import { NotePage } from '../utils/pageUtils';

export interface NoteHistorySnapshot {
    title: string;
    pages: NotePage[];
    currentPageIndex: number;
}

const MAX_HISTORY_STEPS = 50;
const DEBOUNCE_MS = 650;

function cloneSnapshot(snapshot: NoteHistorySnapshot): NoteHistorySnapshot {
    return {
        title: snapshot.title,
        currentPageIndex: snapshot.currentPageIndex,
        pages: snapshot.pages.map(p => ({ ...p })),
    };
}

function areSnapshotsEqual(a: NoteHistorySnapshot, b: NoteHistorySnapshot): boolean {
    if (a.title !== b.title) return false;
    if (a.pages.length !== b.pages.length) return false;
    for (let i = 0; i < a.pages.length; i++) {
        const pageA = a.pages[i];
        const pageB = b.pages[i];
        if (pageA.id !== pageB.id || pageA.content !== pageB.content || pageA.title !== pageB.title) {
            return false;
        }
    }
    return true;
}

interface UseNoteHistoryOptions {
    onApplySnapshot: (snapshot: NoteHistorySnapshot) => void;
}

export function useNoteHistory({ onApplySnapshot }: UseNoteHistoryOptions) {
    const undoStackRef = useRef<NoteHistorySnapshot[]>([]);
    const redoStackRef = useRef<NoteHistorySnapshot[]>([]);
    const currentSnapshotRef = useRef<NoteHistorySnapshot | null>(null);
    const pendingBaselineRef = useRef<NoteHistorySnapshot | null>(null);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isRestoringRef = useRef<boolean>(false);

    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    const updateFlags = useCallback(() => {
        setCanUndo(undoStackRef.current.length > 0 || pendingBaselineRef.current !== null);
        setCanRedo(redoStackRef.current.length > 0);
    }, []);

    const flushPendingDebounce = useCallback(() => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
        if (pendingBaselineRef.current && currentSnapshotRef.current) {
            if (!areSnapshotsEqual(pendingBaselineRef.current, currentSnapshotRef.current)) {
                undoStackRef.current.push(cloneSnapshot(pendingBaselineRef.current));
                if (undoStackRef.current.length > MAX_HISTORY_STEPS) {
                    undoStackRef.current.shift();
                }
                redoStackRef.current = [];
            }
            pendingBaselineRef.current = null;
            updateFlags();
        }
    }, [updateFlags]);

    const initHistory = useCallback((initialSnapshot: NoteHistorySnapshot) => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
        undoStackRef.current = [];
        redoStackRef.current = [];
        pendingBaselineRef.current = null;
        currentSnapshotRef.current = cloneSnapshot(initialSnapshot);
        setCanUndo(false);
        setCanRedo(false);
    }, []);

    const recordChange = useCallback((newSnapshot: NoteHistorySnapshot, immediate: boolean = false) => {
        if (isRestoringRef.current) return;

        if (!currentSnapshotRef.current) {
            currentSnapshotRef.current = cloneSnapshot(newSnapshot);
            return;
        }

        if (areSnapshotsEqual(currentSnapshotRef.current, newSnapshot)) {
            return;
        }

        if (immediate) {
            // Commit any pending debounce first
            flushPendingDebounce();

            // Push current state onto undo stack
            undoStackRef.current.push(cloneSnapshot(currentSnapshotRef.current));
            if (undoStackRef.current.length > MAX_HISTORY_STEPS) {
                undoStackRef.current.shift();
            }
            redoStackRef.current = [];
            currentSnapshotRef.current = cloneSnapshot(newSnapshot);
            updateFlags();
            return;
        }

        // Debounced typing: save baseline if starting new typing session
        if (!pendingBaselineRef.current) {
            pendingBaselineRef.current = cloneSnapshot(currentSnapshotRef.current);
            setCanUndo(true);
        }

        currentSnapshotRef.current = cloneSnapshot(newSnapshot);

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
            if (pendingBaselineRef.current && currentSnapshotRef.current) {
                if (!areSnapshotsEqual(pendingBaselineRef.current, currentSnapshotRef.current)) {
                    undoStackRef.current.push(cloneSnapshot(pendingBaselineRef.current));
                    if (undoStackRef.current.length > MAX_HISTORY_STEPS) {
                        undoStackRef.current.shift();
                    }
                    redoStackRef.current = [];
                }
                pendingBaselineRef.current = null;
                updateFlags();
            }
            debounceTimerRef.current = null;
        }, DEBOUNCE_MS);
    }, [flushPendingDebounce, updateFlags]);

    const undo = useCallback(() => {
        flushPendingDebounce();

        if (undoStackRef.current.length === 0) return;

        const previousSnapshot = undoStackRef.current.pop()!;
        if (currentSnapshotRef.current) {
            redoStackRef.current.push(cloneSnapshot(currentSnapshotRef.current));
            if (redoStackRef.current.length > MAX_HISTORY_STEPS) {
                redoStackRef.current.shift();
            }
        }

        currentSnapshotRef.current = cloneSnapshot(previousSnapshot);
        updateFlags();

        isRestoringRef.current = true;
        try {
            onApplySnapshot(previousSnapshot);
        } finally {
            setTimeout(() => {
                isRestoringRef.current = false;
            }, 120);
        }
    }, [flushPendingDebounce, onApplySnapshot, updateFlags]);

    const redo = useCallback(() => {
        flushPendingDebounce();

        if (redoStackRef.current.length === 0) return;

        const nextSnapshot = redoStackRef.current.pop()!;
        if (currentSnapshotRef.current) {
            undoStackRef.current.push(cloneSnapshot(currentSnapshotRef.current));
            if (undoStackRef.current.length > MAX_HISTORY_STEPS) {
                undoStackRef.current.shift();
            }
        }

        currentSnapshotRef.current = cloneSnapshot(nextSnapshot);
        updateFlags();

        isRestoringRef.current = true;
        try {
            onApplySnapshot(nextSnapshot);
        } finally {
            setTimeout(() => {
                isRestoringRef.current = false;
            }, 120);
        }
    }, [flushPendingDebounce, onApplySnapshot, updateFlags]);

    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, []);

    return {
        undo,
        redo,
        canUndo,
        canRedo,
        recordChange,
        initHistory,
        flushPendingDebounce,
        isRestoringRef,
    };
}
