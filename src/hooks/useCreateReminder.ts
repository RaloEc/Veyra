import { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { ControlLevel, Subtask } from '../types/db';
import { RecurrenceType } from '../components/create/RecurrenceSelector';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform, Animated, Alert, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useTranslation } from 'react-i18next';

/**
 * Parsea de forma segura una fecha inicial recibida en milisegundos o formato ISO string.
 * Evita el bug donde parseInt("2026-09-26...", 10) retornaba 2026 (convirtiéndose en dic 1969 en época Unix).
 */
export const parseInitialDate = (raw?: string | number | null): Date => {
    if (raw === undefined || raw === null || raw === '') {
        return new Date();
    }
    if (typeof raw === 'number') {
        const d = new Date(raw);
        return !isNaN(d.getTime()) && d.getFullYear() >= 2000 ? d : new Date();
    }
    const trimmed = String(raw).trim();
    if (!trimmed) {
        return new Date();
    }
    // Si viene compuesto únicamente por dígitos (timestamp numérico en ms)
    if (/^\d+$/.test(trimmed)) {
        const ms = parseInt(trimmed, 10);
        // Validar que sea un timestamp realista en milisegundos (posterior al año 2000)
        if (ms > 946684800000) {
            const d = new Date(ms);
            if (!isNaN(d.getTime())) return d;
        }
    }
    // Si viene como string ISO (ej: "2026-09-26T18:54:00.000Z") o estándar de fecha
    const d = new Date(trimmed);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) {
        return d;
    }
    return new Date();
};

export const useCreateReminder = (id?: string, initialDateMs?: number | string) => {
    const { t } = useTranslation();
    const router = useRouter();
    const { addReminder, updateReminder, deleteReminder, markAsCompleted, reminders, theme, isPremium, defaultControlLevel } = useStore();

    const isEditing = !!id;
    const isDark = theme === 'dark';
    const MAX_ATTACHMENTS = isPremium ? 10 : 3;

    // Obtener recordatorio de la caché en memoria inmediatamente (0ms)
    const cachedReminder = useMemo(() => {
        if (!id) return null;
        return useStore.getState().reminders.find(r => r.id === id) || null;
    }, [id]);

    const [title, setTitle] = useState(() => cachedReminder?.title || '');
    const [description, setDescription] = useState(() => cachedReminder?.description || '');
    const [attachments, setAttachments] = useState<{ uri: string, name: string }[]>(() => {
        if (!cachedReminder?.attachments) return [];
        try {
            const raw = JSON.parse(cachedReminder.attachments);
            return Array.isArray(raw)
                ? raw.map((att: any) => (typeof att === 'string' ? { uri: att, name: att.split('/').pop() || 'Archivo' } : att))
                : [];
        } catch {
            return [];
        }
    });
    const [links, setLinks] = useState<string[]>(() => {
        if (!cachedReminder?.links) return [];
        try {
            const parsed = JSON.parse(cachedReminder.links);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });
    const [subtasks, setSubtasks] = useState<Subtask[]>(() => {
        if (!cachedReminder?.subtasks) return [];
        try {
            const parsed = JSON.parse(cachedReminder.subtasks);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });
    const [status, setStatus] = useState<string>(() => cachedReminder?.status || 'pending');

    const [date, setDate] = useState(() => {
        if (cachedReminder) return new Date(cachedReminder.due_date_ms);

        const now = new Date();
        let targetDate = initialDateMs ? parseInitialDate(initialDateMs) : new Date(now);

        // Si la fecha inicial viene a medianoche (00:00:00), asignarle una hora razonable
        if (targetDate.getHours() === 0 && targetDate.getMinutes() === 0) {
            targetDate.setHours(now.getHours() + 1, 0, 0, 0);
        } else if (
            targetDate.getFullYear() === now.getFullYear() &&
            targetDate.getMonth() === now.getMonth() &&
            targetDate.getDate() === now.getDate() &&
            targetDate.getTime() <= now.getTime()
        ) {
            // Si la fecha es "Hoy" pero la hora ya pasó o es exactamente ahora,
            // programarlo a 1 hora hacia adelante para que no esté vencido de inmediato
            targetDate = new Date(now.getTime() + 60 * 60 * 1000);
        }

        return targetDate;
    });
    const [controlLevel, setControlLevel] = useState<ControlLevel>(() => cachedReminder?.control_level || defaultControlLevel);
    const [showPicker, setShowPicker] = useState(false);
    const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(() => {
        if (!cachedReminder?.repeat_rule) return 'none';
        try {
            const parsed = JSON.parse(cachedReminder.repeat_rule);
            return parsed.type || 'none';
        } catch {
            return 'none';
        }
    });

    // Cropper state
    const [cropperUri, setCropperUri] = useState<string | null>(null);
    const [isCropperVisible, setIsCropperVisible] = useState(false);

    // Picker state
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ title: '', description: '' });

    // Animation for picker
    const animationHeight = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(animationHeight, {
            toValue: showPicker ? 1 : 0,
            duration: 250,
            useNativeDriver: false,
        }).start();
    }, [showPicker]);

    // Sincronizar si el recordatorio cambia en background
    useEffect(() => {
        if (isEditing && id) {
            const reminder = reminders.find(r => r.id === id);
            if (reminder && reminder !== cachedReminder) {
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
                if (reminder.repeat_rule) {
                    try {
                        const parsed = JSON.parse(reminder.repeat_rule);
                        setRecurrenceType(parsed.type || 'none');
                    } catch {
                        setRecurrenceType('none');
                    }
                } else {
                    setRecurrenceType('none');
                }
            }
        }
    }, [id, reminders, isEditing]);

    const pickImage = async (useCamera: boolean) => {
        if (attachments.length >= MAX_ATTACHMENTS) {
            Alert.alert(t('create.alerts.limit_reached'), t('create.alerts.limit_msg', { count: MAX_ATTACHMENTS }));
            return;
        }

        try {
            let result;
            if (useCamera) {
                const { status } = await ImagePicker.requestCameraPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert(t('create.alerts.permission_denied'), t('create.alerts.camera_permission'));
                    return;
                }
                result = await ImagePicker.launchCameraAsync({
                    mediaTypes: ['images'],
                    quality: 0.8,
                });
            } else {
                const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert(t('create.alerts.permission_denied'), t('create.alerts.gallery_permission'));
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
            Alert.alert(t('common.error'), t('create.alerts.error_attaching'));
        }
    };

    const pickImageForEditor = async () => {
        const imageCount = (description.match(/<img/g) || []).length;
        const maxImages = isPremium ? 20 : 2;

        if (imageCount >= maxImages) {
            setAlertConfig({
                title: t('create.alerts.premium_content'),
                description: isPremium
                    ? t('create.alerts.limit_images_editor', { count: 20 })
                    : t('create.alerts.upgrade_msg', { count: 2 })
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
                title: t('create.alerts.limit_reached'),
                description: isPremium
                    ? t('create.alerts.limit_msg', { count: 10 })
                    : t('create.alerts.upgrade_files_msg')
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

        const repeatRule = recurrenceType !== 'none'
            ? JSON.stringify({ type: recurrenceType })
            : undefined;

        if (isEditing && id) {
            await updateReminder(id, {
                title,
                description,
                due_date_ms: date.getTime(),
                control_level: controlLevel,
                repeat_rule: repeatRule || undefined,
                attachments: JSON.stringify(attachments),
                links: JSON.stringify(links),
                subtasks: JSON.stringify(subtasks),
            });
        } else {
            await addReminder(title, date.getTime(), controlLevel, description, repeatRule, JSON.stringify(attachments), JSON.stringify(links), JSON.stringify(subtasks));
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
        setLinks,
        subtasks,
        setSubtasks,
        status,
        date,
        setDate,
        controlLevel,
        setControlLevel,
        recurrenceType,
        setRecurrenceType,
        showPicker,
        setShowPicker,
        animationHeight,
        isEditing,
        isDark,
        pickImage,
        pickImageForEditor,
        processCroppedImage,
        cropperUri,
        setCropperUri,
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
