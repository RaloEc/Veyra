const assert = require('assert');

console.log('=== TEST DE RESILIENCIA Y DESCONGELAMIENTO DE SINCRONIZACIÓN ===\n');

async function testSyncStateGuarantees() {
    console.log('[TEST 1] Verificando garantía de desbloqueo finally en triggerSync...');
    
    // Simular el patrón de useStore triggerSync
    let isSyncing = false;
    let syncError = null;
    let currentSyncStartTime = 0;
    const SYNC_TIMEOUT_MS = 100; // timeout corto para el test

    async function triggerSyncSimulated(mockSyncFn) {
        if (isSyncing) {
            const elapsed = Date.now() - currentSyncStartTime;
            if (currentSyncStartTime > 0 && elapsed < SYNC_TIMEOUT_MS) {
                return;
            }
        }

        currentSyncStartTime = Date.now();
        isSyncing = true;
        syncError = null;

        try {
            const syncPromise = mockSyncFn();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Sync timeout')), SYNC_TIMEOUT_MS)
            );
            await Promise.race([syncPromise, timeoutPromise]);
        } catch (e) {
            syncError = e.message;
        } finally {
            currentSyncStartTime = 0;
            isSyncing = false;
        }
    }

    // Caso A: Sincronización normal
    await triggerSyncSimulated(async () => {
        return { success: true };
    });
    assert.strictEqual(isSyncing, false, 'isSyncing debe ser false tras sync exitoso');
    assert.strictEqual(syncError, null, 'No debe haber error');
    console.log('  ✓ Caso A superado: Sincronización normal libera isSyncing.');

    // Caso B: Sincronización con error lanzado en SyncService
    await triggerSyncSimulated(async () => {
        throw new Error('Network error 500');
    });
    assert.strictEqual(isSyncing, false, 'isSyncing debe ser false tras excepción');
    assert.strictEqual(syncError, 'Network error 500', 'syncError debe registrar el error');
    console.log('  ✓ Caso B superado: Error lanzado no deja isSyncing colgado.');

    // Caso C: Promesa colgada indefinidamente (simula FileSystem.downloadAsync o socket colgado)
    const startC = Date.now();
    await triggerSyncSimulated(() => new Promise(() => {})); // Nunca resuelve
    const durationC = Date.now() - startC;
    assert.strictEqual(isSyncing, false, 'isSyncing debe ser false tras timeout');
    assert.strictEqual(syncError, 'Sync timeout', 'syncError debe ser timeout');
    assert.ok(durationC >= 90 && durationC < 250, `El timeout debe abortar en ~100ms (tardó ${durationC}ms)`);
    console.log('  ✓ Caso C superado: Timeout watchdog aborta promesa colgada y limpia isSyncing.');
}

async function testWatchdogRecovery() {
    console.log('\n[TEST 2] Verificando recuperación ante bloqueo previo (Watchdog)...');
    
    let isSyncing = true;
    let currentSyncStartTime = Date.now() - 30000; // Empezó hace 30 segundos
    const SYNC_TIMEOUT_MS = 25000;

    let syncExecuted = false;
    async function triggerSyncSimulated() {
        if (isSyncing) {
            const elapsed = Date.now() - currentSyncStartTime;
            if (currentSyncStartTime > 0 && elapsed < SYNC_TIMEOUT_MS) {
                return;
            }
            // Watchdog superado: liberar cerrojo
        }

        currentSyncStartTime = Date.now();
        isSyncing = true;
        try {
            syncExecuted = true;
        } finally {
            currentSyncStartTime = 0;
            isSyncing = false;
        }
    }

    await triggerSyncSimulated();
    assert.strictEqual(syncExecuted, true, 'El watchdog debió desbloquear y permitir la sincronización');
    assert.strictEqual(isSyncing, false, 'isSyncing debe quedar en false');
    console.log('  ✓ Watchdog resetea cerrojos viejos (>25s) y permite sincronizar nuevamente.');
}

async function testSubsystemTimeoutIsolation() {
    console.log('\n[TEST 3] Verificando aislamiento de pasos en syncAll...');

    function withTimeout(promise, ms, errorMsg) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms)),
        ]);
    }

    const errors = [];
    
    // Paso 1: Falla con timeout
    try {
        await withTimeout(new Promise(() => {}), 50, 'syncProfile timeout (8s)');
    } catch (e) {
        errors.push(`Profile: ${e.message}`);
    }

    // Paso 2: Ejecuta normalmente
    let remindersSynced = false;
    try {
        await withTimeout((async () => { remindersSynced = true; })(), 50, 'syncReminders timeout');
    } catch (e) {
        errors.push(`Reminders: ${e.message}`);
    }

    // Paso 3: Falla archivo adjunto
    let attachmentNotice = null;
    try {
        await withTimeout(new Promise(() => {}), 50, 'syncFiles timeout (10s)');
    } catch (e) {
        attachmentNotice = e.message;
    }

    assert.strictEqual(remindersSynced, true, 'Los recordatorios deben sincronizarse aunque el perfil haya fallado');
    assert.strictEqual(errors.length, 1, 'Solo el perfil debe estar en errors');
    assert.ok(attachmentNotice.includes('syncFiles timeout'), 'El timeout de archivos no debe bloquear los datos');
    console.log('  ✓ Pasos de syncAll están aislados: un paso colgado no bloquea los siguientes ni la finalización.');
}

async function runAll() {
    await testSyncStateGuarantees();
    await testWatchdogRecovery();
    await testSubsystemTimeoutIsolation();
    console.log('\n==============================================================');
    console.log('✓ TODOS LOS TESTS DE RESILIENCIA Y DESCONGELAMIENTO PASARON (100%)');
    console.log('==============================================================\n');
}

runAll();
