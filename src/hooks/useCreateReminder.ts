import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { ControlLevel } from '../types/db';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform, Animated, Alert, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export const useCreateReminder = (id?: string) => {
    const router = useRouter();
    const { addReminder, updateReminder, deleteReminder, markAsCompleted, reminders, theme, isPremium } = useStore();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [attachments, setAttachments] = useState<{ uri: string, name: string }[]>([]);
    const [links, setLinks] = useState<string[]>([]);
    const [status, setStatus] = useState<string>('pending');
    const [date, setDate] = useState(new Date());
    const [controlLevel, setControlLevel] = useState<ControlLevel>('normal');
    const [showPicker, setShowPicker] = useState(false);

    // Cropper state
    const [cropperUri, setCropperUri] = useState<string | null>(null);
    const [isCropperVisible, setIsCropperVisible] = useState(false);

    // Picker state
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ title: '', description: '' });

    // Animation for picker
    const animationHeight = useRef(new Animated.Value(0)).current;

    const isEditing = !!id;
    const isDark = theme === 'dark';
    const MAX_ATTACHMENTS = isPremium ? 10 : 3;

    useEffect(() => {
        Animated.timing(animationHeight, {
            toValue: showPicker ? 1 : 0,
            duration: 300,
            useNativeDriver: false,
        }).start();
    }, [showPicker]);

    useEffect(() => {
        if (isEditing && id) {
            const reminder = reminders.find(r => r.id === id);
            if (reminder) {
                setTitle(reminder.title);
                setDescription(reminder.description || '');
                const rawAttachments = reminder.attachments ? JSON.parse(reminder.attachments) : [];
                const formattedAttachments = rawAttachments.map((att: any) =>
                    typeof att === 'string' ? { uri: att, name: att.split('/').pop() || 'Archivo' } : att
                );
                setAttachments(formattedAttachments);
                setLinks(reminder.links ? JSON.parse(reminder.links) : []);
                setDate(new Date(reminder.due_date_ms));
                setControlLevel(reminder.control_level);
                setStatus(reminder.status);
            }
        }
    }, [id, reminders, isEditing]);

    const pickImage = async (useCamera: boolean) => {
        if (attachments.length >= MAX_ATTACHMENTS) {
            Alert.alert('Límite alcanzado', `Máximo ${MAX_ATTACHMENTS} archivos por recordatorio.`);
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
        const imageCount = (description.match(/<img/g) || []).length;
        const maxImages = isPremium ? 20 : 2;

        if (imageCount >= maxImages) {
            setAlertConfig({
                title: 'Contenido Premium',
                description: isPremium
                    ? 'Límite máximo de 20 imágenes alcanzado.'
                    : 'Límite de 2 imágenes en el plan gratuito. Hazte Premium para subir hasta 20.'
            });
            setAlertVisible(true);
            return;
        }

        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return;

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            allowsEditing: false,
        });

        if (!result.canceled) {
            setCropperUri(result.assets[0].uri);
            setIsCropperVisible(true);
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
        if (attachments.length >= MAX_ATTACHMENTS) {
            setAlertConfig({
                title: 'Límite alcanzado',
                description: isPremium
                    ? 'Máximo de 10 archivos alcanzado.'
                    : 'Límite de 3 archivos en el plan gratuito. Hazte Premium para subir hasta 10.'
            });
            setAlertVisible(true);
            return;
        }

        const result = await DocumentPicker.getDocumentAsync({
            type: '*/*',
            copyToCacheDirectory: true
        });

        if (!result.canceled) {
            const asset = result.assets[0];
            setAttachments([...attachments, { uri: asset.uri, name: asset.name || `Documento_${Date.now()}` }]);
        }
    };

    const openAttachment = async (uri: string) => {
        try {
            if (Platform.OS === 'android') {
                const cUri = await FileSystem.getContentUriAsync(uri);
                await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                    data: cUri,
                    flags: 1,
                });
            } else {
                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(uri);
                }
            }
        } catch (error) {
            console.error('Error al abrir archivo:', error);
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri);
            }
        }
    };

    const removeAttachment = (index: number) => {
        setAttachments(attachments.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        if (!title.trim()) return;

        if (isEditing && id) {
            await updateReminder(id, {
                title,
                description,
                due_date_ms: date.getTime(),
                control_level: controlLevel,
                attachments: JSON.stringify(attachments),
                links: JSON.stringify(links)
            });
        } else {
            await addReminder(title, date.getTime(), controlLevel, description, undefined, JSON.stringify(attachments), JSON.stringify(links));
        }
        router.back();
    };

    const handleDelete = async () => {
        if (id) {
            await deleteReminder(id);
            router.back();
        }
    };

    const handleComplete = async () => {
        if (id) {
            await markAsCompleted(id);
            router.back();
        }
    };

    return {
        title,
        setTitle,
        description,
        setDescription,
        attachments,
        setAttachments,
        links,
        setLinks, // Although not used in UI yet, keeping it for future compatibility
        status,
        date,
        setDate,
        controlLevel,
        setControlLevel,
        showPicker,
        setShowPicker,
        animationHeight,
        isEditing,
        isDark,
        pickImage,
        pickImageForEditor,
        processCroppedImage,
        cropperUri,
        isCropperVisible,
        setIsCropperVisible,
        pickDocument,
        openAttachment,
        removeAttachment,
        handleSave,
        handleDelete,
        handleComplete,
        MAX_ATTACHMENTS,
        alertVisible,
        setAlertVisible,
        alertConfig
    };
};
