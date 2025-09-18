-- Queueテーブル（RPA連携用）の作成
CREATE TABLE IF NOT EXISTS rpa_queue (
    id SERIAL PRIMARY KEY,
    task_type VARCHAR(50) NOT NULL DEFAULT 'upload_pdf',
    file_id INTEGER REFERENCES Documents(fileID) ON DELETE CASCADE,
    payload JSONB,  -- カテゴリ、患者情報など追加データ
    status VARCHAR(20) DEFAULT 'pending',  -- pending, processing, done, failed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0
);

-- インデックス作成（パフォーマンス向上）
CREATE INDEX idx_rpa_queue_status ON rpa_queue(status);
CREATE INDEX idx_rpa_queue_file_id ON rpa_queue(file_id);
CREATE INDEX idx_rpa_queue_created_at ON rpa_queue(created_at);

-- NOTIFY機能用のトリガー関数
CREATE OR REPLACE FUNCTION notify_rpa_queue() 
RETURNS TRIGGER 
LANGUAGE plpgsql 
AS $$
BEGIN
    -- ステータスがdoneまたはfailedに変更された時に通知
    IF NEW.status IN ('done', 'failed') THEN
        PERFORM pg_notify(
            'rpa_queue_events',
            json_build_object(
                'id', NEW.id,
                'file_id', NEW.file_id,
                'status', NEW.status,
                'error', NEW.error_message
            )::text
        );
        
        -- doneの場合、Documentsテーブルも更新
        IF NEW.status = 'done' THEN
            UPDATE Documents 
            SET isUploaded = TRUE, 
                uploaded_at = NOW() 
            WHERE fileID = NEW.file_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- トリガーの作成
DROP TRIGGER IF EXISTS trg_rpa_queue_notify ON rpa_queue;
CREATE TRIGGER trg_rpa_queue_notify
AFTER UPDATE OF status ON rpa_queue
FOR EACH ROW 
EXECUTE FUNCTION notify_rpa_queue();

-- ヘルパー関数：アップロードタスクを追加
CREATE OR REPLACE FUNCTION create_upload_task(
    p_file_id INTEGER,
    p_patient_id INTEGER,
    p_patient_name VARCHAR,
    p_category VARCHAR,
    p_filename VARCHAR,
    p_pass VARCHAR
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_queue_id INTEGER;
BEGIN
    INSERT INTO rpa_queue (task_type, file_id, payload)
    VALUES (
        'upload_pdf', 
        p_file_id,
        jsonb_build_object(
            'patient_id', p_patient_id,
            'patient_name', p_patient_name,
            'category', p_category,
            'filename', p_filename,
            'pass', p_pass
        )
    )
    RETURNING id INTO v_queue_id;
    
    RETURN v_queue_id;
END;
$$;

-- ビュー：未アップロードファイル一覧
CREATE OR REPLACE VIEW v_pending_uploads AS
SELECT 
    d.fileID,
    d.fileName,
    d.Category,
    d.pass,
    p.patientID,
    p.patientName
FROM Documents d
JOIN patients p ON d.patientID = p.patientID
WHERE d.isUploaded = FALSE
ORDER BY d.created_at;