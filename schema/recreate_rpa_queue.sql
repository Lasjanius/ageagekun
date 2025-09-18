-- 既存のrpa_queueテーブルを削除（トリガーも自動的に削除される）
DROP TABLE IF EXISTS rpa_queue CASCADE;

-- 新しい構造でrpa_queueテーブルを作成
CREATE TABLE rpa_queue (
    id SERIAL PRIMARY KEY,
    file_id INTEGER REFERENCES Documents(fileID) ON DELETE CASCADE,
    patient_id INTEGER REFERENCES patients(patientID) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' 
        CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックスの作成
CREATE INDEX idx_rpa_queue_status ON rpa_queue(status);
CREATE INDEX idx_rpa_queue_file_id ON rpa_queue(file_id);
CREATE INDEX idx_rpa_queue_patient_id ON rpa_queue(patient_id);
CREATE INDEX idx_rpa_queue_created_at ON rpa_queue(created_at);

-- updated_atを自動更新するトリガー関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- updated_at自動更新トリガー
CREATE TRIGGER update_rpa_queue_updated_at 
BEFORE UPDATE ON rpa_queue 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- 確認用
-- \d rpa_queue