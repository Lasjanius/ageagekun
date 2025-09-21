-- ========================================================
-- トリガー修正: uploaded重複防止
-- ========================================================

\echo '=========================================='
\echo 'トリガー修正開始'
\echo '=========================================='

BEGIN;

-- 既存トリガー関数を修正
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

            -- base_dirも更新（まだuploadedが含まれていない場合のみ）
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
        -- すでにuploadedフォルダにある場合は、isUploadedフラグのみ更新
        ELSIF old_path IS NOT NULL AND old_path LIKE '%\uploaded\%' THEN
            UPDATE Documents
            SET
                isUploaded = TRUE,
                uploaded_at = CURRENT_TIMESTAMP
            WHERE fileID = NEW.file_id
            AND isUploaded = FALSE;  -- まだuploadedになっていない場合のみ
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

\echo 'トリガー関数の修正完了'

-- 完了検知トリガーも修正（ready_to_printを完了として扱う）
CREATE OR REPLACE FUNCTION check_all_tasks_complete()
RETURNS trigger AS $$
DECLARE
    active_count INTEGER;
BEGIN
    -- アクティブなタスクをカウント（ready_to_printは完了として扱う）
    SELECT COUNT(*) INTO active_count
    FROM rpa_queue
    WHERE status IN ('pending', 'processing');

    -- 全タスクが完了状態の場合
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

\echo '完了検知トリガーの修正完了'

COMMIT;

\echo '=========================================='
\echo '✅ トリガー修正が完了しました'
\echo '=========================================='

-- 現在のDocumentsテーブルの重複uploadedパスを修正
\echo ''
\echo '既存データの修正中...'
UPDATE Documents
SET pass = regexp_replace(pass, '(\\uploaded)+', '\uploaded', 'g'),
    base_dir = regexp_replace(base_dir, '(\\uploaded)+', '\uploaded', 'g')
WHERE pass LIKE '%\uploaded\uploaded%' OR base_dir LIKE '%\uploaded\uploaded%';

\echo '✅ 既存データの修正完了'