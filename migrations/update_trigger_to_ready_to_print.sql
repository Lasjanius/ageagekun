-- ========================================================
-- トリガー更新: ready_to_print時に動作するように変更
-- ========================================================
-- 概要:
-- - auto_update_document_on_uploadedをready_to_print時に動作するよう変更
-- - 完了検知トリガーもready_to_printを完了状態として認識
-- ========================================================

\echo '=========================================='
\echo 'トリガー更新開始'
\echo '=========================================='

BEGIN;

-- ========================================================
-- 1. ファイル移動・Documents更新トリガーの変更
-- ========================================================
\echo '1. auto_update_document_on_uploadedを更新中...'

DROP TRIGGER IF EXISTS auto_update_document_on_uploaded ON rpa_queue;
DROP FUNCTION IF EXISTS auto_update_document_on_uploaded() CASCADE;

-- ready_to_print時に動作する新しいトリガー関数
CREATE OR REPLACE FUNCTION auto_update_document_on_ready_to_print()
RETURNS trigger AS $$
DECLARE
    old_path TEXT;
    new_path TEXT;
    base_dir_path TEXT;
BEGIN
    -- ready_to_printステータス時にファイル移動とDocuments更新
    IF NEW.status = 'ready_to_print' AND OLD.status = 'processing' THEN
        -- 現在のパスを取得
        SELECT pass, base_dir INTO old_path, base_dir_path FROM Documents WHERE fileID = NEW.file_id;

        -- パスが存在し、まだuploadedフォルダに入っていない場合のみ処理
        IF old_path IS NOT NULL AND old_path NOT LIKE '%\uploaded\%' THEN
            -- 新しいパスを計算（uploadedサブディレクトリを追加）
            new_path := regexp_replace(
                old_path,
                '(C:\\Users\\hyosh\\Desktop\\allright\\ageagekun\\patients\\[0-9]+)\\(.+)$',
                E'\\1\\\\uploaded\\\\\\2'
            );

            -- base_dirも更新
            IF base_dir_path IS NOT NULL AND base_dir_path NOT LIKE '%\uploaded%' THEN
                base_dir_path := base_dir_path || '\uploaded';
            END IF;

            -- Documentsテーブルを更新
            UPDATE Documents
            SET
                isUploaded = TRUE,
                uploaded_at = CURRENT_TIMESTAMP,
                pass = new_path,
                base_dir = base_dir_path
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
            'patient_id', NEW.patient_id,
            'status', NEW.status,
            'old_status', OLD.status
        )::text
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 新しいトリガーを作成
CREATE TRIGGER auto_update_document_on_ready_to_print
AFTER UPDATE ON rpa_queue
FOR EACH ROW EXECUTE FUNCTION auto_update_document_on_ready_to_print();

\echo 'ファイル移動トリガーの更新完了'

-- ========================================================
-- 2. 完了検知トリガーの更新
-- ========================================================
\echo '2. 完了検知トリガーを更新中...'

CREATE OR REPLACE FUNCTION check_all_tasks_complete()
RETURNS trigger AS $$
DECLARE
    active_count INTEGER;
BEGIN
    -- アクティブなタスクをカウント（ready_to_printとuploadedは除外）
    SELECT COUNT(*) INTO active_count
    FROM rpa_queue
    WHERE status IN ('pending', 'processing');

    -- 全タスクが完了状態（ready_to_print、done、failed、canceled）の場合
    IF active_count = 0 AND NEW.status IN ('ready_to_print', 'done', 'failed', 'canceled') THEN
        PERFORM pg_notify('all_tasks_complete',
            json_build_object(
                'completed_at', CURRENT_TIMESTAMP,
                'last_task_id', NEW.id,
                'total_completed', (SELECT COUNT(*) FROM rpa_queue WHERE status IN ('ready_to_print', 'done')),
                'total_failed', (SELECT COUNT(*) FROM rpa_queue WHERE status = 'failed')
            )::text
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

\echo '完了検知トリガーの更新完了'

-- ========================================================
-- コミット
-- ========================================================
COMMIT;

\echo '=========================================='
\echo '✅ トリガー更新が正常に完了しました'
\echo '=========================================='

-- ========================================================
-- 3. 更新後の確認
-- ========================================================
\echo ''
\echo '=========================================='
\echo 'トリガー一覧'
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
\echo '現在のステータス分布'
\echo '=========================================='
SELECT status, COUNT(*) as count
FROM rpa_queue
GROUP BY status
ORDER BY status;