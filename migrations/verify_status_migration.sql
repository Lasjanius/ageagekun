-- ========================================================
-- ステータス移行検証クエリ集
-- ========================================================
-- 実行方法:
-- psql -U postgres -d ageagekun -w -f verify_status_migration.sql
-- ========================================================

\echo '=========================================='
\echo '1. CHECK制約の確認'
\echo '=========================================='
SELECT
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'rpa_queue'::regclass
AND contype = 'c'
AND conname = 'rpa_queue_status_check';

\echo ''
\echo '=========================================='
\echo '2. トリガー一覧'
\echo '=========================================='
SELECT
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND event_object_table = 'rpa_queue'
ORDER BY trigger_name;

\echo ''
\echo '=========================================='
\echo '3. 現在のステータス分布'
\echo '=========================================='
SELECT
    status,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM rpa_queue
GROUP BY status
ORDER BY
    CASE status
        WHEN 'pending' THEN 1
        WHEN 'processing' THEN 2
        WHEN 'uploaded' THEN 3
        WHEN 'ready_to_print' THEN 4
        WHEN 'done' THEN 5
        WHEN 'failed' THEN 6
        WHEN 'canceled' THEN 7
        ELSE 8
    END;

\echo ''
\echo '=========================================='
\echo '4. アクティブなキューアイテム'
\echo '=========================================='
SELECT
    id,
    file_id,
    patient_id,
    status,
    created_at,
    updated_at
FROM rpa_queue
WHERE status IN ('pending', 'processing', 'uploaded', 'ready_to_print')
ORDER BY created_at DESC
LIMIT 10;

\echo ''
\echo '=========================================='
\echo '5. Documents同期状態チェック'
\echo '=========================================='
SELECT
    q.status as queue_status,
    d.isUploaded as doc_uploaded,
    COUNT(*) as count
FROM rpa_queue q
LEFT JOIN Documents d ON q.file_id = d.fileID
GROUP BY q.status, d.isUploaded
ORDER BY q.status, d.isUploaded;

\echo ''
\echo '=========================================='
\echo '6. 最近更新されたアイテム（過去24時間）'
\echo '=========================================='
SELECT
    id,
    file_id,
    status,
    updated_at,
    EXTRACT(EPOCH FROM (NOW() - updated_at))/60 as minutes_ago
FROM rpa_queue
WHERE updated_at > NOW() - INTERVAL '24 hours'
ORDER BY updated_at DESC
LIMIT 10;

\echo ''
\echo '=========================================='
\echo '7. エラーチェック'
\echo '=========================================='
-- doneステータスが残っているか確認
SELECT
    CASE
        WHEN COUNT(*) = 0 THEN '✅ 旧doneステータスなし（正常）'
        ELSE '⚠️ 旧doneステータスが ' || COUNT(*) || ' 件残っています'
    END as status_check
FROM rpa_queue
WHERE status = 'done'
AND updated_at < (SELECT MAX(updated_at) FROM rpa_queue WHERE status = 'uploaded');

-- uploadedフォルダのパスが正しく更新されているか
SELECT
    CASE
        WHEN COUNT(*) = 0 THEN '✅ パス更新正常'
        ELSE '⚠️ uploadedなのにパス未更新: ' || COUNT(*) || ' 件'
    END as path_check
FROM rpa_queue q
JOIN Documents d ON q.file_id = d.fileID
WHERE q.status = 'uploaded'
AND d.pass NOT LIKE '%\uploaded\%';

\echo ''
\echo '=========================================='
\echo '検証完了'
\echo '==========================================='