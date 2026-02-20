import { View, YStack, XStack, Text, H2, H4, Card, Button, ScrollView, Accordion } from 'tamagui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../src/store/useStore';
import { HelpCircle, Mail, MessageCircle, Book, ChevronDown } from '@tamagui/lucide-icons';

export default function HelpScreen() {
    const { theme } = useStore();

    const faqs = [
        {
            question: '¿Cómo funcionan los niveles de control?',
            answer: 'Los niveles de control determinan qué tan insistente es la aplicación con tus recordatorios:\n\n• Normal: Una notificación única.\n• Estricto: Notificación + 2 recordatorios cada 15 minutos.\n• Crítico: Notificación + 5 recordatorios cada 5 minutos con sonido y vibración intensos.',
        },
        {
            question: '¿Puedo desactivar las notificaciones repetidas?',
            answer: 'Sí, puedes cambiar el nivel de control de cualquier recordatorio a "Normal" editándolo. También puedes ajustar las configuraciones globales en Ajustes.',
        },
        {
            question: '¿Qué pasa si elimino un recordatorio?',
            answer: 'Al eliminar un recordatorio, se cancela automáticamente y se marca como "fallido" en tu historial. Esto afecta tu tasa de cumplimiento.',
        },
        {
            question: '¿Cómo funciona el Modo Estricto?',
            answer: 'El Modo Estricto convierte TODOS tus recordatorios en nivel "Estricto" temporalmente y puede bloquear las posposiciones según tu configuración.',
        },
        {
            question: '¿Puedo exportar mis datos?',
            answer: 'Actualmente puedes ver tu historial completo en la sección de Historial. La función de exportación a CSV estará disponible pronto.',
        },
    ];

    return (
        <View style={{ flex: 1, backgroundColor: theme === 'dark' ? '#000' : '#F9F9F9' }}>

            <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 24, paddingBottom: 100 }}>
                <YStack gap="$4">
                    <YStack gap="$2">
                        <XStack gap="$2" alignItems="center">
                            <HelpCircle size={28} color="$blue10" />
                            <H2 color={theme === 'dark' ? 'white' : 'black'}>Ayuda y Soporte</H2>
                        </XStack>
                        <Text fontSize="$3" color="$gray10">
                            Encuentra respuestas a tus preguntas
                        </Text>
                    </YStack>

                    {/* Preguntas Frecuentes */}
                    <YStack gap="$3">
                        <H4 color={theme === 'dark' ? 'white' : 'black'}>
                            Preguntas Frecuentes
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
                                    Contactar Soporte
                                </H4>
                            </XStack>

                            <Text fontSize="$3" color="$gray10">
                                ¿No encontraste lo que buscabas? Estamos aquí para ayudarte.
                            </Text>

                            <Button
                                size="$4"
                                backgroundColor="$green10"
                                icon={Mail}
                            >
                                <Text color="white" fontWeight="700">Enviar Email</Text>
                            </Button>
                        </YStack>
                    </Card>

                    {/* Reportar Bug */}
                    <Card padding="$4" backgroundColor={theme === 'dark' ? '$gray2' : 'white'}>
                        <YStack gap="$3">
                            <XStack gap="$2" alignItems="center">
                                <Book size={20} color="$red10" />
                                <H4 color={theme === 'dark' ? 'white' : 'black'}>
                                    Reportar un Problema
                                </H4>
                            </XStack>

                            <Text fontSize="$3" color="$gray10">
                                Ayúdanos a mejorar reportando bugs o sugerencias.
                            </Text>

                            <Button
                                size="$4"
                                variant="outlined"
                                borderColor="$red10"
                            >
                                <Text color="$red10" fontWeight="700">Reportar Bug</Text>
                            </Button>
                        </YStack>
                    </Card>

                    {/* Versión */}
                    <Card padding="$4" backgroundColor={theme === 'dark' ? '$gray2' : 'white'}>
                        <XStack justifyContent="space-between" alignItems="center">
                            <Text color="$gray10">Versión de la App</Text>
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
