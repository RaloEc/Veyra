import { TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { YStack, XStack, Text, Button, ScrollView, View } from 'tamagui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Trash2, Pin, Check } from '@tamagui/lucide-icons';
import { useCreateNote } from '../../src/hooks/useCreateNote';
import { TitleInput } from '../../src/components/create/TitleInput';
import { RichTextEditorSection } from '../../src/components/create/RichTextEditorSection';
import { AttachmentsSection } from '../../src/components/create/AttachmentsSection';
import { RichTextToolbar } from '../../src/components/create/RichTextToolbar';
import { ImageCropperModal } from '../../src/components/create/ImageCropperModal';
import { PremiumAlert } from '../../src/components/ui/PremiumAlert';
import { useState, useRef } from 'react';

export default function CreateNoteScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [isNotesFocused, setIsNotesFocused] = useState(false);
    const richTextRef = useRef<any>(null);

    const {
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
        maxAttachments
    } = useCreateNote(id);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0a0a0a' : '#F9F9F9' }} edges={['top', 'right', 'left']}>

            <XStack
                style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    zIndex: 100
                }}
            >
                <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                    <ChevronLeft size={28} color={isDark ? 'white' : 'black'} />
                </TouchableOpacity>

                <XStack gap="$3" style={{ alignItems: 'center' }}>
                    <Button
                        size="$3"
                        circular
                        bg={isPinned ? '$yellow10' : (isDark ? '#333' : '#eee')}
                        onPress={() => setIsPinned(!isPinned)}
                    >
                        <Pin size={18} color={isPinned ? 'black' : (isDark ? 'white' : 'black')} />
                    </Button>

                    {isEditing && (
                        <Button
                            size="$3"
                            circular
                            bg={isDark ? '#333' : '#eee'}
                            icon={<Trash2 size={18} color={isDark ? '#ff4444' : '#cc0000'} />}
                            onPress={handleDelete}
                        />
                    )}

                    <TouchableOpacity
                        onPress={handleSave}
                        disabled={isLoading}
                        style={{
                            marginLeft: 8,
                            backgroundColor: isDark ? '#fff' : '#000',
                            paddingHorizontal: 16,
                            paddingVertical: 8,
                            borderRadius: 20,
                            opacity: isLoading ? 0.5 : 1
                        }}
                    >
                        <Text color={isDark ? '#000' : '#fff'} fontWeight="800" fontSize="$4">
                            Listo
                        </Text>
                    </TouchableOpacity>
                </XStack>
            </XStack>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                <ScrollView
                    px="$4"
                    pt="$0"
                    bg={isDark ? '#0a0a0a' : '#F9F9F9'}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 } as any}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                >
                    <YStack gap="$4" mt="$1">
                        <YStack gap="$2">
                            <TitleInput
                                title={title}
                                setTitle={setTitle}
                                isEditing={true}
                                isDark={isDark}
                                flat={true}
                                onSubmit={() => richTextRef.current?.focusContentEditor()}
                            />

                            <RichTextEditorSection
                                description={content}
                                setDescription={setContent}
                                isDark={isDark}
                                editorRef={richTextRef}
                                onFocus={() => setIsNotesFocused(true)}
                                onBlur={() => setIsNotesFocused(false)}
                                flat={true}
                            />
                        </YStack>


                        <YStack pb="$10">
                            <AttachmentsSection
                                attachments={attachments}
                                MAX_ATTACHMENTS={maxAttachments}
                                pickImage={pickImage}
                                pickDocument={pickDocument}
                                openAttachment={openAttachment}
                                removeAttachment={removeAttachment}
                                isDark={isDark}
                            />
                        </YStack>
                    </YStack>
                </ScrollView>

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
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    iconButton: {
        padding: 5,
        marginLeft: -5,
    },
});
