# RPA Queue ステータス拡張 - 改訂版実装計画

## エグゼクティブサマリー

Codex MCPのレビューを踏まえ、より安全で段階的な移行戦略を採用します。
**重要**: `done`と新ステータスの共存期間（dual-read phase）を設け、互換性を保ちながら移行します。

## 重要な変更点（Codex MCPの指摘事項）

### 1. 段階的移行の必要性
- **問題**: 既存システムが`status='done'`を前提に動作している
- **解決**: dual-read期間を設け、`done`と`uploaded`を同等に扱う

### 2. トリガー再実行の問題
- **問題**: 既存`done`→`uploaded`への更新では、トリガーが再実行されない
- **解決**: 既存データは既にファイル移動済みなので問題なし（要確認）

### 3. トリガー名の不整合
- **問題**: `auto_update_document_on_done`が`uploaded`で実行される矛盾
- **解決**: トリガー名を`auto_update_document_on_uploaded`に変更

## 改訂版実装フェーズ

### Phase 0: 事前調査（1日）

#### 影響箇所の完全な棚卸し
```sql
-- status='done'を参照している全箇所を特定
-- 1. データベースビュー
SELECT viewname, definition
FROM pg_views
WHERE definition LIKE '%status%done%';

-- 2. トリガー関数
SELECT proname, prosrc
FROM pg_proc
WHERE prosrc LIKE '%status%done%';

-- 3. インデックス
SELECT indexname, indexdef
FROM pg_indexes
WHERE indexdef LIKE '%status%';
```

#### コード内の影響箇所調査
- バックエンド: `status === 'done'`の検索
- フロントエンド: 完了判定ロジック
- PAD: ステータス更新箇所
- レポート/分析: 集計ロジック

### Phase 1: Dual-Read対応（3日）

#### 1.1 バックエンド改修（互換性維持）
```javascript
// 新しいステータス定義（互換性考慮）
const STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  UPLOADED: 'uploaded',
  READY_TO_PRINT: 'ready_to_print',
  DONE: 'done',
  FAILED: 'failed'
};

// 完了状態の判定（dual-read対応）
const isCompleted = (status) => {
  // 移行期間中は done と uploaded を同等に扱う
  return status === STATUS.DONE ||
         status === STATUS.UPLOADED ||
         status === STATUS.READY_TO_PRINT;
};

// アクティブな状態（dual-read対応）
const isActive = (status) => {
  return [STATUS.PENDING, STATUS.PROCESSING].includes(status);
};
```

#### 1.2 フロントエンド改修（互換性維持）
```javascript
// ステータス表示の互換性維持
const getDisplayStatus = (status) => {
  const statusMap = {
    'pending': '処理待ち',
    'processing': '処理中',
    'uploaded': 'アップロード完了',    // 新規
    'ready_to_print': '印刷待ち',      // 新規
    'done': '完了',
    'failed': 'エラー'
  };
  // 移行期間中はuploadedもdoneと同じ扱い
  if (status === 'uploaded' && !featureFlags.newStatusFlow) {
    return statusMap['done'];
  }
  return statusMap[status] || status;
};
```

### Phase 2: データベース準備（2日）

#### 2.1 CHECK制約の段階的更新
```sql
-- Step 1: 制約を一時的に緩める（新旧共存）
ALTER TABLE rpa_queue
DROP CONSTRAINT IF EXISTS rpa_queue_status_check;

ALTER TABLE rpa_queue
ADD CONSTRAINT rpa_queue_status_check
CHECK (status IN ('pending', 'processing', 'uploaded', 'ready_to_print', 'done', 'failed'));

-- Step 2: 移行フラグ列の追加（ロールバック用）
ALTER TABLE rpa_queue
ADD COLUMN IF NOT EXISTS migration_phase INTEGER DEFAULT 0;
COMMENT ON COLUMN rpa_queue.migration_phase IS 'Migration tracking: 0=pre-migration, 1=migrated';
```

#### 2.2 新しいトリガー作成（名前変更）
```sql
-- 新しい名前でトリガー関数を作成
CREATE OR REPLACE FUNCTION auto_update_document_on_uploaded()
RETURNS trigger AS $$
DECLARE
    old_path TEXT;
    new_path TEXT;
BEGIN
    -- uploadedステータスで実行
    IF NEW.status = 'uploaded' AND OLD.status = 'processing' THEN
        -- 既存のファイル移動ロジック
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

    -- 通知は全ステータス変更で送信
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

-- 新しいトリガーを作成（古いものと並行稼働）
CREATE TRIGGER auto_update_document_on_uploaded
AFTER UPDATE ON rpa_queue
FOR EACH ROW EXECUTE FUNCTION auto_update_document_on_uploaded();
```

### Phase 3: Feature Flag導入（1日）

#### 3.1 環境変数での制御
```javascript
// .env
NEW_STATUS_FLOW=false  // 本番はfalse、ステージングはtrue

// config.js
const config = {
  features: {
    newStatusFlow: process.env.NEW_STATUS_FLOW === 'true'
  }
};
```

#### 3.2 APIエンドポイントの条件分岐
```javascript
// queueController.js
const updateToComplete = async (req, res) => {
  const { id } = req.params;

  // Feature flagで新旧フローを切り替え
  const targetStatus = config.features.newStatusFlow ? 'uploaded' : 'done';

  const query = `
    UPDATE rpa_queue
    SET status = $2, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND status = 'processing'
    RETURNING *
  `;

  const result = await db.query(query, [id, targetStatus]);
  // ...
};
```

### Phase 4: 段階的データ移行（3日）

#### 4.1 移行スクリプト作成
```sql
-- migration/migrate_status_batch.sql
CREATE OR REPLACE FUNCTION migrate_done_to_uploaded(batch_size INTEGER DEFAULT 100)
RETURNS TABLE(migrated_count INTEGER, remaining_count INTEGER) AS $$
DECLARE
    updated_count INTEGER;
    remaining INTEGER;
BEGIN
    -- バッチサイズ分だけ移行
    WITH batch AS (
        SELECT id FROM rpa_queue
        WHERE status = 'done'
        AND migration_phase = 0
        LIMIT batch_size
        FOR UPDATE SKIP LOCKED  -- 並行処理対応
    )
    UPDATE rpa_queue
    SET
        status = 'uploaded',
        migration_phase = 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id IN (SELECT id FROM batch);

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    -- 残件数を取得
    SELECT COUNT(*) INTO remaining
    FROM rpa_queue
    WHERE status = 'done' AND migration_phase = 0;

    RETURN QUERY SELECT updated_count, remaining;
END;
$$ LANGUAGE plpgsql;
```

#### 4.2 移行実行スケジュール
```bash
# 移行実行スクリプト
#!/bin/bash
# migrate_status.sh

echo "Starting status migration..."
while true; do
    result=$(psql -U postgres -d ageagekun -w -t -c "SELECT * FROM migrate_done_to_uploaded(100)")
    migrated=$(echo $result | cut -d'|' -f1)
    remaining=$(echo $result | cut -d'|' -f2)

    echo "Migrated: $migrated, Remaining: $remaining"

    if [ "$remaining" -eq 0 ]; then
        break
    fi

    # 負荷軽減のため1秒待機
    sleep 1
done
echo "Migration completed!"
```

### Phase 5: PAD更新（1日）

#### 5.1 条件付き更新
```javascript
// PADのAPI呼び出し部分
const completeUpload = async (queueId) => {
  // 環境変数でエンドポイントを切り替え
  const endpoint = process.env.NEW_STATUS_FLOW === 'true'
    ? `/api/queue/${queueId}/uploaded`
    : `/api/queue/${queueId}/complete`;

  return await fetch(endpoint, { method: 'PUT' });
};
```

### Phase 6: クリーンアップ（2日）

#### 6.1 古いコードの削除（Feature Flag確認後）
```sql
-- 古いトリガーの削除
DROP TRIGGER IF EXISTS auto_update_document ON rpa_queue;
DROP FUNCTION IF EXISTS auto_update_document_on_done();

-- 移行フラグ列の削除
ALTER TABLE rpa_queue DROP COLUMN IF EXISTS migration_phase;

-- doneステータスをCHECK制約から削除（最終段階）
ALTER TABLE rpa_queue
DROP CONSTRAINT rpa_queue_status_check;

ALTER TABLE rpa_queue
ADD CONSTRAINT rpa_queue_status_check
CHECK (status IN ('pending', 'processing', 'uploaded', 'ready_to_print', 'failed'));
```

## ロールバック計画（改訂版）

### 緊急ロールバック手順
```sql
-- Step 1: Feature Flagを無効化
-- .envで NEW_STATUS_FLOW=false

-- Step 2: データを元に戻す（移行フラグを使用）
UPDATE rpa_queue
SET
    status = 'done',
    updated_at = CURRENT_TIMESTAMP
WHERE migration_phase = 1;  -- 移行済みレコードのみ対象

-- Step 3: トリガーを元に戻す
DROP TRIGGER IF EXISTS auto_update_document_on_uploaded ON rpa_queue;
DROP FUNCTION IF EXISTS auto_update_document_on_uploaded();

-- 旧トリガーを再作成
CREATE TRIGGER auto_update_document
AFTER UPDATE ON rpa_queue
FOR EACH ROW EXECUTE FUNCTION auto_update_document_on_done();
```

## 監視項目（改訂版）

### Phase毎の成功基準
| Phase | 監視項目 | 成功基準 |
|-------|----------|----------|
| Phase 1 | API応答 | エラー率 < 0.1% |
| Phase 2 | トリガー実行 | 新旧トリガー両方が正常動作 |
| Phase 3 | Feature Flag | 切り替えが正常動作 |
| Phase 4 | データ移行 | 100%完了、データ不整合なし |
| Phase 5 | PAD連携 | アップロード成功率維持 |
| Phase 6 | クリーンアップ | 旧コード削除後も正常動作 |

### アラート設定
```sql
-- 移行監視用ビュー
CREATE VIEW migration_status AS
SELECT
    COUNT(*) FILTER (WHERE status = 'done') as old_done_count,
    COUNT(*) FILTER (WHERE status = 'uploaded') as uploaded_count,
    COUNT(*) FILTER (WHERE migration_phase = 1) as migrated_count,
    COUNT(*) FILTER (WHERE migration_phase = 0) as pre_migration_count
FROM rpa_queue;
```

## リスク管理（改訂版）

### 特定されたリスクと対策
| リスク | 影響度 | 対策 |
|--------|--------|------|
| Dual-read期間のパフォーマンス低下 | 中 | インデックス最適化、監視強化 |
| 移行中のデータ不整合 | 高 | トランザクション使用、ロック戦略 |
| Feature Flag切り替えミス | 中 | 自動テスト、段階的ロールアウト |
| ロールバック失敗 | 高 | 移行フラグ使用、バックアップ確保 |

## 実装チェックリスト

### Phase 0（事前調査）
- [ ] `status='done'`参照箇所の完全リスト作成
- [ ] 影響を受けるコンポーネントの特定
- [ ] 既存データの状態確認

### Phase 1（Dual-Read対応）
- [ ] バックエンドのdual-read実装
- [ ] フロントエンドの互換性対応
- [ ] ユニットテスト追加

### Phase 2（データベース準備）
- [ ] CHECK制約の更新
- [ ] 新トリガーの作成
- [ ] 移行フラグ列の追加

### Phase 3（Feature Flag）
- [ ] 環境変数設定
- [ ] 条件分岐の実装
- [ ] 切り替えテスト

### Phase 4（データ移行）
- [ ] 移行スクリプト作成
- [ ] ステージング環境でテスト
- [ ] 本番環境で段階的実行

### Phase 5（PAD更新）
- [ ] PADスクリプト修正
- [ ] エンドポイント切り替えテスト
- [ ] エラーハンドリング確認

### Phase 6（クリーンアップ）
- [ ] 旧コードの削除
- [ ] ドキュメント更新
- [ ] 最終動作確認

## 結論

この改訂版実装計画により、以下を実現します：

1. **安全な移行**: Dual-read期間により既存システムとの互換性維持
2. **段階的切り替え**: Feature Flagによる環境別制御
3. **確実なロールバック**: 移行フラグによる状態管理
4. **監視可能性**: 各フェーズでの成功基準と監視項目の明確化

Codex MCPの指摘事項を全て反映し、リスクを最小化した実装が可能です。