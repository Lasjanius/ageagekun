-- rpa_queueテーブルの作成（まだ存在しない場合）
CREATE TABLE IF NOT EXISTS rpa_queue (
    id SERIAL PRIMARY KEY,
    file_id INTEGER REFERENCES Documents(fileID) ON DELETE CASCADE,
    patient_id INTEGER REFERENCES patients(patientID) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'uploaded', 'ready_to_print', 'merging', 'done', 'failed', 'canceled')),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_rpa_queue_status ON rpa_queue(status);
CREATE INDEX IF NOT EXISTS idx_rpa_queue_file_id ON rpa_queue(file_id);

-- Documents自動更新とファイル移動通知トリガー
CREATE OR REPLACE FUNCTION auto_update_document_on_done()
RETURNS trigger AS $$
DECLARE
    old_path TEXT;
    new_path TEXT;
BEGIN
    -- ready_to_print状態への遷移時の処理
    IF NEW.status = 'ready_to_print' AND OLD.status = 'uploaded' THEN
        -- 現在のパスを取得
        SELECT pass INTO old_path FROM Documents WHERE fileID = NEW.file_id;

        -- パスが存在し、まだuploadedフォルダに入っていない場合のみ処理
        IF old_path IS NOT NULL AND old_path NOT LIKE '%\uploaded\%' THEN
            -- 新しいパスを計算（uploadedサブディレクトリを追加）
            new_path := regexp_replace(
                old_path,
                '(C:\\Users\\hyosh\\Desktop\\allright\\ageagekun\\patients\\[0-9]+)\\(.+)$',
                E'\\1\\\\uploaded\\\\\\2'
            );

            -- Documentsテーブルを更新
            UPDATE Documents
            SET
                isUploaded = TRUE,
                uploaded_at = CURRENT_TIMESTAMP,
                pass = new_path
            WHERE fileID = NEW.file_id;

            -- Node.jsにファイル移動を通知
            PERFORM pg_notify('file_movement_required',
                json_build_object(
                    'file_id', NEW.file_id,
                    'old_path', old_path,
                    'new_path', new_path
                )::text
            );
        END IF;
    END IF;

    -- done状態への遷移時（レガシー処理も維持）
    IF NEW.status = 'done' AND OLD.status != 'done' THEN
        -- 現在のパスを取得
        SELECT pass INTO old_path FROM Documents WHERE fileID = NEW.file_id;

        -- パスが存在し、まだuploadedフォルダに入っていない場合のみ処理
        IF old_path IS NOT NULL AND old_path NOT LIKE '%\uploaded\%' THEN
            -- 新しいパスを計算（uploadedサブディレクトリを追加）
            new_path := regexp_replace(
                old_path,
                '(C:\\Users\\hyosh\\Desktop\\allright\\ageagekun\\patients\\[0-9]+)\\(.+)$',
                E'\\1\\\\uploaded\\\\\\2'
            );

            -- Documentsテーブルを更新
            UPDATE Documents
            SET
                isUploaded = TRUE,
                uploaded_at = CURRENT_TIMESTAMP,
                pass = new_path
            WHERE fileID = NEW.file_id;

            -- Node.jsにファイル移動を通知
            PERFORM pg_notify('file_movement_required',
                json_build_object(
                    'file_id', NEW.file_id,
                    'old_path', old_path,
                    'new_path', new_path
                )::text
            );
        END IF;
    END IF;
    
    -- status変更時の一般的な通知（全体の進捗管理用）
    PERFORM pg_notify('rpa_queue_status_changed', 
        json_build_object(
            'queue_id', NEW.id,
            'file_id', NEW.file_id,
            'status', NEW.status,
            'old_status', OLD.status
        )::text
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーの削除（既存の場合）と作成
DROP TRIGGER IF EXISTS auto_update_document ON rpa_queue;
CREATE TRIGGER auto_update_document
AFTER UPDATE ON rpa_queue
FOR EACH ROW EXECUTE FUNCTION auto_update_document_on_done();

-- エラー処理用：status='failed'時の処理
CREATE OR REPLACE FUNCTION handle_upload_failure() 
RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'failed' AND OLD.status != 'failed' THEN
        -- エラー通知を送信
        PERFORM pg_notify('upload_failed', 
            json_build_object(
                'queue_id', NEW.id,
                'file_id', NEW.file_id,
                'error_message', NEW.error_message
            )::text
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS handle_upload_error ON rpa_queue;
CREATE TRIGGER handle_upload_error
AFTER UPDATE ON rpa_queue
FOR EACH ROW EXECUTE FUNCTION handle_upload_failure();

-- 全タスク完了検知用の関数
CREATE OR REPLACE FUNCTION check_all_tasks_complete()
RETURNS trigger AS $$
DECLARE
    pending_count INTEGER;
    processing_count INTEGER;
    uploaded_count INTEGER;
    ready_count INTEGER;
    merging_count INTEGER;
BEGIN
    -- 処理中のタスクの数を確認
    SELECT COUNT(*) INTO pending_count FROM rpa_queue WHERE status = 'pending';
    SELECT COUNT(*) INTO processing_count FROM rpa_queue WHERE status = 'processing';
    SELECT COUNT(*) INTO uploaded_count FROM rpa_queue WHERE status = 'uploaded';
    SELECT COUNT(*) INTO ready_count FROM rpa_queue WHERE status = 'ready_to_print';
    SELECT COUNT(*) INTO merging_count FROM rpa_queue WHERE status = 'merging';

    -- 全タスクが完了した場合（done、failed、canceledのみ）
    IF pending_count = 0 AND processing_count = 0 AND uploaded_count = 0 AND ready_count = 0 AND merging_count = 0
        AND (NEW.status = 'done' OR NEW.status = 'failed' OR NEW.status = 'canceled') THEN
        PERFORM pg_notify('all_tasks_complete',
            json_build_object(
                'completed_at', CURRENT_TIMESTAMP,
                'last_task_id', NEW.id
            )::text
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_completion ON rpa_queue;
CREATE TRIGGER check_completion
AFTER UPDATE ON rpa_queue
FOR EACH ROW EXECUTE FUNCTION check_all_tasks_complete();

-- 確認用：トリガー一覧を表示
-- SELECT trigger_name, event_manipulation, event_object_table, action_statement 
-- FROM information_schema.triggers 
-- WHERE trigger_schema = 'public';