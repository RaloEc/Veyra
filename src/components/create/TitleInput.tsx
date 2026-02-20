import { useRef, useEffect } from 'react';
import { Input, Separator, YStack } from 'tamagui';

interface TitleInputProps {
    title: string;
    setTitle: (text: string) => void;
    isEditing: boolean;
    isDark: boolean;
    flat?: boolean;
    onSubmit?: () => void;
}

export function TitleInput({ title, setTitle, isEditing, isDark, flat, onSubmit }: TitleInputProps) {
    const titleInputRef = useRef<any>(null);

    useEffect(() => {
        if (!isEditing && !flat) {
            setTimeout(() => {
                titleInputRef?.current?.focus();
            }, 100);
        }
    }, [isEditing, flat]);

    return (
        <YStack gap="$2">
            <Input
                ref={titleInputRef}
                value={title}
                onChangeText={setTitle}
                placeholder="Título de la nota"
                borderWidth={0}
                backgroundColor="transparent"
                fontSize={flat ? 32 : 28}
                fontWeight="900"
                placeholderTextColor={isDark ? "$gray8" : "$gray10"}
                color="$color"
                padding={0}
                focusStyle={{ outlineWidth: 0 } as any}
                returnKeyType={onSubmit ? "next" : "done"}
                onSubmitEditing={onSubmit}
                blurOnSubmit={!onSubmit}
            />
            {!flat && <Separator borderColor={isDark ? '$gray4' : '$gray6'} opacity={0.5} />}
        </YStack>
    );
}
