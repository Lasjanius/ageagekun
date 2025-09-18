-- テストデータをリセットするSQL

-- rpa_queueを空にする
TRUNCATE TABLE rpa_queue RESTART IDENTITY CASCADE;

-- Documentsテーブルのアップロード状態をリセット
-- fileID = 1 のレコードを元に戻す
UPDATE Documents 
SET 
    isUploaded = false,
    uploaded_at = NULL,
    pass = 'C:\Users\hyosh\Desktop\allright\ageagekun\patients\99999999\居宅レポート.pdf'
WHERE fileID = 1;

-- または、全てのアップロード済みファイルをリセット（uploadedフォルダを除去）
UPDATE Documents 
SET 
    isUploaded = false,
    uploaded_at = NULL,
    pass = regexp_replace(pass, '\\uploaded\\', '\', 'g')
WHERE isUploaded = true 
  AND pass LIKE '%\uploaded\%';

-- 確認用クエリ
SELECT fileID, fileName, isUploaded, uploaded_at, pass 
FROM Documents 
WHERE fileID IN (1, 2, 3, 4, 5);

SELECT * FROM rpa_queue;