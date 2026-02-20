import { ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { YStack, XStack, Label, Text } from 'tamagui';
import { Image as ImageIcon, Camera, FilePlus2, FileText, Trash } from '@tamagui/lucide-icons';

interface AttachmentsSectionProps {
    attachments: { uri: string; name: string }[];
    MAX_ATTACHMENTS: number;
    pickImage: (useCamera: boolean) => void;
    pickDocument: () => void;
    openAttachment: (uri: string) => void;
    removeAttachment: (index: number) => void;
    isDark: boolean;
}

export function AttachmentsSection({
    attachments,
    MAX_ATTACHMENTS,
    pickImage,
    pickDocument,
    openAttachment,
    removeAttachment,
    isDark
}: AttachmentsSectionProps) {

    return (
        <YStack gap="$3">
            <XStack justifyContent="space-between" alignItems="center">
                <XStack alignItems="center" gap="$2">
                    <ImageIcon size={18} color="$green10" />
                    <Label fontWeight="600" fontSize="$3" color={isDark ? '$gray9' : '$gray10'}>Multimedia</Label>
                </XStack>
                <Text fontSize="$2" fontWeight="600" color={attachments.length >= MAX_ATTACHMENTS ? '$red10' : '$gray10'}>
                    {attachments.length} / {MAX_ATTACHMENTS}
                </Text>
            </XStack>

            <XStack gap="$3" flexWrap="wrap">
                <TouchableOpacity onPress={() => pickImage(true)} disabled={attachments.length >= MAX_ATTACHMENTS} style={[styles.attachBtn, isDark && styles.attachBtnDark]}>
                    <Camera size={20} color={isDark ? '#aaa' : '#666'} />
                    <Text fontSize="$1" fontWeight="600" mt="$1" color={isDark ? '#aaa' : '#666'}>Cámara</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => pickImage(false)} disabled={attachments.length >= MAX_ATTACHMENTS} style={[styles.attachBtn, isDark && styles.attachBtnDark]}>
                    <ImageIcon size={20} color={isDark ? '#aaa' : '#666'} />
                    <Text fontSize="$1" fontWeight="600" mt="$1" color={isDark ? '#aaa' : '#666'}>Galería</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => pickDocument()} disabled={attachments.length >= MAX_ATTACHMENTS} style={[styles.attachBtn, isDark && styles.attachBtnDark]}>
                    <FilePlus2 size={20} color={isDark ? '#aaa' : '#666'} />
                    <Text fontSize="$1" fontWeight="600" mt="$1" color={isDark ? '#aaa' : '#666'}>Archivo</Text>
                </TouchableOpacity>
            </XStack>

            {attachments.length > 0 && (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingVertical: 10, gap: 12 }}
                >
                    {attachments.map((item, index) => (
                        <XStack key={index} backgroundColor={isDark ? '$gray3' : 'white'} padding="$3" borderRadius="$4" alignItems="center" gap="$2" elevation={1} borderWidth={1} borderColor={isDark ? '$gray4' : '$gray6'}>
                            <TouchableOpacity onPress={() => openAttachment(item.uri)}>
                                <XStack alignItems="center" gap="$2">
                                    <FileText size={16} color="$blue10" />
                                    <Text fontSize="$2" maxWidth={100} numberOfLines={1} color={isDark ? 'white' : 'black'}>
                                        {item.name}
                                    </Text>
                                </XStack>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => removeAttachment(index)}>
                                <XStack backgroundColor="$red5" padding="$1" borderRadius="$10">
                                    <Trash size={12} color="$red10" />
                                </XStack>
                            </TouchableOpacity>
                        </XStack>
                    ))}
                </ScrollView>
            )}
        </YStack>
    );
}

const styles = StyleSheet.create({
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
