-- ==============================================================================
-- VEYRA - PREFLIGHT CHECK (SOLO LECTURA) ANTES DE DESPLEGAR PERSISTENCIA YJS
-- ==============================================================================
-- Este script es ESTRICTAMENTE DE SOLO LECTURA.
-- Ejecútalo en el SQL Editor de Supabase para verificar si el entorno de producción
-- cumple con todos los prerrequisitos sin modificar ningún dato ni objeto.
-- ==============================================================================

-- 1. Verificación de Tablas y Columnas Base Requeridas
SELECT 
    '1. Tablas Base' AS categoria,
    t.table_name AS elemento,
    CASE 
        WHEN t.table_name IS NOT NULL THEN 'PRESENTE (OK)'
        ELSE 'FALTANTE (ERROR CRÍTICO)'
    END AS estado,
    COALESCE(string_agg(c.column_name, ', ' ORDER BY c.ordinal_position), 'Sin columnas') AS columnas_detectadas
FROM (
    VALUES ('notes'), ('collaborations'), ('folders')
) AS expected(table_name)
LEFT JOIN information_schema.tables t 
    ON t.table_schema = 'public' AND t.table_name = expected.table_name
LEFT JOIN information_schema.columns c 
    ON c.table_schema = 'public' AND c.table_name = t.table_name
GROUP BY t.table_name, expected.table_name;

-- 2. Verificación de Tipos de Datos en public.notes y public.collaborations
SELECT 
    '2. Columnas Clave' AS categoria,
    table_name || '.' || column_name AS elemento,
    data_type AS tipo_detectado,
    CASE 
        WHEN table_name = 'notes' AND column_name = 'id' AND data_type = 'text' THEN 'COMPATIBLE (OK)'
        WHEN table_name = 'notes' AND column_name = 'user_id' AND data_type = 'uuid' THEN 'COMPATIBLE (OK)'
        WHEN table_name = 'notes' AND column_name = 'folder_id' AND data_type = 'text' THEN 'COMPATIBLE (OK)'
        WHEN table_name = 'collaborations' AND column_name IN ('target_type', 'target_id', 'role') AND data_type = 'text' THEN 'COMPATIBLE (OK)'
        WHEN table_name = 'collaborations' AND column_name IN ('owner_id', 'member_id') AND data_type = 'uuid' THEN 'COMPATIBLE (OK)'
        ELSE 'REVISAR (Discrepancia de tipo)'
    END AS evaluacion
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND (
      (table_name = 'notes' AND column_name IN ('id', 'user_id', 'folder_id'))
      OR
      (table_name = 'collaborations' AND column_name IN ('target_type', 'target_id', 'owner_id', 'member_id', 'role'))
  )
ORDER BY table_name, column_name;

-- 3. Verificación de Disponibilidad de Criptografía SHA-256 en PostgreSQL
SELECT 
    '3. Motor Criptográfico' AS categoria,
    'sha256(decode(base64))' AS elemento,
    CASE 
        WHEN lower(encode(sha256(decode('dGVzdA==', 'base64')), 'hex')) = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
        THEN 'DISPONIBLE Y CANÓNICO (OK: 9f86d081...)'
        ELSE 'ERROR EN SHA256 O BASE64'
    END AS estado;

-- 4. Inspección de Políticas RLS Actuales en realtime.messages (AUDITORÍA CRÍTICA)
-- NOTA: En PostgreSQL, las políticas PERMISSIVE se combinan con OR.
-- Si existe una política como "Allow all", añadir una política de Yjs NO protegerá el canal.
SELECT 
    '4. Auditoría Realtime' AS categoria,
    p.policyname AS politica_existente,
    p.cmd AS comando,
    p.roles::text AS roles_afectados,
    p.qual AS condicion_using,
    p.with_check AS condicion_check,
    CASE 
        WHEN p.qual IS NULL AND p.with_check IS NULL THEN 'ALERTA: Política universal permisiva'
        WHEN p.qual LIKE '%topic%' OR p.with_check LIKE '%topic%' THEN 'Acotada por tópico'
        ELSE 'ALERTA: Posible fuga de mensajes Yjs por combinación OR'
    END AS diagnostico_seguridad
FROM pg_policies p
WHERE p.schemaname = 'realtime' AND p.tablename = 'messages';

-- 5. Estado Preexistente de Objetos de la PoC Yjs
SELECT 
    '5. Estado Objetos Yjs' AS categoria,
    coalesce(t.table_name, f.routine_name) AS objeto,
    coalesce(t.table_type, f.routine_type) AS tipo,
    'YA EXISTE EN EL ESQUEMA' AS estado
FROM (
    SELECT table_name, 'TABLE' as table_type 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name IN ('note_yjs_snapshots', 'note_yjs_updates')
) t
FULL OUTER JOIN (
    SELECT routine_name, 'FUNCTION' as routine_type 
    FROM information_schema.routines 
    WHERE routine_schema = 'public' 
      AND routine_name IN ('is_note_editor', 'is_note_reader', 'append_note_yjs_update', 'compact_note_yjs_snapshot')
) f ON false;
