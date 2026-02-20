export const AVAILABLE_SOUNDS = [
    { id: 'ping_brillante.wav', name: 'Ping Brillante', type: 'Normal (1s)', pitch: 1.0, rate: 1.0 },
    { id: 'campana_electro.mp3', name: 'Campana Electrónica', type: 'Normal (1.7s)', pitch: 1.0, rate: 1.0 },
    { id: 'clicks_tech.wav', name: 'Clicks Tech', type: 'Normal (8s)', pitch: 1.0, rate: 1.0 },
    { id: 'buzzer_fabrica.wav', name: 'Buzzer de Factoría', type: 'Estricto (3s)', pitch: 1.0, rate: 1.0 },
    { id: 'alarma_fuego.mp3', name: 'Alarma de Fuego', type: 'Estricto (7s)', pitch: 1.0, rate: 1.0 },
    { id: 'bucle_alarma.wav', name: 'Bucle de Alarma', type: 'Crítico (10s)', pitch: 1.0, rate: 1.0 },
    { id: 'alarma_incendio.mp3', name: 'Alarma de Incendio', type: 'Extremo (31s)', pitch: 1.0, rate: 1.0 },
];

export const getSoundName = (id: string) => {
    const sound = AVAILABLE_SOUNDS.find(s => s.id === id);
    if (sound) return sound.name;
    // Fallback: strip extension and replace underscores
    return id.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
};
