-- auto_update_document_on_doneトリガー関数を更新
-- base_dirも自動更新するように修正

CREATE OR REPLACE FUNCTION auto_update_document_on_done() 
RETURNS trigger AS $$
DECLARE
    old_path TEXT;
    new_path TEXT;
    new_base_dir TEXT;
BEGIN
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
            
            -- 新しいbase_dirを計算（ファイル名を除いたパス）
            new_base_dir := substring(new_path from 1 for (length(new_path) - position('\' in reverse(new_path))));
            
            -- Documentsテーブルを更新（base_dirも含む）
            UPDATE Documents 
            SET 
                isUploaded = TRUE,
                uploaded_at = CURRENT_TIMESTAMP,
                pass = new_path,
                base_dir = new_base_dir
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

-- トリガーは既に存在するので、関数のみ更新される