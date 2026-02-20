import { useState, useEffect, useRef } from 'react';
import { YStack, XStack, Input, Button, Label, Text, Card, ScrollView, Separator } from 'tamagui';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useStore } from '../src/store/useStore';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform, TouchableOpacity, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ControlLevel } from '../src/types/db';
import { Bell, AlertCircle, ShieldAlert, Clock, Trash2, Check, Image as ImageIcon, FileText, Camera, List, AlignCenter, Bold, Trash, ChevronLeft, Calendar, Zap, Plus } from '@tamagui/lucide-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { RichEditor, RichToolbar, actions } from 'react-native-pell-rich-editor';

export default function CreateScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { addReminder, updateReminder, deleteReminder, markAsCompleted, reminders, theme } = useStore();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [attachments, setAttachments] = useState<{ uri: string, name: string }[]>([]);
    const [links, setLinks] = useState<string[]>([]);
    const [status, setStatus] = useState<string>('pending');
    const [date, setDate] = useState(new Date());
    const [controlLevel, setControlLevel] = useState<ControlLevel>('normal');
    const [showPicker, setShowPicker] = useState(false);
    const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
    const richTextRef = useRef<any>(null);
    const titleInputRef = useRef<any>(null);

    const isEditing = !!id;
    const isDark = theme === 'dark';

    useEffect(() => {
        if (!isEditing) {
            setTimeout(() => {
                titleInputRef.current?.focus();
            }, 100);
        }
    }, []);

    useEffect(() => {
        if (isEditing) {
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
    }, [id, reminders]);

    const MAX_ATTACHMENTS = 5;

    const pickImage = async (useCamera: boolean) => {
        if (attachments.length >= MAX_ATTACHMENTS) {
            alert(`Límite alcanzado: Máximo ${MAX_ATTACHMENTS} archivos por recordatorio.`);
            return;
        }

        let result;
        if (useCamera) {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') return;
            result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                quality: 0.8,
            });
        } else {
            result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                quality: 0.8,
            });
        }

        if (!result.canceled) {
            const asset = result.assets[0];
            setAttachments([...attachments, { uri: asset.uri, name: asset.fileName || `Imagen_${Date.now()}.jpg` }]);
        }
    };

    const pickDocument = async () => {
        if (attachments.length >= MAX_ATTACHMENTS) {
            alert(`Límite alcanzado: Máximo ${MAX_ATTACHMENTS} archivos por recordatorio.`);
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

    const onPickerChange = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            setShowPicker(false);
            if (event.type === 'set' && selectedDate) {
                const newDate = new Date(date);
                if (pickerMode === 'date') {
                    newDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                } else {
                    newDate.setHours(selectedDate.getHours(), selectedDate.getMinutes());
                }
                setDate(newDate);
            }
        } else {
            if (selectedDate) setDate(selectedDate);
            if (event.type === 'dismissed') setShowPicker(false);
        }
    };

    const openPicker = (mode: 'date' | 'time') => {
        setPickerMode(mode);
        // Pequeño delay para asegurar que el modo se aplique antes de mostrar el diálogo
        setTimeout(() => {
            setShowPicker(true);
        }, 50);
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#000' : '#f8f9fa' }} edges={['top', 'right', 'left']}>
            {/* Custom Header */}
            <XStack paddingHorizontal="$4" paddingVertical="$3" alignItems="center" justifyContent="space-between" zIndex={100}>
                <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                    <ChevronLeft size={28} color={isDark ? 'white' : 'black'} />
                </TouchableOpacity>
                <Text fontSize="$6" fontWeight="800" letterSpacing={-0.5} color={isDark ? 'white' : 'black'}>
                    {isEditing ? 'Editar' : 'Nuevo'}
                </Text>
                <TouchableOpacity onPress={handleSave} disabled={!title} style={{ opacity: !title ? 0.3 : 1 }}>
                    <Text color="$blue10" fontWeight="700" fontSize="$5">Listo</Text>
                </TouchableOpacity>
            </XStack>

            <ScrollView backgroundColor="transparent" flex={1} showsVerticalScrollIndicator={false}>
                <YStack padding="$4" gap="$6" paddingBottom="$10">

                    {/* Main Input Section */}
                    <YStack gap="$2">
                        <Input
                            ref={titleInputRef}
                            value={title}
                            onChangeText={setTitle}
                            placeholder="¿Qué quieres recordar?"
                            borderWidth={0}
                            backgroundColor="transparent"
                            fontSize={28}
                            fontWeight="800"
                            placeholderTextColor={isDark ? '#00ff00' : '#00ff00'}
                            color={isDark ? '#00ff00' : '#00ff00'}
                            padding={0}
                        />
                        <Separator borderColor={isDark ? '$gray4' : '$gray6'} opacity={0.5} />
                    </YStack>

                    {/* Security Level Section */}
                    <YStack gap="$3">
                        <XStack alignItems="center" gap="$2">
                            <Zap size={18} color="$orange10" />
                            <Label fontWeight="700" fontSize="$4" color={isDark ? '$gray11' : '$gray11'}>Prioridad y Control</Label>
                        </XStack>
                        <XStack gap="$3" justifyContent="space-between">
                            <LevelButton
                                active={controlLevel === 'normal'}
                                onPress={() => setControlLevel('normal')}
                                color="#3b82f6"
                                icon={Bell}
                                label="Normal"
                                isDark={isDark}
                            />
                            <LevelButton
                                active={controlLevel === 'strict'}
                                onPress={() => setControlLevel('strict')}
                                color="#f59e0b"
                                icon={AlertCircle}
                                label="Estricto"
                                isDark={isDark}
                            />
                            <LevelButton
                                active={controlLevel === 'critical'}
                                onPress={() => setControlLevel('critical')}
                                color="#ef4444"
                                icon={ShieldAlert}
                                label="Crítico"
                                isDark={isDark}
                            />
                        </XStack>

                        <Card
                            padding="$3"
                            borderRadius="$4"
                            backgroundColor={isDark ? '$gray2' : '#f0f4f8'}
                            borderWidth={1}
                            borderColor={isDark ? '$gray4' : '$blue5'}
                            animation="quick"
                        >
                            <XStack gap="$3" alignItems="center">
                                {controlLevel === 'normal' && <Bell size={18} color="#3b82f6" />}
                                {controlLevel === 'strict' && <AlertCircle size={18} color="#f59e0b" />}
                                {controlLevel === 'critical' && <ShieldAlert size={18} color="#ef4444" />}
                                <Text fontSize="$3" color={isDark ? '$gray11' : '$gray11'} flex={1}>
                                    {controlLevel === 'normal' && "Notificación estándar. Ideal para tareas rutinarias y hábitos."}
                                    {controlLevel === 'strict' && "Recordatorios persistentes cada 5 minutos hasta que confirmes la acción."}
                                    {controlLevel === 'critical' && "Alarma sonora continua. No se detendrá hasta que realices la tarea."}
                                </Text>
                            </XStack>
                        </Card>
                    </YStack>

                    {/* Date and Time Section */}
                    <YStack gap="$3">
                        <XStack alignItems="center" gap="$2">
                            <Calendar size={18} color="$blue10" />
                            <Label fontWeight="700" fontSize="$4" color={isDark ? '$gray11' : '$gray11'}>Fecha y Hora</Label>
                        </XStack>

                        <XStack gap="$3">
                            <Button
                                flex={1}
                                height={70}
                                backgroundColor={isDark ? '$gray2' : 'white'}
                                borderWidth={1}
                                borderColor={isDark ? '$gray4' : '$gray5'}
                                borderRadius="$4"
                                onPress={() => openPicker('date')}
                                pressStyle={{ backgroundColor: isDark ? '$gray3' : '$gray2' }}
                            >
                                <YStack alignItems="center">
                                    <Text fontSize="$1" fontWeight="800" color="$blue10" textTransform="uppercase" letterSpacing={1}>Fecha</Text>
                                    <Text fontSize="$4" fontWeight="700" color={isDark ? 'white' : 'black'}>
                                        {date.toLocaleDateString([], { day: '2-digit', month: 'short' })}
                                    </Text>
                                </YStack>
                            </Button>

                            <Button
                                flex={1}
                                height={70}
                                backgroundColor={isDark ? '$gray2' : 'white'}
                                borderWidth={1}
                                borderColor={isDark ? '$gray4' : '$gray5'}
                                borderRadius="$4"
                                onPress={() => openPicker('time')}
                                pressStyle={{ backgroundColor: isDark ? '$gray3' : '$gray2' }}
                            >
                                <YStack alignItems="center">
                                    <Text fontSize="$1" fontWeight="800" color="$blue10" textTransform="uppercase" letterSpacing={1}>Hora</Text>
                                    <Text fontSize="$4" fontWeight="700" color={isDark ? 'white' : 'black'}>
                                        {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </Text>
                                </YStack>
                            </Button>
                        </XStack>
                    </YStack>

                    {/* Description / Rich Text Section */}
                    <YStack gap="$3">
                        <XStack alignItems="center" gap="$2" justifyContent="space-between">
                            <XStack alignItems="center" gap="$2">
                                <FileText size={18} color="$purple10" />
                                <Label fontWeight="700" fontSize="$4" color={isDark ? '$gray11' : '$gray11'}>Notas</Label>
                            </XStack>
                        </XStack>

                        <RichToolbar
                            editor={richTextRef}
                            actions={[
                                actions.setBold,
                                actions.insertBulletsList,
                                actions.insertOrderedList,
                                actions.alignCenter,
                                actions.undo,
                                actions.redo,
                            ]}
                            iconMap={{
                                [actions.setBold]: ({ tintColor }: any) => <Bold color={tintColor} size={20} />,
                                [actions.insertBulletsList]: ({ tintColor }: any) => <List color={tintColor} size={20} />,
                                [actions.alignCenter]: ({ tintColor }: any) => <AlignCenter color={tintColor} size={20} />,
                            }}
                            style={{
                                backgroundColor: 'transparent',
                                borderBottomWidth: 0,
                            }}
                            selectedIconTint="#3b82f6"
                            iconTint={isDark ? '#9ca3af' : '#4b5563'}
                        />

                        <YStack
                            borderWidth={1}
                            borderColor={isDark ? '$gray3' : '$gray5'}
                            borderRadius="$5"
                            overflow="hidden"
                            minHeight={150}
                            backgroundColor={isDark ? '$gray1' : 'white'}
                        >
                            <RichEditor
                                ref={richTextRef}
                                initialContentHTML={description}
                                onChange={setDescription}
                                placeholder="Añade más detalles aquí..."
                                editorStyle={{
                                    backgroundColor: isDark ? '#111' : 'white',
                                    color: isDark ? 'white' : 'black',
                                    placeholderColor: isDark ? '#444' : '#aaa',
                                    contentCSSText: `font-size: 16px; min-height: 150px; padding: 10px;`,
                                }}
                            />
                        </YStack>
                    </YStack>

                    {/* Attachments Section */}
                    <YStack gap="$3">
                        <XStack justifyContent="space-between" alignItems="center">
                            <XStack alignItems="center" gap="$2">
                                <ImageIcon size={18} color="$green10" />
                                <Label fontWeight="700" fontSize="$4" color={isDark ? '$gray11' : '$gray11'}>Multimedia</Label>
                            </XStack>
                            <Text fontSize="$2" fontWeight="600" color={attachments.length >= MAX_ATTACHMENTS ? '$red10' : '$gray10'}>
                                {attachments.length} / {MAX_ATTACHMENTS}
                            </Text>
                        </XStack>

                        <XStack gap="$3" flexWrap="wrap">
                            <TouchableOpacity onPress={() => pickImage(true)} disabled={attachments.length >= MAX_ATTACHMENTS} style={[styles.attachBtn, isDark && styles.attachBtnDark]}>
                                <Camera size={20} color={isDark ? '#aaa' : '#666'} />
                                <Text fontSize="$1" fontWeight="600" marginTop="$1" color={isDark ? '#aaa' : '#666'}>Cámara</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => pickImage(false)} disabled={attachments.length >= MAX_ATTACHMENTS} style={[styles.attachBtn, isDark && styles.attachBtnDark]}>
                                <ImageIcon size={20} color={isDark ? '#aaa' : '#666'} />
                                <Text fontSize="$1" fontWeight="600" marginTop="$1" color={isDark ? '#aaa' : '#666'}>Galería</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => pickDocument()} disabled={attachments.length >= MAX_ATTACHMENTS} style={[styles.attachBtn, isDark && styles.attachBtnDark]}>
                                <Plus size={20} color={isDark ? '#aaa' : '#666'} />
                                <Text fontSize="$1" fontWeight="600" marginTop="$1" color={isDark ? '#aaa' : '#666'}>Archivo</Text>
                            </TouchableOpacity>
                        </XStack>

                        {attachments.length > 0 && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} gap="$3" paddingVertical="$2">
                                {attachments.map((item: { uri: string; name: string }, index: number) => (
                                    <XStack key={index} backgroundColor={isDark ? '$gray3' : 'white'} padding="$3" borderRadius="$4" alignItems="center" gap="$2" elevation={1} borderWidth={1} borderColor={isDark ? '$gray4' : '$gray6'}>
                                        <TouchableOpacity onPress={() => openAttachment(item.uri)}>
                                            <XStack alignItems="center" gap="$2">
                                                <FileText size={16} color="$blue10" />
                                                <Text fontSize="$2" maxWidth={100} numberOfLines={1} color={isDark ? 'white' : 'black'}>
                                                    {item.name}
                                                </Text>
                                            </XStack>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => setAttachments(attachments.filter((_, i) => i !== index))}>
                                            <XStack backgroundColor="$red5" padding="$1" borderRadius="$10">
                                                <Trash size={12} color="$red10" />
                                            </XStack>
                                        </TouchableOpacity>
                                    </XStack>
                                ))}
                            </ScrollView>
                        )}
                    </YStack>

                    {/* Secondary Actions */}
                    {isEditing && (
                        <YStack gap="$3" marginTop="$4">
                            {status === 'pending' && (
                                <Button
                                    size="$5"
                                    backgroundColor="$green10"
                                    icon={Check}
                                    borderRadius="$5"
                                    onPress={async () => {
                                        if (id) {
                                            await markAsCompleted(id);
                                            router.back();
                                        }
                                    }}
                                >
                                    <Text color="white" fontWeight="700">Completar ahora</Text>
                                </Button>
                            )}
                            <Button
                                size="$5"
                                variant="outlined"
                                borderColor="$red8"
                                icon={Trash2}
                                borderRadius="$5"
                                onPress={handleDelete}
                            >
                                <Text color="$red10" fontWeight="600">Eliminar recordatorio</Text>
                            </Button>
                        </YStack>
                    )}
                </YStack>
            </ScrollView>

            {/* Render Picker outside ScrollView for better stability */}
            {showPicker && (
                <DateTimePicker
                    value={date}
                    mode={pickerMode}
                    is24Hour={true}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onPickerChange}
                />
            )}
        </SafeAreaView>
    );
}

function LevelButton({ active, onPress, color, icon: Icon, label, isDark }: any) {
    return (
        <TouchableOpacity
            onPress={onPress}
            style={[
                styles.levelBtn,
                { borderColor: active ? color : (isDark ? '#222' : '#eee'), backgroundColor: active ? color : (isDark ? '#111' : '#fff') },
                active && styles.levelBtnActive
            ]}
        >
            <Icon size={20} color={active ? 'white' : (isDark ? '#666' : '#999')} />
            <Text
                marginTop="$1"
                fontSize="$2"
                fontWeight="700"
                color={active ? 'white' : (isDark ? '#666' : '#999')}
            >
                {label}
            </Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    iconButton: {
        padding: 5,
        marginLeft: -5,
    },
    levelBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 15,
        borderRadius: 16,
        borderWidth: 2,
        marginHorizontal: 2,
    },
    levelBtnActive: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 6,
    },
    attachBtn: {
        width: 70,
        height: 70,
        borderRadius: 16,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#eee',
        alignItems: 'center',
        justifyContent: 'center',
    },
    attachBtnDark: {
        backgroundColor: '#111',
        borderColor: '#222',
    }
});
