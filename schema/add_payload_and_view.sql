-- rpa_queueテーブルにpayloadカラムを追加
ALTER TABLE rpa_queue ADD COLUMN IF NOT EXISTS payload JSONB;

-- PAD用ビューを作成（JSON解析不要でアクセス可能）
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
    q.payload->>'patient_name' as patient_name,
    q.created_at,
    q.updated_at
FROM rpa_queue q
ORDER BY q.created_at;

-- 確認用：ビューの構造を表示
-- \d rpa_queue_for_pad

-- PADが実行するサンプルクエリ
COMMENT ON VIEW rpa_queue_for_pad IS 'PAD用ビュー: SELECT * FROM rpa_queue_for_pad WHERE status = ''pending'' LIMIT 1';