import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useStore } from '../src/store/useStore';

export default function CalendarRoute() {
    const router = useRouter();

    useEffect(() => {
        // Activar la vista de agenda / recordatorios en el store
        useStore.getState().setMainActiveTab('reminders');
        useStore.getState().setHomeViewMode('calendar');
        // Navegar a la pantalla principal con la agenda y el calendario desplegado
        router.replace('/');
    }, [router]);

    return <View style={{ flex: 1, backgroundColor: 'transparent' }} />;
}
