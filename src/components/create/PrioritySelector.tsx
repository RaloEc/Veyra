import { XStack, YStack, Label, Card, Text } from 'tamagui';
import { useTranslation } from 'react-i18next';
import { Zap, Bell, AlertCircle, ShieldAlert } from '@tamagui/lucide-icons';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { ControlLevel } from '../../types/db';

interface PrioritySelectorProps {
    controlLevel: ControlLevel;
    setControlLevel: (level: ControlLevel) => void;
    isDark: boolean;
}

export function PrioritySelector({ controlLevel, setControlLevel, isDark }: PrioritySelectorProps) {
    const { t } = useTranslation();
    return (
        <YStack gap="$3">
            <XStack alignItems="center" gap="$2">
                <Zap size={18} color="$orange10" />
                <Label fontWeight="700" fontSize="$4" color={isDark ? '$gray11' : '$gray11'}>{t('create.sections.priority')}</Label>
            </XStack>
            <XStack gap="$3" justifyContent="space-between">
                <LevelButton
                    active={controlLevel === 'normal'}
                    onPress={() => setControlLevel('normal')}
                    color="#3b82f6"
                    icon={Bell}
                    label={t('create.priority.normal.label')}
                    isDark={isDark}
                />
                <LevelButton
                    active={controlLevel === 'strict'}
                    onPress={() => setControlLevel('strict')}
                    color="#f59e0b"
                    icon={AlertCircle}
                    label={t('create.priority.strict.label')}
                    isDark={isDark}
                />
                <LevelButton
                    active={controlLevel === 'critical'}
                    onPress={() => setControlLevel('critical')}
                    color="#ef4444"
                    icon={ShieldAlert}
                    label={t('create.priority.critical.label')}
                    isDark={isDark}
                />
            </XStack>

            <Card
                padding="$3"
                borderRadius="$4"
                backgroundColor={isDark ? '$gray2' : '#f0f4f8'}
                borderWidth={1}
                borderColor={isDark ? '$gray4' : '$blue5'}
            >
                <XStack gap="$3" alignItems="center">
                    {controlLevel === 'normal' && <Bell size={18} color="#3b82f6" />}
                    {controlLevel === 'strict' && <AlertCircle size={18} color="#f59e0b" />}
                    {controlLevel === 'critical' && <ShieldAlert size={18} color="#ef4444" />}
                    <Text fontSize="$3" color={isDark ? '$gray11' : '$gray11'} flex={1}>
                        {t(`create.priority.${controlLevel}.desc`)}
                    </Text>
                </XStack>
            </Card>
        </YStack>
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
});
