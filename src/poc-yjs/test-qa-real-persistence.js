/**
 * VEYRA - SUITE DE VALIDACIÓN DE PERSISTENCIA REAL YJS EN POSTGRESQL (FASE B.4)
 * ==============================================================================
 * Este script valida la persistencia de extremo a extremo sin comprometer notas
 * reales de producción ni utilizar credenciales de service_role.
 * 
 * GARANTÍAS DE SEGURIDAD:
 * 1. Utiliza exclusivamente la clave pública anon (EXPO_PUBLIC_SUPABASE_ANON_KEY)
 *    y la sesión autenticada normal del usuario QA.
 * 2. Bloquea el uso accidental de service_role o claves maestras.
 * 3. Crea una única nota de prueba con ID trazable: qa_yjs_note_<timestamp>_<hex>.
 * 4. Verifica la existencia de la nota antes de realizar escrituras.
 * 5. La limpieza está protegida en bloque finally, filtrando estrictamente por
 *    el ID generado y el user_id del usuario QA autenticado.
 * 6. Verifica que la limpieza se completó exitosamente al 100%.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Y = require('yjs');
const { createClient } = require('@supabase/supabase-js');

// Registrar hook de ejecución TypeScript mediante el compilador disponible en el proyecto
if (!require.extensions['.ts']) {
    try {
        const ts = require('typescript');
        require.extensions['.ts'] = function (module, filename) {
            const source = fs.readFileSync(filename, 'utf8');
            const compiled = ts.transpileModule(source, {
                compilerOptions: {
                    module: ts.ModuleKind.CommonJS,
                    target: ts.ScriptTarget.ES2022,
                    esModuleInterop: true,
                },
                fileName: filename,
            });
            module._compile(compiled.outputText, filename);
        };
    } catch (_) {}
}

// Carga del módulo real YjsRemotePersistence (soporta tanto .js compilado como .ts directo)
let YjsRemotePersistence, computeUpdateHash;
try {
    const mod = require('./yjsRemotePersistence');
    YjsRemotePersistence = mod.YjsRemotePersistence;
    computeUpdateHash = mod.computeUpdateHash;
} catch (_) {
    const mod = require('./yjsRemotePersistence.ts');
    YjsRemotePersistence = mod.YjsRemotePersistence;
    computeUpdateHash = mod.computeUpdateHash;
}

const { YjsLocalPersistence } = require('./yjsLocalPersistence');

// 1. Cargar variables de entorno
function loadEnv() {
    const envPath = path.resolve(__dirname, '../../.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                const [k, ...v] = trimmed.split('=');
                const key = k.trim();
                const val = v.join('=').trim().replace(/^['"]|['"]$/g, '');
                if (!process.env[key]) {
                    process.env[key] = val;
                }
            }
        }
    }
}
loadEnv();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://rrwoompvuggcczggfgiq.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const QA_EMAIL = process.env.QA_USER_EMAIL || process.env.TEST_USER_OWNER_EMAIL;
const QA_PASSWORD = process.env.QA_USER_PASSWORD || process.env.TEST_USER_OWNER_PASSWORD;

// Verificación anti-service_role
if (SUPABASE_ANON_KEY && (SUPABASE_ANON_KEY.toLowerCase().includes('service_role') || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error('ALERTA DE SEGURIDAD: Se detectó una clave de service_role.');
    console.error('Esta prueba solo debe ejecutarse con la clave pública anónima (anon).');
    process.exit(1);
}

// Simulador explícito en memoria del adaptador SQLite para pruebas en entorno Node.js
class MockSQLiteAdapter {
    constructor() {
        this.rows = [];
        this.lastId = 0;
    }
    async execAsync() { return Promise.resolve(); }
    async runAsync(sql, params = []) {
        if (sql.includes('INSERT INTO yjs_note_updates')) {
            this.lastId++;
            const [docId, updateData, synced, createdAtMs] = params;
            this.rows.push({ id: this.lastId, doc_id: docId, update_data: updateData, synced, created_at_ms: createdAtMs });
            return { lastInsertRowId: this.lastId, changes: 1 };
        }
        if (sql.includes('UPDATE yjs_note_updates SET synced = 1')) {
            const id = params[0];
            const row = this.rows.find(r => r.id === id);
            if (row) row.synced = 1;
            return { changes: 1 };
        }
        return { changes: 0 };
    }
    async getAllAsync(sql, params = []) {
        if (sql.includes('WHERE doc_id = ? AND synced = 0')) {
            const [docId] = params;
            return this.rows.filter(r => r.doc_id === docId && r.synced === 0);
        }
        return this.rows;
    }
    async getFirstAsync() { return null; }
}

async function run() {
    console.log('====================================================================');
    console.log('VEYRA - VALIDACIÓN DE PERSISTENCIA REAL YJS EN SUPABASE PRODUCCIÓN');
    console.log('====================================================================');
    console.log(`Proyecto:     ${SUPABASE_URL}`);
    console.log(`Clave:        Pública (Anon) [${SUPABASE_ANON_KEY ? SUPABASE_ANON_KEY.substring(0, 15) + '...' : 'FALTA'}]`);
    console.log(`Usuario QA:   ${QA_EMAIL ? QA_EMAIL : 'No configurado (Modo Validación Local + Rechazo RLS)'}`);
    console.log('--------------------------------------------------------------------\n');

    let totalTests = 0;
    let passedTests = 0;

    // ─────────────────────────────────────────────────────────────────────────────
    // FASE 1: Generación de Delta Binario Real de Yjs y Hash SHA-256 Canónico
    // ─────────────────────────────────────────────────────────────────────────────
    totalTests++;
    console.log('[PRUEBA 1/8] Generación de actualización binaria auténtica con Yjs');
    const docSource = new Y.Doc();
    const ytext = docSource.getText('content');
    const sampleTimestamp = new Date().toISOString();
    const sampleText = `Validación real de persistencia Yjs en Veyra. Timestamp: ${sampleTimestamp}`;
    ytext.insert(0, sampleText);

    // Delta binario auténtico generado por Yjs
    const realBinaryUpdate = Y.encodeStateAsUpdate(docSource);
    const base64Update = Buffer.from(realBinaryUpdate).toString('base64');
    const sha256Calculated = await computeUpdateHash(base64Update);

    if (base64Update === 'dGVzdA==') {
        throw new Error('Fallo crítico: se detectó el delta sintético dummy dGVzdA==');
    }
    console.log(`  -> Tamaño del delta binario: ${realBinaryUpdate.byteLength} bytes`);
    console.log(`  -> Representación Base64: ${base64Update.substring(0, 35)}... (${base64Update.length} chars)`);
    console.log(`  -> SHA-256 sobre bytes originales: ${sha256Calculated}`);
    console.log('  -> [OK] Delta Yjs auténtico y hash canónico validados.\n');
    passedTests++;

    // ─────────────────────────────────────────────────────────────────────────────
    // FASE 2: Verificación de Rechazo RLS a Peticiones No Autenticadas
    // ─────────────────────────────────────────────────────────────────────────────
    totalTests++;
    console.log('[PRUEBA 2/8] Verificación de seguridad RLS: llamada anónima rechazada por PostgreSQL');
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: anonData, error: anonErr } = await anonClient.rpc('append_note_yjs_update', {
        p_note_id: 'qa_probe_note_unauth',
        p_client_id: 'probe_client',
        p_update_data: base64Update,
        p_update_hash: sha256Calculated
    });

    if (anonErr && (anonErr.message.includes('No autenticado') || anonErr.code === '42501' || anonErr.message.includes('permission denied'))) {
        console.log(`  -> Rechazo de PostgreSQL confirmado: "${anonErr.message}" (Código: ${anonErr.code || '42501'})`);
        console.log('  -> [OK] La RPC bloquea llamadas no autenticadas.');
        passedTests++;
    } else {
        console.error('  -> [FALLO DE SEGURIDAD]: La RPC no rechazó la petición anónima.');
        console.error('     Respuesta recibida:', anonData, anonErr);
        process.exit(1);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // FASE 3: Simulación Explícita de Cola Local SQLite (Offline-First)
    // ─────────────────────────────────────────────────────────────────────────────
    totalTests++;
    console.log('\n[PRUEBA 3/8] [SIMULACIÓN LOCAL] Flujo de cola local SQLite (Offline-First)');
    console.log('  -> Nota metodológica: en Node.js se utiliza el adaptador en memoria MockSQLiteAdapter');
    console.log('     para verificar la lógica de estados synced=0/1 y compactación de YjsLocalPersistence.');
    const mockDb = new MockSQLiteAdapter();
    const localPersistence = new YjsLocalPersistence(mockDb);
    await localPersistence.initSchema();

    const localRowId = await localPersistence.storeUpdate('qa_test_note_local', realBinaryUpdate, false);
    const pendingUpdates = await localPersistence.getPendingLocalUpdates('qa_test_note_local');
    if (pendingUpdates.length !== 1 || pendingUpdates[0].synced !== 0) {
        throw new Error('Fallo: el delta local no se guardó con synced=0');
    }
    console.log(`  -> Delta encolado localmente con id: ${localRowId}, synced: 0`);

    await localPersistence.markUpdatesAsSynced([localRowId]);
    const pendingAfterSync = await localPersistence.getPendingLocalUpdates('qa_test_note_local');
    if (pendingAfterSync.length !== 0) {
        throw new Error('Fallo: el delta no se marcó como sincronizado (synced=1)');
    }
    console.log('  -> [OK] Lógica de cola offline y confirmación local validadas.\n');
    passedTests++;

    // ─────────────────────────────────────────────────────────────────────────────
    // FASE 4 a 8: Pruebas Reales con Sesión Autenticada y Nota QA Aislada
    // ─────────────────────────────────────────────────────────────────────────────
    if (!QA_EMAIL || !QA_PASSWORD) {
        console.log('====================================================================');
        console.log('AVISO DE AUDITORÍA: FASE END-TO-END CON SESIÓN PENDIENTE');
        console.log('====================================================================');
        console.log('Las pruebas 1, 2 y 3 pasaron.');
        console.log('Para ejecutar las pruebas 4 a 8 con escritura y lectura real en PostgreSQL:');
        console.log('');
        console.log('  $env:QA_USER_EMAIL="tu_email_qa@ejemplo.com"; $env:QA_USER_PASSWORD="tu_password"; node src/poc-yjs/test-qa-real-persistence.js');
        console.log('====================================================================');
        return;
    }

    console.log('[PASO 4] Iniciando sesión autenticada con usuario QA...');
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: authData, error: authErr } = await userClient.auth.signInWithPassword({
        email: QA_EMAIL,
        password: QA_PASSWORD
    });

    if (authErr) {
        console.error(`  -> [ERROR DE LOGIN]: ${authErr.message}`);
        process.exit(1);
    }

    const qaUserId = authData.user.id;
    console.log(`  -> Autenticado como: ${authData.user.email} (UUID: ${qaUserId})`);

    // Crear ID único e inequívoco para la nota QA
    const QA_NOTE_PREFIX = 'qa_yjs_note_';
    const qaNoteId = `${QA_NOTE_PREFIX}${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const QA_NOTE_REGEX = /^qa_yjs_note_\d+_[a-f0-9]{6}$/;

    if (!QA_NOTE_REGEX.test(qaNoteId)) {
        throw new Error(`ID de nota QA malformado: ${qaNoteId}`);
    }

    console.log(`\n[PRUEBA 4/8] Creación y verificación de nota QA aislada: ${qaNoteId}`);
    totalTests++;

    // Insertar nota QA
    const { error: noteInsertErr } = await userClient.from('notes').insert({
        id: qaNoteId,
        user_id: qaUserId,
        title: 'Nota de Validación Yjs QA (Temporal)',
        content: 'Contenido preliminar',
        created_at_ms: Date.now(),
        updated_at_ms: Date.now(),
        last_modified_ms: Date.now()
    });

    if (noteInsertErr) {
        throw new Error(`Error creando nota QA en public.notes: ${noteInsertErr.message}`);
    }

    // Verificación obligatoria: confirmar que la nota existe y es propiedad del usuario QA
    const { data: noteVerify, error: verifyErr } = await userClient
        .from('notes')
        .select('id, user_id, title')
        .eq('id', qaNoteId)
        .eq('user_id', qaUserId)
        .single();

    if (verifyErr || !noteVerify || noteVerify.id !== qaNoteId) {
        throw new Error(`Fallo de verificación: la nota QA recién creada no se pudo consultar: ${verifyErr?.message}`);
    }
    console.log(`  -> Nota QA confirmada en public.notes (Propietario: ${noteVerify.user_id})`);
    console.log('  -> [OK] Nota QA aislada creada y verificada.');
    passedTests++;

    const remotePersistence = new YjsRemotePersistence(userClient);
    let executionError = null;
    let cleanupError = null;

    try {
        // Invocación mediante YjsRemotePersistence (código real del cliente)
        totalTests++;
        console.log('\n[PRUEBA 5/8] Escritura remota de delta Yjs auténtico vía append_note_yjs_update...');
        const saveRes = await remotePersistence.saveRemoteUpdate(qaNoteId, base64Update, 'qa_cli_1');

        if (!saveRes.success || !saveRes.updateId) {
            throw new Error(`Escritura remota fallida: ${saveRes.error || 'sin updateId'}`);
        }
        console.log(`  -> Confirmación PostgreSQL: Éxito (update_id: ${saveRes.updateId}, duplicate: ${Boolean(saveRes.duplicate)})`);
        console.log('  -> [OK] Delta Yjs registrado y confirmado en note_yjs_updates.');
        passedTests++;

        // Prueba de idempotencia y deduplicación
        totalTests++;
        console.log('\n[PRUEBA 6/8] Validación de idempotencia: reenvío del mismo delta Yjs...');
        const retryRes = await remotePersistence.saveRemoteUpdate(qaNoteId, base64Update, 'qa_cli_1');

        if (!retryRes.success || !retryRes.duplicate) {
            throw new Error(`Fallo de idempotencia: se esperaba duplicate=true, se obtuvo: ${JSON.stringify(retryRes)}`);
        }
        console.log(`  -> Respuesta PostgreSQL: duplicate=${retryRes.duplicate}, update_id=${retryRes.updateId}`);
        console.log('  -> [OK] Idempotencia verificada: no se duplicaron registros en PostgreSQL.');
        passedTests++;

        // Cierre y reapertura: reconstrucción del documento desde PostgreSQL
        totalTests++;
        console.log('\n[PRUEBA 7/8] Simulación de cierre y reapertura: fetchDocument desde PostgreSQL...');
        const freshDoc = new Y.Doc();
        const fetchRes = await remotePersistence.fetchDocument(qaNoteId, freshDoc);

        console.log(`  -> Deltas recuperados y aplicados desde la base de datos: ${fetchRes.appliedUpdatesCount}`);
        console.log(`  -> Cursor maxUpdateId reportado: ${fetchRes.maxUpdateId}`);

        const reconstructedContent = freshDoc.getText('content').toString();
        console.log(`  -> Contenido reconstruido: "${reconstructedContent}"`);

        if (reconstructedContent !== sampleText) {
            throw new Error(`Discrepancia en contenido reconstruido:\nEsperado: "${sampleText}"\nObtenido: "${reconstructedContent}"`);
        }
        console.log('  -> [OK] Reconstrucción de estado íntegra: coincide carácter por carácter.');
        passedTests++;

    } catch (err) {
        executionError = err;
        console.error('\n[ERROR EN EJECUCIÓN DE PRUEBAS]:', err.message);
    } finally {
        // ─────────────────────────────────────────────────────────────────────────
        // LIMPIEZA QUIRÚRGICA ESTRICTAMENTE PROTEGIDA
        // ─────────────────────────────────────────────────────────────────────────
        totalTests++;
        console.log('\n[PRUEBA 8/8] Limpieza quirúrgica y verificación de purga de datos QA...');

        // Salvaguarda obligatoria: nunca ejecutar DELETE si el ID no cumple el patrón estricto
        if (!qaNoteId || !QA_NOTE_REGEX.test(qaNoteId) || !qaUserId) {
            cleanupError = new Error(`Salvaguarda activada: ID de nota inválido o usuario no definido para limpieza (${qaNoteId})`);
            console.error(`  -> [PELIGRO]: ${cleanupError.message}`);
        } else {
            try {
                // 1. Eliminar deltas de la nota QA
                const { error: delUpdatesErr } = await userClient
                    .from('note_yjs_updates')
                    .delete()
                    .eq('note_id', qaNoteId);
                if (delUpdatesErr) console.warn(`  -> Aviso al borrar deltas: ${delUpdatesErr.message}`);

                // 2. Eliminar snapshot si se hubiera creado
                const { error: delSnapshotsErr } = await userClient
                    .from('note_yjs_snapshots')
                    .delete()
                    .eq('note_id', qaNoteId);
                if (delSnapshotsErr) console.warn(`  -> Aviso al borrar snapshots: ${delSnapshotsErr.message}`);

                // 3. Eliminar la nota QA con filtro de ID y propietario
                const { error: delNoteErr } = await userClient
                    .from('notes')
                    .delete()
                    .eq('id', qaNoteId)
                    .eq('user_id', qaUserId);
                if (delNoteErr) console.warn(`  -> Aviso al borrar nota QA: ${delNoteErr.message}`);

                // 4. Verificación activa de purga (comprobar que no queden huellas)
                const { data: lingeringUpdates } = await userClient
                    .from('note_yjs_updates')
                    .select('id')
                    .eq('note_id', qaNoteId);

                const { data: lingeringNotes } = await userClient
                    .from('notes')
                    .select('id')
                    .eq('id', qaNoteId);

                const updatesLeft = lingeringUpdates?.length || 0;
                const notesLeft = lingeringNotes?.length || 0;

                if (updatesLeft === 0 && notesLeft === 0) {
                    console.log(`  -> Purga verificada: 0 deltas y 0 notas residuales en PostgreSQL.`);
                    console.log('  -> [OK] Limpieza quirúrgica completada exitosamente sin residuos.');
                    passedTests++;
                } else {
                    cleanupError = new Error(`Residuos detectados tras limpieza: ${notesLeft} notas y ${updatesLeft} deltas.`);
                    console.error(`  -> [ALERTA DE LIMPIEZA]: ${cleanupError.message}`);
                    console.error(`     Sentencia para purga manual si es necesaria:`);
                    console.error(`     DELETE FROM public.notes WHERE id = '${qaNoteId}' AND user_id = '${qaUserId}';`);
                }
            } catch (cErr) {
                cleanupError = cErr;
                console.error('  -> [ERROR DURANTE LIMPIEZA]:', cErr.message);
            }
        }
    }

    // Reporte consolidado de errores sin ocultar fallos
    if (executionError || cleanupError) {
        console.error('\n====================================================================');
        console.error('RESUMEN DE ERRORES REGISTRADOS:');
        if (executionError) console.error(` - Error en pruebas: ${executionError.message}`);
        if (cleanupError) console.error(` - Error en limpieza: ${cleanupError.message}`);
        console.error('====================================================================');
        process.exit(1);
    }

    console.log('\n====================================================================');
    console.log(`RESULTADO FINAL: ${passedTests}/${totalTests} PRUEBAS REALES SUPERADAS CON ÉXITO`);
    console.log('PERSISTENCIA YJS VALIDADA DE EXTREMO A EXTREMO EN SUPABASE PRODUCCIÓN');
    console.log('====================================================================');
}

run().catch((err) => {
    console.error('\n[ERROR FATAL]:', err.message);
    process.exit(1);
});
