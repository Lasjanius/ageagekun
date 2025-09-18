-- ageagekunデータベースの作成
-- 注意: このコマンドはデータベースに接続する前に実行してください
-- CREATE DATABASE ageagekun;

-- ageagekunデータベースに接続してから以下を実行
-- psqlの場合: \c ageagekun

-- patientsテーブルの作成
CREATE TABLE IF NOT EXISTS patients (
    patientID SERIAL PRIMARY KEY,
    patientName VARCHAR(255),
    address TEXT,
    visitingNurse VARCHAR(255),
    homecareOffice VARCHAR(255),
    CMName VARCHAR(255),
    birthdate DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Documentsテーブルの作成
CREATE TABLE IF NOT EXISTS Documents (
    fileID SERIAL PRIMARY KEY,
    fileName VARCHAR(255),
    patientID INTEGER REFERENCES patients(patientID) ON DELETE CASCADE,
    Category VARCHAR(100),
    FileType VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uploaded_at TIMESTAMP,
    isUploaded BOOLEAN DEFAULT FALSE,
    pass VARCHAR(255)
);

-- インデックスの作成（パフォーマンス向上のため）
CREATE INDEX idx_documents_patientid ON Documents(patientID);
CREATE INDEX idx_documents_isuploaded ON Documents(isUploaded);
CREATE INDEX idx_patients_name ON patients(patientName);

-- テーブル作成確認用クエリ
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';