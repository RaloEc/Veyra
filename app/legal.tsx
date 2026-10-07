import React, { useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
    ChevronLeft,
    Shield,
    FileText,
    ExternalLink,
    Mail,
    CheckCircle2,
    Lock,
} from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';

import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { VeyraSurface } from '../src/components/ui/VeyraSurface';
import { VeyraIconButton } from '../src/components/ui/VeyraIconButton';
import { VeyraDivider } from '../src/components/ui/VeyraDivider';
import { APP_CONFIG } from '../src/constants/appConfig';

export default function LegalScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const params = useLocalSearchParams<{ tab?: string }>();
    const { colors, typography, accent, isDark } = useVeyraTheme();
    const insets = useSafeAreaInsets();

    const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>(
        params.tab === 'terms' ? 'terms' : 'privacy'
    );

    const handleOpenExternal = () => {
        const url = activeTab === 'privacy' 
            ? `${APP_CONFIG.baseUrl}/privacy` 
            : `${APP_CONFIG.baseUrl}/terms`;
        Linking.openURL(url).catch(() => {
            Linking.openURL(`mailto:${APP_CONFIG.supportEmail}`);
        });
    };

    return (
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'right', 'left']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
                <VeyraIconButton
                    variant="ghost"
                    size="sm"
                    icon={<ChevronLeft size={24} color={colors.textPrimary} />}
                    onPress={() => router.back()}
                />
                <Text style={[styles.headerTitle, { color: colors.textPrimary, fontSize: 18 }]}>
                    {activeTab === 'privacy' ? 'Política de Privacidad' : 'Términos y Condiciones'}
                </Text>
                <VeyraIconButton
                    variant="ghost"
                    size="sm"
                    icon={<ExternalLink size={20} color={colors.textSecondary} />}
                    onPress={handleOpenExternal}
                />
            </View>

            {/* Selector de Pestañas */}
            <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.borderSubtle }]}>
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setActiveTab('privacy')}
                    style={[
                        styles.tabButton,
                        activeTab === 'privacy' && [styles.tabButtonActive, { borderBottomColor: accent.primary }],
                    ]}
                >
                    <Shield size={16} color={activeTab === 'privacy' ? accent.primary : colors.textMuted} />
                    <Text
                        style={[
                            styles.tabButtonText,
                            {
                                color: activeTab === 'privacy' ? accent.primary : colors.textSecondary,
                                fontWeight: activeTab === 'privacy' ? '700' : '500',
                            },
                        ]}
                    >
                        Privacidad
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setActiveTab('terms')}
                    style={[
                        styles.tabButton,
                        activeTab === 'terms' && [styles.tabButtonActive, { borderBottomColor: accent.primary }],
                    ]}
                >
                    <FileText size={16} color={activeTab === 'terms' ? accent.primary : colors.textMuted} />
                    <Text
                        style={[
                            styles.tabButtonText,
                            {
                                color: activeTab === 'terms' ? accent.primary : colors.textSecondary,
                                fontWeight: activeTab === 'terms' ? '700' : '500',
                            },
                        ]}
                    >
                        Términos de Uso
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
            >
                {/* Badge de última actualización */}
                <VeyraSurface level={1} radius="md" style={styles.badgeCard}>
                    <Lock size={15} color="#10B981" />
                    <Text style={[styles.badgeText, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                        Versión vigente · Actualizado para cumplimiento con Google Play & App Store
                    </Text>
                </VeyraSurface>

                {activeTab === 'privacy' ? (
                    /* ─── POLÍTICA DE PRIVACIDAD ─── */
                    <View style={styles.contentSection}>
                        <VeyraSurface level={1} radius="lg" style={styles.articleCard}>
                            <Text style={[styles.sectionHeading, { color: colors.textPrimary, fontSize: typography.h3.fontSize }]}>
                                1. Responsable del Tratamiento
                            </Text>
                            <Text style={[styles.paragraph, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                                Veyra ("nosotros", "la Aplicación") es una plataforma de productividad, gestión de tareas, notas y calendario. Nos comprometemos a proteger la privacidad y los datos de nuestros usuarios de acuerdo con los más altos estándares internacionales (incluyendo el RGPD europeo y regulaciones de las tiendas de aplicaciones).
                            </Text>
                            <Text style={[styles.paragraph, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                                Correo de contacto y privacidad: <Text style={{ color: accent.primary, fontWeight: '700' }}>soporte@veyra.app</Text>
                            </Text>

                            <VeyraDivider style={{ marginVertical: 12 }} />

                            <Text style={[styles.sectionHeading, { color: colors.textPrimary, fontSize: typography.h3.fontSize }]}>
                                2. Datos que Recopilamos
                            </Text>
                            <Text style={[styles.paragraph, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                                • <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Información de la Cuenta:</Text> Correo electrónico y nombre para autenticación y sincronización con Supabase Auth.
                            </Text>
                            <Text style={[styles.paragraph, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                                • <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Contenido del Usuario:</Text> Títulos, descripciones, fechas, subtareas, notas y eventos creados. Estos datos se almacenan localmente en SQLite y se sincronizan cifrados en la nube si inicias sesión.
                            </Text>
                            <Text style={[styles.paragraph, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                                • <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Permiso de Audio:</Text> Utilizado exclusivamente cuando pulsas el botón de dictado por voz para convertir voz a texto. No grabamos ni almacenamos tus audios de forma permanente.
                            </Text>
                            <Text style={[styles.paragraph, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                                • <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Permisos de Alarmas y Notificaciones:</Text> Utilizados únicamente para programar los recordatorios exactos y alarmas que configures.
                            </Text>

                            <VeyraDivider style={{ marginVertical: 12 }} />

                            <Text style={[styles.sectionHeading, { color: colors.textPrimary, fontSize: typography.h3.fontSize }]}>
                                3. Seguridad y Cifrado
                            </Text>
                            <Text style={[styles.paragraph, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                                Todas las comunicaciones entre la aplicación y nuestros servidores utilizan exclusivamente protocolo cifrado HTTPS/TLS. No permitimos conexiones en texto claro ni vendemos tus datos personales a empresas de publicidad o terceros.
                            </Text>

                            <VeyraDivider style={{ marginVertical: 12 }} />

                            <Text style={[styles.sectionHeading, { color: colors.textPrimary, fontSize: typography.h3.fontSize }]}>
                                4. Eliminación de Cuenta y Datos
                            </Text>
                            <Text style={[styles.paragraph, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                                Tienes derecho en cualquier momento a solicitar o ejecutar la eliminación total e inmediata de tu cuenta y todos los datos asociados. Puedes hacerlo directamente desde la aplicación en:
                            </Text>
                            <View style={[styles.highlightBox, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.25)' }]}>
                                <Text style={[styles.highlightText, { color: isDark ? '#F87171' : '#DC2626' }]}>
                                    Mi Perfil → Zona de Riesgo → "Eliminar cuenta definitivamente"
                                </Text>
                            </View>
                            <Text style={[styles.paragraph, { color: colors.textSecondary, fontSize: typography.body.fontSize, marginTop: 8 }]}>
                                También puedes solicitar la eliminación manual enviando un correo a soporte@veyra.app.
                            </Text>
                        </VeyraSurface>
                    </View>
                ) : (
                    /* ─── TÉRMINOS Y CONDICIONES (EULA) ─── */
                    <View style={styles.contentSection}>
                        <VeyraSurface level={1} radius="lg" style={styles.articleCard}>
                            <Text style={[styles.sectionHeading, { color: colors.textPrimary, fontSize: typography.h3.fontSize }]}>
                                1. Aceptación de los Términos
                            </Text>
                            <Text style={[styles.paragraph, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                                Al descargar, instalar o utilizar Veyra, aceptas quedar vinculado por estos Términos y Condiciones y por el Acuerdo de Licencia de Usuario Final (EULA). Si no estás de acuerdo con alguna parte, debes desinstalar la aplicación.
                            </Text>

                            <VeyraDivider style={{ marginVertical: 12 }} />

                            <Text style={[styles.sectionHeading, { color: colors.textPrimary, fontSize: typography.h3.fontSize }]}>
                                2. Uso Permitido y Edad Mínima
                            </Text>
                            <Text style={[styles.paragraph, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                                Veyra está diseñada para fines de productividad y organización personal. La aplicación está dirigida a personas mayores de 13 años (o la edad mínima legal en tu jurisdicción).
                            </Text>

                            <VeyraDivider style={{ marginVertical: 12 }} />

                            <Text style={[styles.sectionHeading, { color: colors.textPrimary, fontSize: typography.h3.fontSize }]}>
                                3. Suscripciones y Pagos (Veyra PRO)
                            </Text>
                            <Text style={[styles.paragraph, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                                Las compras de funciones digitales y suscripciones se gestionan de forma segura a través de las pasarelas oficiales de Google Play Store y Apple App Store (In-App Purchases / RevenueCat). La renovación, facturación y cancelación de las suscripciones están sujetas a las políticas de tu cuenta en la tienda correspondiente.
                            </Text>

                            <VeyraDivider style={{ marginVertical: 12 }} />

                            <Text style={[styles.sectionHeading, { color: colors.textPrimary, fontSize: typography.h3.fontSize }]}>
                                4. Propiedad Intelectual
                            </Text>
                            <Text style={[styles.paragraph, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                                El código fuente, logotipos, marcas, diseño de interfaz y elementos audiovisuales de Veyra son propiedad exclusiva de sus desarrolladores. Los iconos y fuentes integrados se utilizan bajo sus respectivas licencias de código abierto (MIT / SIL Open Font License).
                            </Text>

                            <VeyraDivider style={{ marginVertical: 12 }} />

                            <Text style={[styles.sectionHeading, { color: colors.textPrimary, fontSize: typography.h3.fontSize }]}>
                                5. Exclusión de Responsabilidad
                            </Text>
                            <Text style={[styles.paragraph, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                                Veyra realiza sus mejores esfuerzos para garantizar la entrega puntual de alarmas y notificaciones mediante servicios nativos. Sin embargo, no nos hacemos responsables por recordatorios omitidos derivados de configuraciones de ahorro extremo de batería, cierres forzados por el sistema operativo o problemas de hardware del dispositivo.
                            </Text>
                        </VeyraSurface>
                    </View>
                )}

                {/* Contacto de Soporte */}
                <VeyraSurface level={1} radius="md" style={styles.contactCard}>
                    <Mail size={18} color={accent.primary} />
                    <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.contactTitle, { color: colors.textPrimary, fontSize: typography.bodyMedium.fontSize }]}>
                            ¿Tienes dudas legales o sobre tus datos?
                        </Text>
                        <Text style={[styles.contactEmail, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                            Escríbenos a soporte@veyra.app
                        </Text>
                    </View>
                </VeyraSurface>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    headerTitle: {
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    tabBar: {
        flexDirection: 'row',
        borderBottomWidth: 1,
    },
    tabButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 13,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabButtonActive: {
        borderBottomWidth: 2,
    },
    tabButtonText: {
        fontSize: 14,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 16,
        gap: 14,
    },
    badgeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 12,
    },
    badgeText: {
        flex: 1,
        lineHeight: 18,
    },
    contentSection: {
        gap: 14,
    },
    articleCard: {
        padding: 18,
        gap: 10,
    },
    sectionHeading: {
        fontWeight: '800',
        marginTop: 6,
    },
    paragraph: {
        lineHeight: 22,
    },
    highlightBox: {
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        marginTop: 4,
    },
    highlightText: {
        fontWeight: '700',
        fontSize: 13,
    },
    contactCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        marginTop: 4,
    },
    contactTitle: {
        fontWeight: '700',
    },
    contactEmail: {
        lineHeight: 18,
    },
});
