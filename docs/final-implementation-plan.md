# RPA Queue ステータス拡張 - 完全版実装計画

## 前提条件（重要）
- **本番稼働前**のシステムである
- **データ量が少ない**（移行リスクが低い）
- **段階的切り替えは不要**（管理複雑性を避ける）
- **一括変更**で完全版を実装する

## 実装する新ステータスフロー

```
pending → processing → uploaded → ready_to_print → done
                           ↓            ↓            ↓
                        failed        failed       failed
```

## 実装手順（シンプル・完全版）

### Step 1: データベース完全更新

#### 1.1 全体更新SQLスクリプト作成
```sql
-- update_status_complete.sql
-- 実行日時: [実行時に記載]
-- 実行者: [実行者名]

BEGIN;

-- 1. CHECK制約を新しいステータス値に更新
ALTER TABLE rpa_queue
DROP CONSTRAINT IF EXISTS rpa_queue_status_check;

ALTER TABLE rpa_queue
ADD CONSTRAINT rpa_queue_status_check
CHECK (status IN ('pending', 'processing', 'uploaded', 'ready_to_print', 'done', 'failed'));

-- 2. 既存のdoneレコードをuploadedに一括更新
UPDATE rpa_queue
SET
    status = 'uploaded',
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'done';

-- 3. トリガー関数を更新（名前も変更）
DROP TRIGGER IF EXISTS auto_update_document ON rpa_queue;
DROP FUNCTION IF EXISTS auto_update_document_on_done() CASCADE;

CREATE OR REPLACE FUNCTION auto_update_document_on_uploaded()
RETURNS trigger AS $$
DECLARE
    old_path TEXT;
    new_path TEXT;
BEGIN
    -- uploadedステータス時にファイル移動とDocuments更新
    IF NEW.status = 'uploaded' AND OLD.status = 'processing' THEN
        SELECT pass INTO old_path FROM Documents WHERE fileID = NEW.file_id;

        IF old_path IS NOT NULL AND old_path NOT LIKE '%\uploaded\%' THEN
            new_path := regexp_replace(
                old_path,
                '(C:\\Users\\hyosh\\Desktop\\allright\\ageagekun\\patients\\[0-9]+)\\(.+)$',
                E'\\1\\\\uploaded\\\\\\2'
            );

            UPDATE Documents
            SET
                isUploaded = TRUE,
                uploaded_at = CURRENT_TIMESTAMP,
                pass = new_path
            WHERE fileID = NEW.file_id;

            PERFORM pg_notify('file_movement_required',
                json_build_object(
                    'file_id', NEW.file_id,
                    'old_path', old_path,
                    'new_path', new_path
                )::text
            );
        END IF;
    END IF;

    -- 全ステータス変更で通知
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

CREATE TRIGGER auto_update_document_on_uploaded
AFTER UPDATE ON rpa_queue
FOR EACH ROW EXECUTE FUNCTION auto_update_document_on_uploaded();

-- 4. 完了検知トリガーの更新
CREATE OR REPLACE FUNCTION check_all_tasks_complete()
RETURNS trigger AS $$
DECLARE
    active_count INTEGER;
BEGIN
    -- アクティブなタスクをカウント
    SELECT COUNT(*) INTO active_count
    FROM rpa_queue
    WHERE status IN ('pending', 'processing', 'uploaded', 'ready_to_print');

    -- 全タスクが完了または失敗の場合
    IF active_count = 0 AND NEW.status IN ('done', 'failed') THEN
        PERFORM pg_notify('all_tasks_complete',
            json_build_object(
                'completed_at', CURRENT_TIMESTAMP,
                'last_task_id', NEW.id
            )::text
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. エラーハンドリングトリガーは変更不要（status='failed'の処理のみ）

-- 実行結果の確認
SELECT
    status,
    COUNT(*) as count
FROM rpa_queue
GROUP BY status
ORDER BY status;

COMMIT;
```

### Step 2: バックエンドAPI完全更新

#### 2.1 新しいコントローラーメソッド
```javascript
// backend/controllers/queueController.js

// ステータス定義（定数化）
const QUEUE_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  UPLOADED: 'uploaded',
  READY_TO_PRINT: 'ready_to_print',
  DONE: 'done',
  FAILED: 'failed'
};

// processing → uploaded (PADが呼ぶ)
const updateToUploaded = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      UPDATE rpa_queue
      SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = $3
      RETURNING *
    `;

    const result = await db.query(query, [
      id,
      QUEUE_STATUS.UPLOADED,
      QUEUE_STATUS.PROCESSING
    ]);

    if (result.rows.length === 0) {
      return res.status(409).json({
        success: false,
        error: 'Invalid state transition or queue item not found'
      });
    }

    res.json({
      success: true,
      message: 'Upload completed',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating to uploaded:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// uploaded → ready_to_print
const updateToReadyToPrint = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      UPDATE rpa_queue
      SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = $3
      RETURNING *
    `;

    const result = await db.query(query, [
      id,
      QUEUE_STATUS.READY_TO_PRINT,
      QUEUE_STATUS.UPLOADED
    ]);

    if (result.rows.length === 0) {
      return res.status(409).json({
        success: false,
        error: 'Invalid state transition'
      });
    }

    res.json({
      success: true,
      message: 'Ready for printing',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating to ready_to_print:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ready_to_print → done (印刷完了時)
const updateToDone = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      UPDATE rpa_queue
      SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = $3
      RETURNING *
    `;

    const result = await db.query(query, [
      id,
      QUEUE_STATUS.DONE,
      QUEUE_STATUS.READY_TO_PRINT
    ]);

    if (result.rows.length === 0) {
      return res.status(409).json({
        success: false,
        error: 'Invalid state transition'
      });
    }

    res.json({
      success: true,
      message: 'All processing completed',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating to done:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// 既存メソッドの修正
const getPendingQueues = async (req, res) => {
  try {
    // ホワイトリスト方式
    const ACTIVE_STATUSES = [
      QUEUE_STATUS.PENDING,
      QUEUE_STATUS.PROCESSING,
      QUEUE_STATUS.UPLOADED,
      QUEUE_STATUS.READY_TO_PRINT
    ];

    const query = `
      SELECT
        q.*,
        d.fileName as file_name,
        p.patientName as patient_name
      FROM rpa_queue q
      LEFT JOIN Documents d ON q.file_id = d.fileID
      LEFT JOIN patients p ON q.patient_id = p.patientID
      WHERE q.status = ANY($1::varchar[])
      ORDER BY q.created_at DESC
    `;

    const result = await db.query(query, [ACTIVE_STATUSES]);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching pending queues:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// 統計情報の更新
const getQueueOverview = async (req, res) => {
  try {
    const query = `
      SELECT
        status,
        COUNT(*) as count
      FROM rpa_queue
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY status
      ORDER BY status
    `;

    const result = await db.query(query);

    // 全ステータスを含める
    const overview = {
      pending: 0,
      processing: 0,
      uploaded: 0,
      ready_to_print: 0,
      done: 0,
      failed: 0
    };

    result.rows.forEach(row => {
      overview[row.status] = parseInt(row.count);
    });

    res.json({
      success: true,
      data: overview
    });
  } catch (error) {
    console.error('Error fetching queue overview:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
```

#### 2.2 ルーティング更新
```javascript
// backend/routes/queueRoutes.js

// 既存のルート
router.post('/queue/batch', queueController.createBatchQueue);
router.get('/queue/:id/status', queueController.getQueueStatus);
router.get('/queue/pending', queueController.getPendingQueues);
router.get('/queue/overview', queueController.getQueueOverview);

// 新しいステータス遷移ルート
router.put('/queue/:id/processing', queueController.updateToProcessing);
router.put('/queue/:id/uploaded', queueController.updateToUploaded);      // PAD用
router.put('/queue/:id/ready-to-print', queueController.updateToReadyToPrint);
router.put('/queue/:id/done', queueController.updateToDone);              // 印刷完了用
router.put('/queue/:id/failed', queueController.updateToFailed);

// 古いルートは削除
// router.put('/queue/:id/complete', ...); // 削除
```

### Step 3: フロントエンド完全更新

#### 3.1 ステータス表示と色定義
```javascript
// frontend/js/constants.js

export const QUEUE_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  UPLOADED: 'uploaded',
  READY_TO_PRINT: 'ready_to_print',
  DONE: 'done',
  FAILED: 'failed'
};

export const STATUS_CONFIG = {
  [QUEUE_STATUS.PENDING]: {
    label: '処理待ち',
    color: '#6c757d',
    icon: '⏳'
  },
  [QUEUE_STATUS.PROCESSING]: {
    label: '処理中',
    color: '#007bff',
    icon: '🔄'
  },
  [QUEUE_STATUS.UPLOADED]: {
    label: 'アップロード完了',
    color: '#17a2b8',
    icon: '☁️'
  },
  [QUEUE_STATUS.READY_TO_PRINT]: {
    label: '印刷待ち',
    color: '#ffc107',
    icon: '🖨️'
  },
  [QUEUE_STATUS.DONE]: {
    label: '完了',
    color: '#28a745',
    icon: '✅'
  },
  [QUEUE_STATUS.FAILED]: {
    label: 'エラー',
    color: '#dc3545',
    icon: '❌'
  }
};
```

#### 3.2 UI更新
```javascript
// frontend/js/ui.js

const renderQueueStatus = (status) => {
  const config = STATUS_CONFIG[status] || {};
  return `
    <span class="status-badge" style="background-color: ${config.color}">
      ${config.icon} ${config.label}
    </span>
  `;
};

// CSSクラスの更新
const getQueueRowClass = (status) => {
  const classMap = {
    'pending': 'queue-row--pending',
    'processing': 'queue-row--processing',
    'uploaded': 'queue-row--uploaded',
    'ready_to_print': 'queue-row--print-ready',
    'done': 'queue-row--done',
    'failed': 'queue-row--failed'
  };
  return classMap[status] || '';
};
```

### Step 4: PAD更新

#### 4.1 APIコール先の変更
```
PAD側の変更点：
1. アップロード完了時のAPI
   旧: PUT /api/queue/{id}/complete
   新: PUT /api/queue/{id}/uploaded

2. エラー時のAPI（変更なし）
   PUT /api/queue/{id}/failed
```

### Step 5: テストスクリプト更新

#### 5.1 新しいテストスクリプト
```powershell
# test_new_status_flow.ps1

param(
    [int]$FileId = 5,
    [switch]$Reset
)

$dbCmd = '"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w'

if ($Reset) {
    Write-Host "Resetting to pending status..." -ForegroundColor Yellow
    Invoke-Expression "$dbCmd -c `"UPDATE rpa_queue SET status = 'pending' WHERE file_id = $FileId`""
} else {
    Write-Host "Testing new status flow..." -ForegroundColor Green

    # pending → processing
    Write-Host "1. pending → processing"
    Invoke-Expression "$dbCmd -c `"UPDATE rpa_queue SET status = 'processing' WHERE file_id = $FileId AND status = 'pending'`""

    Start-Sleep -Seconds 1

    # processing → uploaded (PADが実行)
    Write-Host "2. processing → uploaded"
    Invoke-Expression "$dbCmd -c `"UPDATE rpa_queue SET status = 'uploaded' WHERE file_id = $FileId AND status = 'processing'`""

    Start-Sleep -Seconds 1

    # uploaded → ready_to_print
    Write-Host "3. uploaded → ready_to_print"
    Invoke-Expression "$dbCmd -c `"UPDATE rpa_queue SET status = 'ready_to_print' WHERE file_id = $FileId AND status = 'uploaded'`""

    Start-Sleep -Seconds 1

    # ready_to_print → done
    Write-Host "4. ready_to_print → done"
    Invoke-Expression "$dbCmd -c `"UPDATE rpa_queue SET status = 'done' WHERE file_id = $FileId AND status = 'ready_to_print'`""

    # 最終状態確認
    Write-Host "`nFinal status:" -ForegroundColor Cyan
    Invoke-Expression "$dbCmd -c `"SELECT id, file_id, status FROM rpa_queue WHERE file_id = $FileId`""
}
```

## 実装チェックリスト

### 事前準備
- [ ] データベースのバックアップ取得
- [ ] 現在のステータス分布確認（全てpending/done/failedのみであることを確認）

### データベース
- [ ] `update_status_complete.sql`の実行
- [ ] トリガー動作確認
- [ ] 既存データの移行確認（done → uploaded）

### バックエンド
- [ ] 新しいAPIエンドポイント実装
- [ ] 既存エンドポイントの更新
- [ ] ユニットテスト作成・実行

### フロントエンド
- [ ] ステータス表示の更新
- [ ] CSSスタイルの追加
- [ ] WebSocket通知ハンドラー更新

### PAD
- [ ] APIコール先の変更
- [ ] エラーハンドリング確認

### テスト
- [ ] 全ステータス遷移のテスト
- [ ] エラーケースのテスト
- [ ] WebSocket通知の確認

### ドキュメント
- [ ] API仕様書の更新
- [ ] 運用手順書の更新

## ロールバック手順（緊急時のみ）

```sql
-- rollback.sql
BEGIN;

-- ステータスを元に戻す
UPDATE rpa_queue
SET status = 'done'
WHERE status IN ('uploaded', 'ready_to_print');

-- CHECK制約を元に戻す
ALTER TABLE rpa_queue
DROP CONSTRAINT rpa_queue_status_check;

ALTER TABLE rpa_queue
ADD CONSTRAINT rpa_queue_status_check
CHECK (status IN ('pending', 'processing', 'done', 'failed'));

-- トリガーを元に戻す
DROP TRIGGER IF EXISTS auto_update_document_on_uploaded ON rpa_queue;
DROP FUNCTION IF EXISTS auto_update_document_on_uploaded();

-- 旧トリガーを再作成（必要に応じて）

COMMIT;
```

## まとめ

本番稼働前でデータ量が少ない今が、完全版への移行の最適なタイミングです。
段階的移行の複雑さを避け、シンプルに一括変更することで：

1. **実装がシンプル** - 複雑な条件分岐やFeature Flagが不要
2. **テストが容易** - 一つの状態のみをテストすればよい
3. **運用が明確** - どのステータスが有効か迷うことがない

これにより、将来の印刷機能実装への準備が完了します。