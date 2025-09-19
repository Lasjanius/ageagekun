-- AI報告書生成フラグを追加するマイグレーション
-- 実行日: 2025-01-19

-- 1. is_ai_generatedカラムを追加
ALTER TABLE Documents
ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN NOT NULL DEFAULT false;

-- 2. 既存のAI報告書にフラグを設定
-- カテゴリーが'居宅療養管理指導報告書'のものはAI生成とみなす
UPDATE Documents
SET is_ai_generated = true
WHERE Category = '居宅療養管理指導報告書'
   OR Category = '居宅'
   OR (FileType = 'pdf' AND fileName LIKE '%居宅療養管理指導報告書%');

-- 3. パフォーマンス向上のためのインデックスを追加
CREATE INDEX IF NOT EXISTS idx_documents_ai_flag ON Documents(is_ai_generated);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON Documents(created_at);
CREATE INDEX IF NOT EXISTS idx_documents_patient_ai ON Documents(patientID, is_ai_generated, created_at);

-- 4. 確認用クエリ
-- AI生成フラグが設定されたドキュメント数を確認
SELECT
    COUNT(*) as total_documents,
    COUNT(CASE WHEN is_ai_generated = true THEN 1 END) as ai_generated_count,
    COUNT(CASE WHEN is_ai_generated = false THEN 1 END) as non_ai_count
FROM Documents;

-- AI生成ドキュメントのサンプル確認
SELECT
    fileID,
    fileName,
    patientID,
    Category,
    is_ai_generated,
    created_at
FROM Documents
WHERE is_ai_generated = true
LIMIT 5;