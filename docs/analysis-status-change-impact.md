# RPA Queue ステータス値変更による影響分析

## 1. 変更の概要

### 現在のステータス値
- `pending` - 処理待ち
- `processing` - 処理中 (RPA実行中)
- `done` - 完了
- `failed` - 失敗

### 提案する新しいステータス値
1. `pending` → 初期状態（処理待ち）
2. `processing` → RPA処理中（アップロード実行中）
3. `uploaded` → アップロード完了（新規追加）
4. `ready_to_print` → 印刷待ち（新規追加）
5. `done` → 全処理完了
6. `failed` → エラー発生

### 主要な変更点
現在のステータスフローでは、RPAがアップロードを完了すると即座に`done`になりますが、新しいフローでは：
- アップロード完了後は`uploaded`ステータス
- 印刷準備完了後は`ready_to_print`ステータス
- 最終的に全ての処理が完了して初めて`done`ステータスとなる

## 2. 影響を受ける主要コンポーネント

### 2.1 データベース層

#### CHECK制約の変更（必須）
**ファイル**: `schema/create_triggers.sql`, `schema/create_queue_table.sql`
```sql
-- 現在のCHECK制約
CHECK (status IN ('pending', 'processing', 'done', 'failed'))

-- 新しいCHECK制約
CHECK (status IN ('pending', 'processing', 'uploaded', 'ready_to_print', 'done', 'failed'))
```

#### トリガー関数への影響（重要）
**ファイル**: `schema/create_triggers.sql` (line 23), `schema/update_trigger_base_dir.sql` (line 11)

**問題点**: `auto_update_document_on_done()`トリガーがstatus='done'時に実行される
```sql
IF NEW.status = 'done' AND OLD.status != 'done' THEN
    -- ファイル移動とDocuments更新処理
```

**必要な変更**:
- トリガー条件を`status = 'uploaded'`に変更する必要がある
- または、新しいトリガーを追加して段階的に処理を行う

#### 完了検知トリガーへの影響
**ファイル**: `schema/create_triggers.sql` (line 110)
```sql
IF pending_count = 0 AND processing_count = 0 AND (NEW.status = 'done' OR NEW.status = 'failed') THEN
```
**必要な変更**: 新しいステータスも考慮に入れる必要がある

### 2.2 バックエンド層（Node.js）

#### API エンドポイントへの影響

**ファイル**: `backend/controllers/queueController.js`

1. **`updateToComplete`関数** (line 159-192)
   - 現在: `processing` → `done`への更新
   - 必要な変更:
     - `processing` → `uploaded`への更新関数を追加
     - `uploaded` → `ready_to_print`への更新関数を追加
     - `ready_to_print` → `done`への更新関数を追加

2. **`getPendingQueues`関数** (line 349-405)
   - 現在: `WHERE q.status != 'done'`でフィルタリング
   - 考慮点: 新しいステータスも「保留中」として扱われるため、ロジックは基本的に変更不要だが、動作確認が必要

3. **`getQueueOverview`関数** (line 234-271)
   - 現在: `pending`, `processing`, `done`, `failed`の集計
   - 必要な変更: `uploaded`, `ready_to_print`も集計対象に追加

**ファイル**: `backend/services/uploadProcessor.js` (line 144)
```javascript
COUNT(CASE WHEN status = 'done' THEN 1 END) as successful
```
**必要な変更**: 成功の定義を見直す（`done`のみか、`uploaded`も含むか）

### 2.3 フロントエンド層

**ファイル**: `frontend/js/app.js`

1. **完了判定ロジック** (lines 519, 525, 542, 562, 577)
   ```javascript
   q.status === 'done' || q.status === 'failed' || q.status === 'canceled'
   ```
   **必要な変更**: 新しいステータスを考慮した判定ロジックの更新

2. **進捗表示**
   - 現在は`done`を完了として表示
   - UIで新しいステータスの表示方法を検討する必要がある

**ファイル**: `frontend/js/ui.js` (line 467)
```javascript
item.status === 'done' ? 'queue-row--done' : ''
```
**必要な変更**: 新しいステータスに対応したCSSクラスの追加

### 2.4 テストスクリプト

**ファイル**: `test_rpa_trigger.ps1`
- lines 115, 141: `status = 'done'`への更新とリセット処理
- **必要な変更**: 新しいステータスフローに対応したテストケースの更新

## 3. 実装に伴う重要な考慮事項

### 3.1 後方互換性
- 既存のレコードで`status='done'`のものの扱い
- 移行期間中の処理フロー

### 3.2 PAD（Power Automate Desktop）との連携
- PADが現在`done`に更新している処理を`uploaded`に変更する必要がある
- PAD側のスクリプト修正が必要

### 3.3 WebSocket通知
- 新しいステータスに対応した通知イベントの追加
- クライアント側での新しいイベントハンドリング

### 3.4 UI/UX
- 新しいステータスの視覚的表現（アイコン、色など）
- ユーザーへの説明（ツールチップ、ヘルプテキスト）
- 各ステータスでの操作可能なアクションの定義

## 4. 推奨される実装手順

1. **データベース層の更新**
   - CHECK制約の更新
   - 新しいステータス用のトリガー作成
   - 既存トリガーの条件変更

2. **バックエンドAPIの更新**
   - 新しいステータス更新用エンドポイントの追加
   - 既存エンドポイントの修正
   - WebSocket通知の更新

3. **フロントエンドの更新**
   - 新しいステータスの表示対応
   - 状態遷移ロジックの更新
   - UIコンポーネントの調整

4. **PAD連携の更新**
   - PADスクリプトの修正
   - APIコール時のステータス値変更

5. **テストと検証**
   - エンドツーエンドテストの実施
   - 既存データとの互換性確認
   - パフォーマンステスト

## 5. リスクと対策

### リスク1: データ不整合
**対策**:
- トランザクション処理の徹底
- ステータス遷移の妥当性チェック

### リスク2: PAD処理の失敗
**対策**:
- PAD側の変更を段階的に実施
- フォールバック機能の実装

### リスク3: ユーザー混乱
**対策**:
- 明確なドキュメント作成
- UI上での視覚的な説明
- 移行期間の設定

## 6. 実装の優先順位

### Phase 1（必須）
- データベースCHECK制約の更新
- トリガー条件の修正
- 基本的なAPI更新

### Phase 2（重要）
- フロントエンドUI更新
- WebSocket通知の対応
- テストスクリプトの更新

### Phase 3（推奨）
- 詳細なエラーハンドリング
- パフォーマンス最適化
- ドキュメント整備

## 7. 影響を受けるファイル一覧

### データベース関連
- `schema/create_triggers.sql`
- `schema/create_queue_table.sql`
- `schema/update_trigger_base_dir.sql`
- `schema/recreate_rpa_queue.sql`
- `schema/add_payload_and_view.sql`
- `schema/update_view_base_dir.sql`

### バックエンド関連
- `backend/controllers/queueController.js`
- `backend/services/uploadProcessor.js`
- `backend/services/websocketService.js`
- `backend/test/testUpload.js`

### フロントエンド関連
- `frontend/js/app.js`
- `frontend/js/ui.js`
- `frontend/js/api.js`

### テスト・ツール関連
- `test_rpa_trigger.ps1`

### ドキュメント関連
- `docs/specifications/05-rpa-queue.md`
- `docs/specifications/03-database.md`
- `docs/specifications/01-core-upload.md`
- `docs/prd_old.md`

## 8. 結論

ステータス値の追加は、システム全体に広範な影響を与えます。特に以下の点が重要です：

1. **データベーストリガーの変更が最も重要** - 現在`done`で実行される処理を新しいステータスで適切に分配する必要がある
2. **PADとの連携部分の修正が必須** - PADが設定するステータス値を変更する必要がある
3. **UI/UXの考慮** - ユーザーが新しいステータスを理解しやすいように設計する必要がある

実装は段階的に行い、各段階で十分なテストを実施することを推奨します。