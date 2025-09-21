# RPA Queue ステータス拡張 - 実装戦略書

## 1. エグゼクティブサマリー

### 目的
RPA処理フローに「印刷待ち」ステータスを追加し、アップロード完了と印刷完了を明確に分離する。

### 主要な決定事項
1. **ファイル移動タイミング**: `uploaded`ステータス時に実行（印刷前）
2. **既存データの扱い**: 現在の`done`レコードは全て`uploaded`に移行
3. **印刷機能**: 今後実装予定（`ready_to_print` → `done`の遷移）

## 2. 新ステータスフロー定義

```
pending → processing → uploaded → ready_to_print → done
                           ↓            ↓            ↓
                        failed        failed       failed
```

### ステータス定義
| ステータス | 説明 | 処理内容 | 次の遷移 |
|-----------|------|----------|----------|
| `pending` | 処理待ち | キュー登録完了 | `processing`, `failed` |
| `processing` | RPA実行中 | モバカルネットへアップロード中 | `uploaded`, `failed` |
| `uploaded` | アップロード完了 | ファイル移動・Documents更新 | `ready_to_print`, `failed` |
| `ready_to_print` | 印刷待ち | 印刷準備完了 | `done`, `failed` |
| `done` | 全処理完了 | 最終状態 | なし |
| `failed` | エラー | 処理失敗 | なし |

## 3. 実装フェーズ

### Phase 1: データベース層の更新（優先度：最高）

#### 1.1 CHECK制約の更新
```sql
-- 新しいCHECK制約
ALTER TABLE rpa_queue
DROP CONSTRAINT IF EXISTS rpa_queue_status_check;

ALTER TABLE rpa_queue
ADD CONSTRAINT rpa_queue_status_check
CHECK (status IN ('pending', 'processing', 'uploaded', 'ready_to_print', 'done', 'failed'));
```

#### 1.2 トリガー修正
```sql
-- auto_update_document_on_done を uploaded で実行するように変更
CREATE OR REPLACE FUNCTION auto_update_document_on_done()
RETURNS trigger AS $$
BEGIN
    -- 変更: done → uploaded
    IF NEW.status = 'uploaded' AND OLD.status = 'processing' THEN
        -- ファイル移動とDocuments更新処理（既存のロジックを維持）
        -- ...
    END IF;

    -- status変更時の一般的な通知
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
```

#### 1.3 既存データの移行
```sql
-- トランザクション内で実行
BEGIN;

-- 既存の done レコードを uploaded に変更
UPDATE rpa_queue
SET status = 'uploaded',
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'done';

-- 移行結果の確認
SELECT status, COUNT(*)
FROM rpa_queue
GROUP BY status;

COMMIT;
```

#### 1.4 完了検知トリガーの更新
```sql
CREATE OR REPLACE FUNCTION check_all_tasks_complete()
RETURNS trigger AS $$
BEGIN
    -- 新しいステータスも考慮
    IF NOT EXISTS (
        SELECT 1 FROM rpa_queue
        WHERE status IN ('pending', 'processing', 'uploaded', 'ready_to_print')
    ) AND NEW.status IN ('done', 'failed') THEN
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
```

### Phase 2: バックエンドAPI更新（優先度：高）

#### 2.1 新しいステータス遷移エンドポイント
```javascript
// backend/controllers/queueController.js に追加

// processing → uploaded への更新（PAD用）
const updateToUploaded = async (req, res) => {
  const { id } = req.params;
  const query = `
    UPDATE rpa_queue
    SET status = 'uploaded', updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND status = 'processing'
    RETURNING *
  `;
  // ...実装
};

// uploaded → ready_to_print への更新
const updateToReadyToPrint = async (req, res) => {
  const { id } = req.params;
  const query = `
    UPDATE rpa_queue
    SET status = 'ready_to_print', updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND status = 'uploaded'
    RETURNING *
  `;
  // ...実装
};

// ready_to_print → done への更新（印刷完了時）
const updateToPrinted = async (req, res) => {
  const { id } = req.params;
  const query = `
    UPDATE rpa_queue
    SET status = 'done', updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND status = 'ready_to_print'
    RETURNING *
  `;
  // ...実装
};
```

#### 2.2 WHERE句のホワイトリスト化
```javascript
// 変更前: WHERE q.status != 'done'
// 変更後:
const ACTIVE_STATUSES = ['pending', 'processing', 'uploaded', 'ready_to_print'];

const getPendingQueues = async (req, res) => {
  const query = `
    SELECT * FROM rpa_queue q
    WHERE q.status = ANY($1::varchar[])
    ORDER BY q.created_at DESC
  `;
  const result = await db.query(query, [ACTIVE_STATUSES]);
  // ...
};
```

#### 2.3 統計機能の更新
```javascript
const getQueueOverview = async (req, res) => {
  const overview = {
    pending: 0,
    processing: 0,
    uploaded: 0,      // 新規追加
    ready_to_print: 0, // 新規追加
    done: 0,
    failed: 0
  };
  // ...実装
};
```

### Phase 3: フロントエンド更新（優先度：中）

#### 3.1 ステータス表示の更新
```javascript
// frontend/js/ui.js
const STATUS_LABELS = {
  pending: '処理待ち',
  processing: '処理中',
  uploaded: 'アップロード完了',     // 新規追加
  ready_to_print: '印刷待ち',       // 新規追加
  done: '完了',
  failed: 'エラー'
};

const STATUS_COLORS = {
  pending: '#6c757d',
  processing: '#007bff',
  uploaded: '#17a2b8',        // 新規追加（水色）
  ready_to_print: '#ffc107',   // 新規追加（黄色）
  done: '#28a745',
  failed: '#dc3545'
};
```

#### 3.2 完了判定ロジックの更新
```javascript
// frontend/js/app.js
const isTaskComplete = (task) => {
  return task.status === 'done' || task.status === 'failed';
};

const isTaskActive = (task) => {
  return ['pending', 'processing', 'uploaded', 'ready_to_print'].includes(task.status);
};
```

### Phase 4: PAD連携更新（優先度：高）

#### 4.1 ステータス更新先の変更
- アップロード完了時: `done` → `uploaded`に変更
- APIエンドポイント: `/api/queue/{id}/complete` → `/api/queue/{id}/uploaded`

#### 4.2 新しいAPIルートの追加
```javascript
// backend/routes/queueRoutes.js
router.put('/queue/:id/uploaded', queueController.updateToUploaded);
router.put('/queue/:id/ready-to-print', queueController.updateToReadyToPrint);
router.put('/queue/:id/printed', queueController.updateToPrinted);
```

## 4. テスト戦略

### 4.1 ユニットテスト
- ステータス遷移の妥当性検証
- 不正な遷移の拒否確認
- トリガー動作の検証

### 4.2 統合テスト
```sql
-- テストシナリオ
-- 1. pending → processing → uploaded → ready_to_print → done の正常フロー
-- 2. 各段階でのfailed遷移
-- 3. 不正な遷移の拒否（例: pending → done）
```

### 4.3 回帰テスト
- 既存機能の動作確認
- WebSocket通知の動作確認
- UI表示の確認

## 5. ロールバック計画

### 5.1 データベースロールバック
```sql
-- 緊急時のロールバック手順
BEGIN;

-- uploadedステータスをdoneに戻す
UPDATE rpa_queue
SET status = 'done'
WHERE status IN ('uploaded', 'ready_to_print');

-- CHECK制約を元に戻す
ALTER TABLE rpa_queue
DROP CONSTRAINT rpa_queue_status_check;

ALTER TABLE rpa_queue
ADD CONSTRAINT rpa_queue_status_check
CHECK (status IN ('pending', 'processing', 'done', 'failed'));

COMMIT;
```

## 6. 移行スケジュール

### Week 1
- [ ] データベース更新スクリプト作成
- [ ] バックエンドAPI実装
- [ ] 単体テスト作成

### Week 2
- [ ] フロントエンド更新
- [ ] PADスクリプト修正
- [ ] 統合テスト実施

### Week 3
- [ ] ステージング環境でのテスト
- [ ] ドキュメント更新
- [ ] 本番環境への段階的リリース

## 7. リスクと対策

| リスク | 影響度 | 発生確率 | 対策 |
|--------|--------|----------|------|
| データ移行失敗 | 高 | 低 | トランザクション使用、バックアップ確保 |
| PAD連携エラー | 中 | 中 | 並行稼働期間の設定、段階的切り替え |
| UI混乱 | 低 | 中 | ツールチップ追加、ユーザーガイド作成 |

## 8. 監視項目

### 8.1 メトリクス
- 各ステータスの滞留時間
- ステータス遷移エラー率
- API応答時間

### 8.2 アラート設定
- `uploaded`ステータスで24時間以上滞留
- 不正なステータス遷移の検知
- トリガーエラーの発生

## 9. 成功基準

1. **技術的成功基準**
   - 全テストケースの合格
   - エラー率1%未満
   - 応答時間の劣化なし

2. **ビジネス成功基準**
   - アップロードと印刷の状態を明確に区別
   - 処理フローの可視性向上
   - 将来の印刷機能実装への準備完了

## 10. 今後の拡張予定

### 印刷機能の実装（次フェーズ）
1. 印刷ジョブ管理テーブルの追加
2. 印刷APIの実装
3. `ready_to_print` → `done`の自動遷移
4. 印刷失敗時のリトライ機能

### 長期的な改善案
- ステータス履歴テーブルの追加
- 詳細な監査ログ
- ダッシュボード機能の強化
- バッチ印刷機能