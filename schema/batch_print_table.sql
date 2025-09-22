-- PDF連結印刷機能用テーブル
-- v5.0.0 (2025-01-22)

-- 連結PDF管理テーブル
CREATE TABLE IF NOT EXISTS batch_prints (
  id SERIAL PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,      -- 生成されたPDFファイル名 (例: batch_20250122_103045.pdf)
  file_path VARCHAR(500) NOT NULL,      -- ファイルの保存パス
  file_size INTEGER,                    -- ファイルサイズ（バイト）
  page_count INTEGER,                   -- 総ページ数
  document_count INTEGER,               -- 連結したドキュメント数
  document_ids INTEGER[],               -- 選択されたrpa_queue.id配列
  success_ids INTEGER[],                -- 正常に処理されたID配列
  failed_ids INTEGER[],                 -- エラーになったID配列（mergingのまま残る）
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- パフォーマンス用インデックス
CREATE INDEX IF NOT EXISTS idx_batch_prints_created_at ON batch_prints(created_at);

-- コメント追加
COMMENT ON TABLE batch_prints IS 'PDF連結印刷機能の履歴管理テーブル';
COMMENT ON COLUMN batch_prints.file_name IS '生成されたPDFファイル名';
COMMENT ON COLUMN batch_prints.file_path IS 'ファイルシステム上の絶対パス';
COMMENT ON COLUMN batch_prints.file_size IS 'ファイルサイズ（バイト単位）';
COMMENT ON COLUMN batch_prints.page_count IS '連結後の総ページ数';
COMMENT ON COLUMN batch_prints.document_count IS '連結を試みたドキュメントの総数';
COMMENT ON COLUMN batch_prints.document_ids IS '処理対象として選択されたrpa_queue.idの配列';
COMMENT ON COLUMN batch_prints.success_ids IS '正常に連結できたドキュメントのID配列';
COMMENT ON COLUMN batch_prints.failed_ids IS '連結に失敗したドキュメントのID配列（mergingステータスのまま）';
COMMENT ON COLUMN batch_prints.created_at IS 'PDF生成日時';

-- ディレクトリ作成の手順（コメント）
-- 以下のディレクトリを手動で作成する必要があります：
-- C:\Users\hyosh\Desktop\allright\ageagekun\patients\batch_prints\