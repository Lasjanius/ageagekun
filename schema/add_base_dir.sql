-- Documentsテーブルにbase_dirカラムを追加
-- base_dir: ファイルが存在するディレクトリパス（ファイル名を除いたパス）

-- 1. base_dirカラムを追加
ALTER TABLE Documents ADD COLUMN IF NOT EXISTS base_dir VARCHAR(500);

-- 2. 既存レコードのbase_dirを設定
-- PostgreSQLでは、Windowsパスの最後の\以降（ファイル名）を除去
UPDATE Documents 
SET base_dir = CASE
    WHEN pass IS NOT NULL THEN 
        substring(pass from 1 for (length(pass) - position('\' in reverse(pass))))
    ELSE NULL
END
WHERE base_dir IS NULL;

-- 3. 確認用クエリ
-- SELECT fileid, filename, pass, base_dir FROM Documents LIMIT 5;