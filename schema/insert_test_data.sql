-- テストデータ投入スクリプト
-- 実行前に既存データをクリア（オプション）
-- TRUNCATE patients, documents, rpa_queue RESTART IDENTITY CASCADE;

-- 患者データの挿入（3名）
INSERT INTO patients (patientID, patientName, address, visitingNurse, homecareOffice, CMName, birthdate) VALUES
(99999999, 'テスト太郎', '東京都渋谷区1-1-1', '看護師A', '訪問看護ステーションA', 'ケアマネA', '1950-01-01'),
(99999998, '田中花子', '東京都新宿区2-2-2', '看護師B', '訪問看護ステーションB', 'ケアマネB', '1945-05-15'),
(325, '山田次郎', '東京都港区3-3-3', '看護師C', '訪問看護ステーションC', 'ケアマネC', '1960-12-20')
ON CONFLICT (patientID) DO UPDATE SET
    patientName = EXCLUDED.patientName,
    address = EXCLUDED.address,
    visitingNurse = EXCLUDED.visitingNurse,
    homecareOffice = EXCLUDED.homecareOffice,
    CMName = EXCLUDED.CMName,
    birthdate = EXCLUDED.birthdate;

-- ドキュメントデータの挿入（合計8件）
-- カテゴリはすべて「居宅」

-- 99999999の患者（1件未アップロード、1件アップロード済み）
INSERT INTO Documents (fileName, patientID, Category, FileType, pass, isUploaded, uploaded_at) VALUES
('居宅レポート.pdf', 99999999, '居宅', 'pdf', 'C:\Users\hyosh\Desktop\allright\ageagekun\patients\99999999\居宅レポート.pdf', false, NULL),
('過去アップロード済み.pdf', 99999999, '居宅', 'pdf', 'C:\Users\hyosh\Desktop\allright\ageagekun\patients\99999999\過去アップロード済み.pdf', true, NOW() - INTERVAL '7 days');

-- 99999998の患者（3件未アップロード、1件アップロード済み）
INSERT INTO Documents (fileName, patientID, Category, FileType, pass, isUploaded, uploaded_at) VALUES
('居宅レポート.pdf', 99999998, '居宅', 'pdf', 'C:\Users\hyosh\Desktop\allright\ageagekun\patients\99999998\居宅レポート.pdf', false, NULL),
('訪問看護報告書.pdf', 99999998, '居宅', 'pdf', 'C:\Users\hyosh\Desktop\allright\ageagekun\patients\99999998\訪問看護報告書.pdf', false, NULL),
('ケアプラン.pdf', 99999998, '居宅', 'pdf', 'C:\Users\hyosh\Desktop\allright\ageagekun\patients\99999998\ケアプラン.pdf', false, NULL),
('過去アップロード済み.pdf', 99999998, '居宅', 'pdf', 'C:\Users\hyosh\Desktop\allright\ageagekun\patients\99999998\過去アップロード済み.pdf', true, NOW() - INTERVAL '3 days');

-- 00000325の患者（2件未アップロード）
INSERT INTO Documents (fileName, patientID, Category, FileType, pass, isUploaded, uploaded_at) VALUES
('居宅レポート.pdf', 325, '居宅', 'pdf', 'C:\Users\hyosh\Desktop\allright\ageagekun\patients\00000325\居宅レポート.pdf', false, NULL),
('訪問看護報告書.pdf', 325, '居宅', 'pdf', 'C:\Users\hyosh\Desktop\allright\ageagekun\patients\00000325\訪問看護報告書.pdf', false, NULL);

-- 投入結果確認用クエリ
SELECT '=== 患者データ確認 ===' as info;
SELECT patientID, patientName, address FROM patients ORDER BY patientID;

SELECT '=== ドキュメントデータ確認 ===' as info;
SELECT d.fileID, p.patientName, d.fileName, d.Category, d.isUploaded,
       CASE WHEN d.isUploaded THEN '✓ アップロード済み' ELSE '× 未アップロード' END as status
FROM Documents d
JOIN patients p ON d.patientID = p.patientID
ORDER BY p.patientID, d.fileID;

SELECT '=== 未アップロードファイル一覧 ===' as info;
SELECT * FROM v_pending_uploads;