import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNotesStore } from '../../src/store/useNotesStore';
import { useStore } from '../../src/store/useStore';
import { useVeyraTheme } from '../../src/theme/useVeyraTheme';

export default function CreateNoteScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{
        folderId?: string;
        eventId?: string;
        initialTitle?: string;
    }>();
    const { colors, accent } = useVeyraTheme();
    const isCreatingRef = useRef(false);

    useEffect(() => {
        if (isCreatingRef.current) return;
        isCreatingRef.current = true;

        let isMounted = true;
        const createAndNavigate = async () => {
            try {
                const newNote = await useNotesStore.getState().addNote(
                    params.initialTitle || '',
                    '',
                    '[]',
                    undefined,
                    false,
                    params.folderId || null,
                    params.eventId || null,
                    'sans',
                    'yjs'
                );

                if (isMounted && newNote?.id) {
                    useStore.getState().setMainActiveTab('notes');
                    router.replace({
                        pathname: '/notes/[id]',
                        params: { id: newNote.id, isNew: '1' },
                    });
                }
            } catch (err) {
                console.error('[CreateNoteScreen] Error creando nueva nota:', err);
                router.back();
            }
        };

        createAndNavigate();

        return () => {
            isMounted = false;
        };
    }, [params.folderId, params.eventId, params.initialTitle, router]);

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="small" color={accent.primary} />
        </View>
    );
}
