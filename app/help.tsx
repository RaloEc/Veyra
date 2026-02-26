import { View, YStack, XStack, Text, H2, H4, Card, Button, ScrollView, Accordion } from 'tamagui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../src/store/useStore';
import { HelpCircle, Mail, MessageCircle, Book, ChevronDown } from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';

export default function HelpScreen() {
    const { t } = useTranslation();
    const { theme } = useStore();

    const faqs = [
        {
            question: t('help.faqs.q1'),
            answer: t('help.faqs.a1'),
        },
        {
            question: t('help.faqs.q2'),
            answer: t('help.faqs.a2'),
        },
        {
            question: t('help.faqs.q3'),
            answer: t('help.faqs.a3'),
        },
        {
            question: t('help.faqs.q4'),
            answer: t('help.faqs.a4'),
        },
        {
            question: t('help.faqs.q5'),
            answer: t('help.faqs.a5'),
        },
    ];

    return (
        <View style={{ flex: 1, backgroundColor: theme === 'dark' ? '#000' : '#F9F9F9' }}>

            <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 24, paddingBottom: 100 }}>
                <YStack gap="$4">
                    <YStack gap="$2">
                        <XStack gap="$2" alignItems="center">
                            <HelpCircle size={28} color="$blue10" />
                            <H2 color={theme === 'dark' ? 'white' : 'black'}>{t('help.title')}</H2>
                        </XStack>
                        <Text fontSize="$3" color="$gray10">
                            {t('help.description')}
                        </Text>
                    </YStack>

                    {/* Preguntas Frecuentes */}
                    <YStack gap="$3">
                        <H4 color={theme === 'dark' ? 'white' : 'black'}>
                            {t('help.faqs_title')}
                        </H4>

                        <Accordion type="multiple" gap="$2">
                            {faqs.map((faq, index) => (
                                <Accordion.Item key={index} value={`faq-${index}`}>
                                    <Accordion.Trigger
                                        flexDirection="row"
                                        justifyContent="space-between"
                                        backgroundColor={theme === 'dark' ? '$gray2' : 'white'}
                                        padding="$4"
                                        borderRadius="$4"
                                        borderWidth={1}
                                        borderColor="$gray5"
                                    >
                                        {({ open }: { open: boolean }) => (
                                            <>
                                                <Text
                                                    flex={1}
                                                    fontSize="$4"
                                                    fontWeight="600"
                                                    color={theme === 'dark' ? 'white' : 'black'}
                                                >
                                                    {faq.question}
                                                </Text>
                                                <ChevronDown
                                                    size={20}
                                                    color="$gray10"
                                                    style={{
                                                        transform: [{ rotate: open ? '180deg' : '0deg' }],
                                                    }}
                                                />
                                            </>
                                        )}
                                    </Accordion.Trigger>

                                    <Accordion.Content
                                        padding="$4"
                                        backgroundColor={theme === 'dark' ? '$gray3' : '$gray2'}
                                        marginTop="$1"
                                        borderRadius="$4"
                                    >
                                        <Text fontSize="$3" color={theme === 'dark' ? '$gray11' : '$gray12'}>
                                            {faq.answer}
                                        </Text>
                                    </Accordion.Content>
                                </Accordion.Item>
                            ))}
                        </Accordion>
                    </YStack>

                    {/* Contactar Soporte */}
                    <Card padding="$4" backgroundColor={theme === 'dark' ? '$gray2' : 'white'}>
                        <YStack gap="$3">
                            <XStack gap="$2" alignItems="center">
                                <MessageCircle size={20} color="$green10" />
                                <H4 color={theme === 'dark' ? 'white' : 'black'}>
                                    {t('help.contact_support')}
                                </H4>
                            </XStack>

                            <Text fontSize="$3" color="$gray10">
                                {t('help.contact_desc')}
                            </Text>

                            <Button
                                size="$4"
                                backgroundColor="$green10"
                                icon={Mail}
                            >
                                <Text color="white" fontWeight="700">{t('help.send_email')}</Text>
                            </Button>
                        </YStack>
                    </Card>

                    {/* Reportar Bug */}
                    <Card padding="$4" backgroundColor={theme === 'dark' ? '$gray2' : 'white'}>
                        <YStack gap="$3">
                            <XStack gap="$2" alignItems="center">
                                <Book size={20} color="$red10" />
                                <H4 color={theme === 'dark' ? 'white' : 'black'}>
                                    {t('help.report_problem')}
                                </H4>
                            </XStack>

                            <Text fontSize="$3" color="$gray10">
                                {t('help.report_desc')}
                            </Text>

                            <Button
                                size="$4"
                                variant="outlined"
                                borderColor="$red10"
                            >
                                <Text color="$red10" fontWeight="700">{t('help.report_bug')}</Text>
                            </Button>
                        </YStack>
                    </Card>

                    {/* Versión */}
                    <Card padding="$4" backgroundColor={theme === 'dark' ? '$gray2' : 'white'}>
                        <XStack justifyContent="space-between" alignItems="center">
                            <Text color="$gray10">{t('help.app_version')}</Text>
                            <Text fontWeight="700" color={theme === 'dark' ? 'white' : 'black'}>
                                1.0.0
                            </Text>
                        </XStack>
                    </Card>
                </YStack>
            </ScrollView>
        </View>
    );
}
