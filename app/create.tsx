import { TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { YStack, XStack, Text, Button, ScrollView } from 'tamagui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Check, Trash2 } from '@tamagui/lucide-icons';
import { useCreateReminder } from '../src/hooks/useCreateReminder';
import { TitleInput } from '../src/components/create/TitleInput';
import { PrioritySelector } from '../src/components/create/PrioritySelector';
import { DateTimeSelector } from '../src/components/create/DateTimeSelector';
import { RichTextEditorSection } from '../src/components/create/RichTextEditorSection';
import { AttachmentsSection } from '../src/components/create/AttachmentsSection';
import { RichTextToolbar } from '../src/components/create/RichTextToolbar';
import { ImageCropperModal } from '../src/components/create/ImageCropperModal';
import { PremiumAlert } from '../src/components/ui/PremiumAlert';
import { useState, useRef } from 'react';

export default function CreateScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [isNotesFocused, setIsNotesFocused] = useState(false);
    const richTextRef = useRef<any>(null);

    const {
        title,
        setTitle,
        description,
        setDescription,
        attachments,
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
    } = useCreateReminder(id);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0a0a0a' : '#f8f9fa' }} edges={['top', 'right', 'left']}>
            <View style={{ flex: 1 }} onStartShouldSetResponder={() => true}>
                {/* Custom Header */}
                <XStack style={{ paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center', justifyContent: 'space-between', zIndex: 100 }}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                        <ChevronLeft size={28} color={isDark ? 'white' : 'black'} />
                    </TouchableOpacity>
                    <Text fontSize="$5" fontWeight="800" letterSpacing={-0.5} color={isDark ? 'white' : 'black'}>
                        {isEditing ? 'Editar Recordatorio' : 'Crear Recordatorio'}
                    </Text>
                    <TouchableOpacity onPress={handleSave} disabled={!title} style={{ opacity: !title ? 0.3 : 1 }}>
                        <Text color="$blue10" fontWeight="700" fontSize="$5">Listo</Text>
                    </TouchableOpacity>
                </XStack>

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ flex: 1 }}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
                >

                    <ScrollView
                        px="$4"
                        pt="$2"
                        bg={isDark ? '#0a0a0a' : '#F9F9F9'}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ flexGrow: 1, paddingBottom: 150 }}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="interactive"
                        automaticallyAdjustKeyboardInsets={Platform.OS === 'android'}
                    >
                        <YStack gap="$5" pb="$10">

                            <TitleInput
                                title={title}
                                setTitle={setTitle}
                                isEditing={isEditing}
                                isDark={isDark}
                                onSubmit={() => richTextRef.current?.focusContentEditor()}
                            />

                            <DateTimeSelector
                                date={date}
                                setDate={setDate}
                                showPicker={showPicker}
                                setShowPicker={setShowPicker}
                                animationHeight={animationHeight}
                                isDark={isDark}
                            />

                            <RichTextEditorSection
                                description={description}
                                setDescription={setDescription}
                                isDark={isDark}
                                editorRef={richTextRef}
                                onFocus={() => setIsNotesFocused(true)}
                                onBlur={() => setIsNotesFocused(false)}
                            />

                            <AttachmentsSection
                                attachments={attachments}
                                MAX_ATTACHMENTS={MAX_ATTACHMENTS}
                                pickImage={pickImage}
                                pickDocument={pickDocument}
                                openAttachment={openAttachment}
                                removeAttachment={removeAttachment}
                                isDark={isDark}
                            />

                            <PrioritySelector
                                controlLevel={controlLevel}
                                setControlLevel={setControlLevel}
                                isDark={isDark}
                            />

                            {/* Secondary Actions */}
                            {isEditing && (
                                <YStack gap="$3" style={{ marginTop: 16 }}>
                                    {status === 'pending' && (
                                        <Button
                                            size="$5"
                                            bg="$green10"
                                            icon={Check}
                                            style={{ borderRadius: 10 }}
                                            onPress={handleComplete}
                                        >
                                            <Text color="white" fontWeight="700">Completar ahora</Text>
                                        </Button>
                                    )}
                                    <Button
                                        size="$5"
                                        variant="outlined"
                                        style={{ borderColor: '$red8', borderRadius: 10 }}
                                        icon={Trash2}
                                        onPress={handleDelete}
                                    >
                                        <Text color="$red10" fontWeight="600">Eliminar recordatorio</Text>
                                    </Button>
                                </YStack>
                            )}
                        </YStack>
                    </ScrollView>

                    {/* Sticky Rich Text Toolbar */}
                    <RichTextToolbar
                        editorRef={richTextRef}
                        isNotesFocused={isNotesFocused}
                        isDark={isDark}
                        onPressAddImage={pickImageForEditor}
                    />

                    <ImageCropperModal
                        isVisible={isCropperVisible}
                        imageUri={cropperUri}
                        isDark={isDark}
                        onClose={() => setIsCropperVisible(false)}
                        onEditingComplete={async (result) => {
                            const base64 = await processCroppedImage(result.uri);
                            if (base64) {
                                richTextRef.current?.insertImage(base64, 'width: 100%; border-radius: 12px;');
                                setTimeout(() => {
                                    richTextRef.current?.insertHTML('<br/>');
                                    richTextRef.current?.focusContentEditor();
                                }, 300);
                            }
                        }}
                    />
                    <PremiumAlert
                        isVisible={alertVisible}
                        onClose={() => setAlertVisible(false)}
                        title={alertConfig.title}
                        description={alertConfig.description}
                        isDark={isDark}
                    />
                </KeyboardAvoidingView>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    iconButton: {
        padding: 5,
        marginLeft: -5,
    },
});
