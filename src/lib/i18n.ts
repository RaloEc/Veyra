import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import es from '../locales/es.json';
import en from '../locales/en.json';

const resources = {
    es: { translation: es },
    en: { translation: en },
};

i18n
    .use(initReactI18next)
    .init({
        resources,
        lng: Localization.getLocales()[0].languageCode ?? 'es', // Lenguaje del sistema por defecto
        fallbackLng: 'es',
        interpolation: {
            escapeValue: false,
        },
    });

export default i18n;
