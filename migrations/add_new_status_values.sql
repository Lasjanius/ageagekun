-- ========================================================
-- RPA Queue ステータス拡張 - 完全版移行スクリプト
-- ========================================================
-- 実行日時: [実行時に記載]
-- 実行者: [実行者名]
--
-- 概要:
-- 1. 新しいステータス値（uploaded, ready_to_print）を追加
-- 2. 既存のdoneレコードをuploadedに移行
-- 3. トリガー関数を更新
-- ========================================================

-- 実行前の状態確認
\echo '=========================================='
\echo '実行前のステータス分布確認'
\echo '=========================================='
SELECT status, COUNT(*) as count
FROM rpa_queue
GROUP BY status
ORDER BY status;

\echo '=========================================='
\echo '移行処理開始'
\echo '=========================================='

BEGIN;

-- ========================================================
-- 1. CHECK制約の更新
-- ========================================================
\echo '1. CHECK制約を更新中...'

ALTER TABLE rpa_queue
DROP CONSTRAINT IF EXISTS rpa_queue_status_check;

ALTER TABLE rpa_queue
ADD CONSTRAINT rpa_queue_status_check
CHECK (status IN ('pending', 'processing', 'uploaded', 'ready_to_print', 'done', 'failed', 'canceled'));

\echo 'CHECK制約の更新完了'

-- ========================================================
-- 2. 既存データの移行（done → uploaded）
-- ========================================================
\echo '2. 既存のdoneレコードをuploadedに移行中...'

UPDATE rpa_queue
SET
    status = 'uploaded',
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'done';

\echo '移行対象レコード数:'
SELECT ROW_COUNT() as migrated_records;

-- ========================================================
-- 3. トリガー関数の更新
-- ========================================================
\echo '3. トリガー関数を更新中...'

-- 既存のトリガーとファンクションを削除
DROP TRIGGER IF EXISTS auto_update_document ON rpa_queue;
DROP FUNCTION IF EXISTS auto_update_document_on_done() CASCADE;

-- 新しい名前でトリガー関数を作成
CREATE OR REPLACE FUNCTION auto_update_document_on_uploaded()
RETURNS trigger AS $$
DECLARE
    old_path TEXT;
    new_path TEXT;
    base_dir_path TEXT;
BEGIN
    -- uploadedステータス時にファイル移動とDocuments更新
    IF NEW.status = 'uploaded' AND OLD.status = 'processing' THEN
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
CREATE TRIGGER auto_update_document_on_uploaded
AFTER UPDATE ON rpa_queue
FOR EACH ROW EXECUTE FUNCTION auto_update_document_on_uploaded();

\echo 'トリガー関数の更新完了'

-- ========================================================
-- 4. 完了検知トリガーの更新
-- ========================================================
\echo '4. 完了検知トリガーを更新中...'

CREATE OR REPLACE FUNCTION check_all_tasks_complete()
RETURNS trigger AS $$
DECLARE
    active_count INTEGER;
BEGIN
    -- アクティブなタスクをカウント（新しいステータスも含める）
    SELECT COUNT(*) INTO active_count
    FROM rpa_queue
    WHERE status IN ('pending', 'processing', 'uploaded', 'ready_to_print');

    -- 全タスクが完了または失敗の場合
    IF active_count = 0 AND NEW.status IN ('done', 'failed', 'canceled') THEN
        PERFORM pg_notify('all_tasks_complete',
            json_build_object(
                'completed_at', CURRENT_TIMESTAMP,
                'last_task_id', NEW.id,
                'total_done', (SELECT COUNT(*) FROM rpa_queue WHERE status = 'done'),
                'total_failed', (SELECT COUNT(*) FROM rpa_queue WHERE status = 'failed')
            )::text
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

\echo '完了検知トリガーの更新完了'

-- ========================================================
-- 5. 実行後の状態確認
-- ========================================================
\echo '=========================================='
\echo '実行後のステータス分布確認'
\echo '=========================================='
SELECT status, COUNT(*) as count
FROM rpa_queue
GROUP BY status
ORDER BY status;

-- ========================================================
-- 6. トリガー一覧の確認
-- ========================================================
\echo '=========================================='
\echo 'トリガー一覧'
\echo '=========================================='
SELECT
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND event_object_table = 'rpa_queue';

-- ========================================================
-- 7. CHECK制約の確認
-- ========================================================
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
\echo '移行処理完了'
\echo '=========================================='
\echo 'トランザクションをコミットしてよろしいですか？'
\echo '問題がある場合は、Ctrl+C で中断し、ROLLBACK; を実行してください'
\echo '=========================================='

-- トランザクションのコミット
COMMIT;

\echo '=========================================='
\echo '✅ 移行処理が正常に完了しました'
\echo '=========================================='