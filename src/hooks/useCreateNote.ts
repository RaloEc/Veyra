import { useState, useEffect } from 'react';
import { useNotesStore } from '../store/useNotesStore';
import { useRouter } from 'expo-router';
import { Alert, StatusBar, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useStore } from '../store/useStore';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export function useCreateNote(id?: string) {
    const router = useRouter();
    const { theme, isPremium } = useStore();
    const isDark = theme === 'dark';
    const { notes, addNote, updateNote, deleteNote } = useNotesStore();

    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [attachments, setAttachments] = useState<{ uri: string; name: string }[]>([]);
    const [isPinned, setIsPinned] = useState(false);

    // UI states
    const [isLoading, setIsLoading] = useState(false);
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ title: '', description: '' });

    const isEditing = !!id;

    // Cropper state
    const [cropperUri, setCropperUri] = useState<string | null>(null);
    const [isCropperVisible, setIsCropperVisible] = useState(false);

    useEffect(() => {
        if (id) {
            const note = notes.find(n => n.id === id);
            if (note) {
                setTitle(note.title || '');
                setContent(note.content || '');
                setIsPinned(note.is_pinned === 1);
                if (note.attachments) {
                    try {
                        setAttachments(JSON.parse(note.attachments));
                    } catch (e) {
                        setAttachments([]);
                    }
                }
            }
        }
    }, [id, notes]);

    const handleSave = async () => {
        if (!title.trim() && !content.trim()) {
            // Permitimos guardar si tiene al menos uno de los dos
            return;
        }

        setIsLoading(true);
        try {
            const attachmentsJson = attachments.length > 0 ? JSON.stringify(attachments) : undefined;

            if (isEditing && id) {
                await updateNote(id, {
                    title,
                    content,
                    attachments: attachmentsJson,
                    is_pinned: isPinned ? 1 : 0
                });
            } else {
                await addNote(title, content, attachmentsJson, undefined, isPinned);
            }
            router.back();
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudo guardar la nota.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!id) return;
        Alert.alert(
            'Eliminar Nota',
            '¿Estás seguro? Esta acción enviará la nota a la papelera (puedes restaurarla después ni no la borras definitivamente).',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        await deleteNote(id);
                        router.back();
                    }
                }
            ]
        );
    };

    const pickImage = async (useCamera: boolean) => {
        const maxAttachments = isPremium ? 10 : 3;
        if (attachments.length >= maxAttachments) {
            setAlertConfig({
                title: 'Límite alcanzado',
                description: isPremium
                    ? 'Has alcanzado el límite máximo de 10 archivos por nota.'
                    : 'Límite de 3 archivos en el plan gratuito. Pásate a Premium para subir hasta 10.'
            });
            setAlertVisible(true);
            return;
        }

        try {
            let result;
            if (useCamera) {
                const { status } = await ImagePicker.requestCameraPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Permiso denegado', 'Se requiere permiso para acceder a la cámara.');
                    return;
                }
                result = await ImagePicker.launchCameraAsync({
                    mediaTypes: ['images'],
                    quality: 0.8,
                });
            } else {
                const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Permiso denegado', 'Se requiere permiso para acceder a la galería.');
                    return;
                }
                result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['images'],
                    allowsEditing: false,
                    quality: 0.8,
                });
            }

            if (!result.canceled) {
                const uri = result.assets[0].uri;
                // Guardar copia local permanente
                const filename = uri.split('/').pop();
                const newPath = (FileSystem.documentDirectory as string) + (filename || `img_${Date.now()}.jpg`);

                await FileSystem.copyAsync({
                    from: uri,
                    to: newPath
                });

                setAttachments([...attachments, { uri: newPath, name: filename || 'image.jpg' }]);
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudo adjuntar la imagen');
        }
    };

    const pickImageForEditor = async () => {
        const imageCount = (content.match(/<img/g) || []).length;
        const maxImages = isPremium ? 20 : 2;

        if (imageCount >= maxImages) {
            setAlertConfig({
                title: 'Imágenes en texto',
                description: isPremium
                    ? 'Máximo de 20 imágenes por nota para garantizar el rendimiento.'
                    : 'Límite de 2 imágenes dentro del texto en el plan gratuito. Pásate a Premium para subir hasta 20.'
            });
            setAlertVisible(true);
            return;
        }

        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                quality: 0.8,
                allowsEditing: false,
            });

            if (!result.canceled) {
                setCropperUri(result.assets[0].uri);
                setIsCropperVisible(true);
            }
        } catch (error) {
            console.error('Error al abrir galería:', error);
        }
    };

    const processCroppedImage = async (uri: string) => {
        try {
            const manipResult = await manipulateAsync(
                uri,
                [{ resize: { width: 1000 } }],
                { compress: 0.6, format: SaveFormat.JPEG, base64: true }
            );
            return `data:image/jpeg;base64,${manipResult.base64}`;
        } catch (error) {
            console.error('Error al procesar imagen recortada:', error);
            return null;
        }
    };

    const pickDocument = async () => {
        const maxAttachments = isPremium ? 10 : 3;
        if (attachments.length >= maxAttachments) {
            setAlertConfig({
                title: 'Límite de archivos',
                description: isPremium
                    ? 'Máximo de 10 archivos alcanzado.'
                    : 'Límite de 3 archivos en el plan gratuito. Hazte Premium para más.'
            });
            setAlertVisible(true);
            return;
        }

        try {
            const result = await DocumentPicker.getDocumentAsync({
                copyToCacheDirectory: true,
                type: '*/*'
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const uri = result.assets[0].uri;
                const name = result.assets[0].name;
                // Guardar copia
                const newPath = (FileSystem.documentDirectory as string) + name;
                await FileSystem.copyAsync({
                    from: uri,
                    to: newPath
                });
                setAttachments([...attachments, { uri: newPath, name }]);
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudo adjuntar el archivo');
        }
    };

    const removeAttachment = (index: number) => {
        const newAtts = [...attachments];
        newAtts.splice(index, 1);
        setAttachments(newAtts);
    };

    const openAttachment = (uri: string) => {
        // Implementar visualizador si es necesario, o usar IntentLauncher en Android
        // Por ahora no haremos nada complejo aquí
        Alert.alert('Info', 'Visualización de adjuntos pendiente de implementación total.');
    };

    return {
        title, setTitle,
        content, setContent,
        attachments,
        isPinned, setIsPinned,
        isDark,
        handleSave,
        handleDelete,
        pickImage,
        pickImageForEditor,
        processCroppedImage,
        cropperUri,
        isCropperVisible,
        setIsCropperVisible,
        pickDocument,
        removeAttachment,
        openAttachment,
        isEditing,
        isLoading,
        alertVisible,
        setAlertVisible,
        alertConfig,
        maxAttachments: isPremium ? 10 : 3
    };
}
