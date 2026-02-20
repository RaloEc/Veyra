import React, { useState, useEffect } from 'react';
import { Platform, Keyboard } from 'react-native';
import { YStack, Text, AnimatePresence } from 'tamagui';
import { RichToolbar, actions } from 'react-native-pell-rich-editor';
import { Bold, List, AlignCenter, Undo2, Redo2, Image } from '@tamagui/lucide-icons';

interface RichTextToolbarProps {
    editorRef: React.RefObject<any>;
    isNotesFocused: boolean;
    isDark: boolean;
    onPressAddImage?: () => void;
}

export function RichTextToolbar({ editorRef, isNotesFocused, isDark, onPressAddImage }: RichTextToolbarProps) {
    const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

    useEffect(() => {
        const showSubscription = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
            () => setIsKeyboardVisible(true)
        );
        const hideSubscription = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            () => setIsKeyboardVisible(false)
        );

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    const isVisible = isNotesFocused && isKeyboardVisible;

    return (
        <AnimatePresence>
            {isVisible && (
                <YStack
                    key="rich-text-toolbar"
                    animation="medium"
                    enterStyle={{ opacity: 0, scaleY: 0.5, y: 20 }}
                    exitStyle={{ opacity: 0, scaleY: 0.5, y: 20 }}
                    y={0}
                    opacity={1}
                    scaleY={1}
                    bg={isDark ? '#1a1a1a' : '#fff'}
                    borderTopWidth={1}
                    borderTopColor={isDark ? '#333' : '#eee'}
                    pb={Platform.OS === 'ios' ? 0 : 0}
                    style={{ zIndex: 1000, minHeight: 44 }}
                >
                    <RichToolbar
                        editor={editorRef}
                        actions={[
                            actions.setBold,
                            actions.insertBulletsList,
                            actions.insertOrderedList,
                            actions.alignCenter,
                            actions.insertImage,
                            actions.undo,
                            actions.redo,
                        ]}
                        onPressAddImage={onPressAddImage}
                        iconMap={{
                            [actions.setBold]: ({ tintColor }: any) => <Bold color={tintColor} size={20} />,
                            [actions.insertBulletsList]: ({ tintColor }: any) => <List color={tintColor} size={20} />,
                            [actions.insertOrderedList]: ({ tintColor }: any) => <Text color={tintColor} fontSize={18} fontWeight="700">1.</Text>,
                            [actions.alignCenter]: ({ tintColor }: any) => <AlignCenter color={tintColor} size={20} />,
                            [actions.insertImage]: ({ tintColor }: any) => <Image color={tintColor} size={20} />,
                            [actions.undo]: ({ tintColor }: any) => <Undo2 color={tintColor} size={20} />,
                            [actions.redo]: ({ tintColor }: any) => <Redo2 color={tintColor} size={20} />,
                        }}
                        style={{
                            backgroundColor: 'transparent',
                            height: 50,
                        }}
                        selectedIconTint="#3b82f6"
                        iconTint={isDark ? '#9ca3af' : '#4b5563'}
                    />
                </YStack>
            )}
        </AnimatePresence>
    );
}
