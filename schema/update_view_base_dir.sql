-- rpa_queue_for_padビューを更新してbase_dirカラムを含める

DROP VIEW IF EXISTS rpa_queue_for_pad;

CREATE VIEW rpa_queue_for_pad AS
SELECT 
    q.id as queue_id,
    q.file_id,
    q.patient_id,
    q.status,
    q.error_message,
    -- payloadから必要な情報を展開
    q.payload->>'file_name' as file_name,
    q.payload->>'category' as category,
    q.payload->>'pass' as pass,
    q.payload->>'base_dir' as base_dir,  -- 新規追加
    q.payload->>'patient_name' as patient_name,
    q.created_at,
    q.updated_at
FROM rpa_queue q
ORDER BY q.created_at;

-- ビューにコメントを追加
COMMENT ON VIEW rpa_queue_for_pad IS 'PAD用ビュー: SELECT * FROM rpa_queue_for_pad WHERE status = ''pending'' LIMIT 1';

-- 確認用クエリ
-- SELECT * FROM rpa_queue_for_pad LIMIT 1;