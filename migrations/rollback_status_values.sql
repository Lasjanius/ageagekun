-- ========================================================
-- RPA Queue ステータス拡張 - ロールバックスクリプト
-- ========================================================
-- 実行日時: [実行時に記載]
-- 実行者: [実行者名]
--
-- 概要:
-- 新しいステータス値を元に戻すロールバックスクリプト
-- 緊急時のみ使用
-- ========================================================

\echo '=========================================='
\echo '⚠️ ロールバック処理を開始します'
\echo '=========================================='
\echo '現在のステータス分布:'
SELECT status, COUNT(*) as count
FROM rpa_queue
GROUP BY status
ORDER BY status;

\echo '=========================================='
\echo 'ロールバック処理開始'
\echo '=========================================='

BEGIN;

-- ========================================================
-- 1. ステータスを元に戻す
-- ========================================================
\echo '1. ステータスを元に戻しています...'

-- uploaded, ready_to_print を done に戻す
UPDATE rpa_queue
SET
    status = 'done',
    updated_at = CURRENT_TIMESTAMP
WHERE status IN ('uploaded', 'ready_to_print');

\echo 'ロールバック対象レコード数:'
SELECT ROW_COUNT() as rollback_records;

-- ========================================================
-- 2. トリガーを元に戻す
-- ========================================================
\echo '2. トリガーを元に戻しています...'

-- 新しいトリガーを削除
DROP TRIGGER IF EXISTS auto_update_document_on_uploaded ON rpa_queue;
DROP FUNCTION IF EXISTS auto_update_document_on_uploaded() CASCADE;

-- 元のトリガー関数を再作成
CREATE OR REPLACE FUNCTION auto_update_document_on_done()
RETURNS trigger AS $$
DECLARE
    old_path TEXT;
    new_path TEXT;
BEGIN
    -- doneステータス時にファイル移動とDocuments更新（元の動作）
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

    -- status変更時の一般的な通知
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

-- 元のトリガーを再作成
CREATE TRIGGER auto_update_document
AFTER UPDATE ON rpa_queue
FOR EACH ROW EXECUTE FUNCTION auto_update_document_on_done();

\echo 'トリガーの復元完了'

-- ========================================================
-- 3. CHECK制約を元に戻す
-- ========================================================
\echo '3. CHECK制約を元に戻しています...'

ALTER TABLE rpa_queue
DROP CONSTRAINT IF EXISTS rpa_queue_status_check;

ALTER TABLE rpa_queue
ADD CONSTRAINT rpa_queue_status_check
CHECK (status IN ('pending', 'processing', 'done', 'failed', 'canceled'));

\echo 'CHECK制約の復元完了'

-- ========================================================
-- 4. 完了検知トリガーを元に戻す
-- ========================================================
\echo '4. 完了検知トリガーを元に戻しています...'

CREATE OR REPLACE FUNCTION check_all_tasks_complete()
RETURNS trigger AS $$
DECLARE
    pending_count INTEGER;
    processing_count INTEGER;
BEGIN
    -- pending/processingタスクの数を確認（元の動作）
    SELECT COUNT(*) INTO pending_count FROM rpa_queue WHERE status = 'pending';
    SELECT COUNT(*) INTO processing_count FROM rpa_queue WHERE status = 'processing';

    -- 全タスクが完了した場合
    IF pending_count = 0 AND processing_count = 0 AND (NEW.status = 'done' OR NEW.status = 'failed') THEN
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

\echo '完了検知トリガーの復元完了'

-- ========================================================
-- 5. ロールバック後の状態確認
-- ========================================================
\echo '=========================================='
\echo 'ロールバック後のステータス分布確認'
\echo '=========================================='
SELECT status, COUNT(*) as count
FROM rpa_queue
GROUP BY status
ORDER BY status;

\echo '=========================================='
\echo 'トリガー一覧'
\echo '=========================================='
SELECT
    trigger_name,
    event_manipulation,
    event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND event_object_table = 'rpa_queue';

\echo '=========================================='
\echo 'CHECK制約の確認'
\echo '=========================================='
SELECT
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'rpa_queue'::regclass
AND contype = 'c';

-- ========================================================
-- コミット確認
-- ========================================================
\echo '=========================================='
\echo 'ロールバック処理完了'
\echo '=========================================='
\echo 'トランザクションをコミットしてよろしいですか？'
\echo '問題がある場合は、Ctrl+C で中断し、ROLLBACK; を実行してください'
\echo '=========================================='

-- トランザクションのコミット
COMMIT;

\echo '=========================================='
\echo '✅ ロールバックが正常に完了しました'
\echo '=========================================='