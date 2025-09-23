# PDF連結印刷機能仕様書（v5.0.2）

## 概要
ready_to_printステータスのPDFドキュメントを選択して連結し、一括印刷可能な単一のPDFファイルを生成する機能。ユーザーは最大200件まで選択でき、生成されたPDFは新しいタブで自動表示される。

## 更新履歴
- **v5.0.0 (2025-09-22)**: 初期実装
- **v5.0.1 (2025-09-23)**: WebSocket通信問題を修正
- **v5.0.2 (2025-09-23)**: 完了通知をモーダル表示に改善

## 主要機能要件

### 基本仕様
- **実装方式**: サーバーサイド処理（Node.js + pdf-lib）
- **対象ドキュメント**: ready_to_printステータスの全ドキュメント
- **最大選択件数**: 200件（UI制限）
- **処理方式**: 非同期処理（Bull/BullMQによるジョブキュー）
- **出力形式**: 単一PDF
- **表示方法**: 新しいタブで自動表示
- **ステータス更新**: 連結成功時に選択されたドキュメントをdoneに変更

### UIフロー
1. index.htmlのキューモニタリングモーダルに「まとめて印刷」ボタンを設置
2. ボタンクリックで印刷対象選択モーダルを表示
3. ready_to_printドキュメントの一覧表示（チェックボックス付き）
4. デフォルト全選択（最大200件）、「すべて選択」「すべて解除」ボタン
5. ソート機能（患者名/ファイル名/作成日時）
6. 「PDFを連結」ボタンで非同期処理開始
7. プログレスバー表示（X/Y件処理中）
8. **完了モーダル表示**（v5.0.2追加）
   - "X件のドキュメントを連結しました。印刷か保存を行ってください。"
   - 失敗件数がある場合は橙色で警告表示
   - OKボタンまたはオーバーレイクリックで閉じる
9. モーダルを閉じると新しいタブでPDF自動表示
10. 成功したドキュメントのステータスをdoneに更新

## ステータスフロー

```
ready_to_print（印刷待ち）
    ↓
merging（連結処理中）
    ↓
成功 → done（完了）
失敗 → merging（エラー可視化のため維持）
```

## 技術仕様

### 使用ライブラリ
```json
{
  "dependencies": {
    "pdf-lib": "^1.17.1",
    "bull": "^4.10.0",
    "fs-extra": "^11.1.0"
  }
}
```

### データ構造

#### 印刷対象選択リスト
```javascript
{
  documents: [
    {
      id: number,           // rpa_queue.id
      fileId: number,       // Documents.fileID
      patientId: number,
      patientName: string,
      fileName: string,
      category: string,
      createdAt: Date,
      filePath: string,     // Documents.pass
      selected: boolean     // 選択状態（デフォルト: true）
    }
  ],
  sortBy: string,          // 'patientName' | 'fileName' | 'createdAt'
  sortOrder: string        // 'asc' | 'desc'
}
```

## データベース設計

### batch_printsテーブル
```sql
CREATE TABLE IF NOT EXISTS batch_prints (
  id SERIAL PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,      -- 生成されたPDFファイル名
  file_path VARCHAR(500) NOT NULL,      -- ファイルの保存パス
  file_size INTEGER,                    -- ファイルサイズ（バイト）
  page_count INTEGER,                   -- 総ページ数
  document_count INTEGER,               -- 連結したドキュメント数
  document_ids INTEGER[],               -- 選択されたrpa_queue.id配列
  success_ids INTEGER[],                -- 正常に処理されたID配列
  failed_ids INTEGER[],                 -- エラーになったID配列
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX idx_batch_prints_created_at ON batch_prints(created_at);
```

## API設計

### エンドポイント一覧

#### 1. 印刷待ちドキュメント取得
```
GET /api/batch-print/ready-documents
```
**レスポンス**:
```json
{
  "success": true,
  "data": {
    "documents": [
      {
        "id": 25,
        "fileId": 15,
        "patientId": 99999998,
        "patientName": "田中太郎",
        "fileName": "居宅療養管理指導報告書_20250121.pdf",
        "category": "居宅",
        "createdAt": "2025-01-21T10:30:00.000Z",
        "filePath": "C:\\Users\\hyosh\\Desktop\\allright\\ageagekun\\patients\\99999998\\uploaded\\居宅療養管理指導報告書_20250121.pdf"
      }
    ],
    "total": 15
  }
}
```

#### 2. PDF連結処理
```
POST /api/batch-print/merge
```
**リクエストボディ**:
```json
{
  "documentIds": [25, 26, 27],
  "sortBy": "patientName",
  "sortOrder": "asc"
}
```

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "jobId": "job_123",
    "status": "processing",
    "message": "PDF連結処理を開始しました"
  }
}
```

#### 3. PDF表示
```
GET /api/batch-print/view/:batchId
```
- Content-Type: application/pdf
- 新しいタブで直接表示

#### 4. 連結PDF履歴取得
```
GET /api/batch-print/history
```
**レスポンス**:
```json
{
  "success": true,
  "data": {
    "prints": [
      {
        "id": 1,
        "fileName": "batch_20250122_103045.pdf",
        "fileSize": 25165824,
        "pageCount": 450,
        "documentCount": 150,
        "createdAt": "2025-01-22T10:30:45.000Z",
        "isOld": false
      }
    ],
    "oldCount": 3  // 60日以上経過した件数
  }
}
```

#### 5. PDF削除（物理削除）
```
DELETE /api/batch-print/:batchId
```
**処理内容**:
1. 確認なしに即座に物理ファイルを削除
2. batch_printsテーブルからレコードを削除
3. 復元不可能

## 処理フロー

### 非同期PDF連結処理
```javascript
// backend/services/batchPrintService.js
async function mergePDFs(documentIds) {
  const mergedPdf = await PDFDocument.create();
  const results = { success: [], failed: [] };

  for (const docId of documentIds) {
    try {
      // ステータスをmergingに更新
      await updateQueueStatus(docId, 'merging');

      // PDFファイル読み込み
      const filePath = await getFilePathFromQueue(docId);
      const pdfBytes = await fs.readFile(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes, {
        ignoreEncryption: true  // 破損ファイル対策
      });

      // ページをコピー
      const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));

      // 成功したらdoneに更新
      await updateQueueStatus(docId, 'done');
      results.success.push(docId);

      // 進捗通知
      io.emit('batchPrintProgress', {
        current: results.success.length + results.failed.length,
        total: documentIds.length
      });

    } catch (error) {
      console.error(`PDF処理エラー (ID: ${docId}):`, error);
      results.failed.push(docId);
      // エラーの場合はmergingのまま（可視化）
    }
  }

  // 連結PDFを保存
  const pdfBytes = await mergedPdf.save();
  const fileName = `batch_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`;
  const filePath = path.join(BATCH_PRINT_DIR, fileName);
  await fs.writeFile(filePath, pdfBytes);

  // batch_printsテーブルに記録
  const batchRecord = await saveBatchPrint({
    file_name: fileName,
    file_path: filePath,
    file_size: pdfBytes.length,
    page_count: mergedPdf.getPageCount(),
    document_count: documentIds.length,
    document_ids: documentIds,
    success_ids: results.success,
    failed_ids: results.failed
  });

  return batchRecord;
}
```

### WebSocket進捗通知
```javascript
// リアルタイム進捗更新
socket.on('batchPrintProgress', (data) => {
  updateProgressBar(data.current, data.total);
  updateProgressText(`処理中... (${data.current}/${data.total}件)`);
});

// 処理完了通知
socket.on('batchPrintComplete', (data) => {
  // 新しいタブでPDFを開く
  window.open(`/api/batch-print/view/${data.batchId}`, '_blank');

  // 結果を表示
  showCompletionMessage(data.successCount, data.failedCount);

  // キューリストを更新
  refreshQueueList();
});
```

## フロントエンド実装

### 選択制限（200件）
```javascript
function selectAllDocuments() {
  const MAX_SELECTION = 200;
  const documents = getReadyToPrintDocuments();

  if (documents.length > MAX_SELECTION) {
    // 上位200件のみ選択
    showWarning(`最大200件まで選択可能です。上位200件を選択しました。`);
    documents.slice(0, MAX_SELECTION).forEach(doc => doc.selected = true);
  } else {
    documents.forEach(doc => doc.selected = true);
  }

  updateSelectionCount();
}
```

### 削除処理（物理削除）
```javascript
async function deleteBatchPrint(batchId) {
  if (!confirm('このPDFを削除しますか？\nこの操作は取り消せません。')) {
    return;
  }

  try {
    const response = await fetch(`/api/batch-print/${batchId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      showToast('PDFを削除しました');
      refreshBatchPrintHistory();
    }
  } catch (error) {
    showToast('削除に失敗しました', 'error');
  }
}
```

### 60日アラート（通知のみ）
```javascript
// 毎日1回チェック（ページロード時）
async function checkOldBatchPrints() {
  const response = await fetch('/api/batch-print/history');
  const data = await response.json();

  if (data.data.oldCount > 0) {
    showNotification({
      type: 'info',
      title: '古いPDFがあります',
      message: `${data.data.oldCount}件のPDFが60日以上経過しています`,
      actions: [
        { label: '履歴を確認', action: openBatchPrintHistory },
        { label: '閉じる', action: dismissNotification }
      ]
    });
  }
}
```

## ファイル構造

```
patients/
├── batch_prints/              # 連結PDF保存先
│   ├── batch_20250122_103045.pdf
│   ├── batch_20250122_141520.pdf
│   └── ...
├── 99999998/
│   └── uploaded/
│       └── *.pdf
└── ...
```

## エラー処理

### 破損PDFのスキップ
- pdf-libの`load`メソッドでエラーが発生した場合、そのドキュメントをスキップ
- スキップしたドキュメントはmergingステータスのまま維持（エラー可視化）
- 処理完了後、スキップ件数をユーザーに通知

### ポップアップブロッカー対策
```javascript
// PDF表示時のポップアップブロッカー対策
const newTab = window.open('', '_blank');
if (newTab) {
  // 処理完了後にURLを設定
  newTab.location.href = `/api/batch-print/view/${batchId}`;
} else {
  // ブロックされた場合は手動リンクを表示
  showManualOpenLink(batchId);
}
```

## セキュリティ考慮事項

### ファイルアクセス制御
- Documents.passのパスが実在することを検証
- パストラバーサル攻撃の防止（相対パス禁止）
- 削除時は権限チェック（将来的な認証実装時）

## パフォーマンス最適化

### メモリ管理
- PDF処理を逐次実行（並列処理しない）
- 各PDF処理後にガベージコレクションを促進
- 最大200件制限によりメモリ使用量を抑制

### 処理時間目安
- 50件: 1-2分
- 100件: 3-5分
- 200件: 8-10分

## 実装チェックリスト

### バックエンド
- [ ] pdf-lib, bullのインストール
- [ ] batchPrintService.jsの作成
- [ ] APIエンドポイントの実装
- [ ] ジョブキューの設定
- [ ] WebSocket進捗通知

### フロントエンド
- [ ] キューモニタリングモーダルへのボタン追加
- [ ] 印刷対象選択モーダルの作成（200件制限）
- [ ] プログレスバー実装
- [ ] 連結PDF履歴管理画面
- [ ] 60日アラート機能

### データベース
- [ ] batch_printsテーブル作成
- [ ] インデックス設定
- [ ] patients/batch_prints/ディレクトリ作成

### テスト
- [ ] 200件での連結テスト
- [ ] 破損PDFのスキップ確認
- [ ] 新しいタブ表示確認
- [ ] 削除機能の動作確認
- [ ] 60日アラート表示確認

## 制限事項

1. **最大選択件数**: 200件まで
2. **処理時間**: 最大10分程度
3. **同時実行**: 1ユーザーあたり1処理のみ
4. **対応形式**: PDFファイルのみ
5. **削除**: 物理削除のため復元不可

## 既知の問題と修正履歴

### v5.0.1 (2025-09-23) - WebSocket通信問題の修正
**問題**:
- WebSocketリスナーが登録されず、進捗表示が "0 / 0 件" のまま更新されない
- バックエンド処理完了後もフロントエンドが反応しない

**原因**:
- `window.App`が未定義（App.jsで`window.App = App`の記述が欠落）
- APIレスポンス後のDOM更新処理不足

**修正内容**:
- `frontend/js/App.js`: window.Appへの代入を追加
- `frontend/js/batchPrint.js`: startMerge()とhandleProgress()でDOM更新処理を追加
- WebSocket未接続時の再試行ロジックとデバッグログを実装

### v5.0.2 (2025-09-23) - 完了通知のUX改善
**改善点**:
- トースト通知では見逃しやすく、次のアクション（印刷・保存）が不明確

**変更内容**:
- 完了時にモーダル表示（showCompletionModal()メソッド追加）
- "X件のドキュメントを連結しました。印刷か保存を行ってください。"メッセージ
- OKボタンまたはオーバーレイクリックでモーダルを閉じてPDFを開く
- 失敗件数がある場合は橙色で警告表示

---

*仕様書バージョン: 1.2*
*最終更新日: 2025年9月23日*
*対応システムバージョン: v5.0.2*