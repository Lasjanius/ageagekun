# AI報告書作成機能仕様書

## 機能概要
診察カルテをコピー＆ペーストすることで、AIが自動的に内容を要約し、居宅療養管理指導報告書を即座に生成する機能。**2ステップのシンプルなフロー**で、患者選択後にカルテ内容を入力しAI生成ボタンを押すだけで報告書が完成。確認・編集画面を省略し、直接報告書を新しいタブで表示する。

## 2ステップフロー詳細

### ステップ1: 患者選択（v2.4.0で拡張）
- 患者リストからカード形式で選択
- 検索機能（患者名、ID、ケアマネ名）
- **🆕 AI報告書作成履歴の表示**
  - 各患者カードに最終作成日を表示
  - 今月作成済みバッジの表示
  - 未作成患者の視覚的識別（赤文字）
- **🆕 フィルター・ソート機能**
  - 並び順：患者名順、最新作成日順、古い作成日順
  - フィルター：今月未作成患者のみ表示
  - カテゴリー別フィルター（居宅等）
- 選択後「次へ」ボタンが有効化

### ステップ2: カルテ入力・報告書生成
- 患者情報自動表示（名前、生年月日、住所等）
- カルテ内容入力（10文字以上でボタン有効）
- AI生成ボタンクリックで：
  1. AI APIを呼び出し（2-3秒）
  2. 抽出情報をLocalStorageに保存
  3. 新タブで報告書を自動表示
  4. 確認・編集画面をスキップ

## AI処理詳細

### 使用モデル
- **OpenAI GPT-4o-mini**
- temperature: 0.3（一貫性重視）
- response_format: JSON

### AI抽出項目

#### 自動抽出情報
1. **介護度**: 要介護1～5、要支援1～2
2. **主病名**: カルテから診断名を抽出
3. **診察日**: カルテに記載された日付
4. **次回診察日**: 次回予定の抽出
5. **診療内容**: 3～8行の要約（バイタル、検査結果、処置等）
6. **生活指導**: 9カテゴリから自動選択
   - 糖尿病、高血圧、認知症、腎臓病
   - 寝たきり、誤嚥防止、転倒予防
   - 低栄養、脂質代謝異常

### プロンプト設計

```javascript
# 役割
あなたは在宅医療専門の医師です。以下のカルテ内容から、ケアマネージャーへの居宅療養管理指導報告書を作成してください。

## 診療内容の要約
以下の観点でカルテを要約してください（最低4行、最大8行、改行で整形）：
- バイタルサイン（血圧、脈拍、体温など）の数値と評価
- 検査結果（血糖値、HbA1c等）があれば具体的数値と測定日
- 前回からの症状変化（安定/改善/悪化）
- 行った処置（バルーン交換・胃瘻交換など）
- 処方薬の変更有無
- 特記事項

## 出力形式（JSON）
{
  "medical_content": "診療内容の要約",
  "selected_advice": "選択した指導カテゴリ",
  "care_level": "介護度",
  "primary_disease": "主病名",
  "exam_date": "診察日",
  "next_exam_date": "次回診察日"
}
```

## API仕様

### エンドポイント
```javascript
POST /api/ai/generate-kyotaku-report
Content-Type: application/json

{
  "patient_id": "99999999",
  "karte_content": "診察内容のテキスト..."
}

Response:
{
  "success": true,
  "data": {
    "care_level": "要介護3",
    "primary_disease": "糖尿病",
    "exam_date": "2025/1/18",
    "next_exam_date": "2025/2/18",
    "medical_content": "診療内容の要約...",
    "selected_advice": "diabetes",
    "advice_text": "糖尿病生活指導：間食を控えるように..."
  }
}
```

## レポート生成

### HTMLテンプレート
- **ファイル**: `frontend/templates/kyotaku_report_template.html`
- **データ受け渡し**: LocalStorage経由
- **印刷対応**: ブラウザの印刷機能でPDF化可能
- **編集機能**: 生成後の報告書を直接編集可能（v2.1.0より）

### テンプレート構造
```html
<!-- 居宅療養管理指導報告書 -->
<div class="report-container">
  <h1>居宅療養管理指導報告書</h1>

  <!-- 患者情報セクション -->
  <section class="patient-info">
    <div>患者氏名: <span id="patientName"></span></div>
    <div>介護度: <span id="careLevel"></span></div>
    <div>主病名: <span id="primaryDisease"></span></div>
  </section>

  <!-- 診療内容セクション -->
  <section class="medical-content">
    <h2>診療内容</h2>
    <pre id="medicalContent"></pre>
  </section>

  <!-- 生活指導セクション -->
  <section class="advice">
    <h2>生活上の留意事項</h2>
    <div id="adviceContent"></div>
  </section>
</div>
```

## インライン編集機能（v2.1.0 新機能）

### 概要
生成された報告書を新しいタブで開いた後、その場で直接編集できる機能。画面遷移なしに全フィールドの編集が可能で、印刷前の微調整が簡単に行える。

### 編集モード

#### 基本動作
1. **編集モード切替**: 右上の「✏️ 編集モード」ボタンをクリック
2. **編集可能フィールド**:
   - 患者情報（氏名、住所、生年月日等）
   - ケアマネージャー情報
   - 診療内容（長文テキスト）
   - 生活指導内容
3. **保存とリセット**:
   - 💾 保存: 編集内容をLocalStorageに保存
   - ↺ リセット: 元のAI生成内容に戻す
4. **自動保存**: リアルタイムでLocalStorageに保存

#### 技術仕様

##### contenteditable属性
```javascript
// 編集可能にする
element.setAttribute('contenteditable', 'true');

// 編集不可にする
element.setAttribute('contenteditable', 'false');
```

##### データ管理システム
```javascript
dataManager: {
    original: {},  // AI生成時のオリジナルデータ
    edited: {},    // ユーザー編集後のデータ
    advices: [],   // 選択されたアドバイス
}
```

##### 日本語IME対応
```javascript
// IME確定後に保存
element.addEventListener('compositionend', (e) => {
    const value = sanitizeText(e.target.textContent);
    dataManager.saveEdit(field, value);
});
```

##### HTMLサニタイズ
- ペースト時のHTMLタグ自動除去
- XSS攻撃防止
- テキストのみ許可

#### バリデーション
必須項目のチェック:
- 患者名
- 診察日
- 診療内容

#### 印刷対応
- `.no-print`クラスで編集UIを印刷時に非表示
- 編集内容は印刷に反映

## 居宅療養アドバイスセレクター機能（v2.1.0 新機能）

### 概要
編集モード時に、居宅療養アドバイス項目を最大3つまでプルダウンから選択・変更できる機能。タグスタイルの直感的なUIで管理。

### セレクターUI

#### コンポーネント構成
1. **選択済みタグエリア**: 選択したアドバイスをカラフルなタグで表示
2. **検索可能ドロップダウン**: リアルタイム検索でアドバイスをフィルタリング
3. **カウンター**: 現在の選択数/最大数（例: 2/3）
4. **削除ボタン**: 各タグに×ボタンで個別削除

#### アドバイスマスターデータ
9種類のアドバイスカテゴリー:
- 高血圧生活指導
- 糖尿病生活指導
- 腎臓病生活指導
- 脂質代謝異常症
- 物忘れ指導
- 転倒予防指導
- 寝たきり指導
- 低栄養指導
- 誤嚥防止指導

#### 動作仕様
```javascript
adviceSelector: {
    maxSelection: 3,  // 最大選択数
    selectedAdvices: [], // 選択済みアドバイス配列

    // アドバイス追加
    addAdvice(key) {
        if (this.selectedAdvices.length >= this.maxSelection) {
            showMessage('最大3つまで選択可能です');
            return;
        }
        // 追加処理...
    },

    // アドバイス削除
    removeAdvice(index) {
        this.selectedAdvices.splice(index, 1);
        // 再描画処理...
    }
}
```

#### データ構造
```javascript
selectedAdvices: [
    {
        key: 'hypertension',
        label: '高血圧生活指導',
        content: '減塩食や適度な運動を心がけましょう。',
        customContent: null,  // 将来的にカスタム編集対応
        order: 0
    },
    // ...最大3つまで
]
```

#### アクセシビリティ対応
- **ARIAラベル**: combobox、listbox、option
- **キーボード操作**:
  - ↑↓: オプション選択
  - Enter: 選択確定
  - Escape: ドロップダウン閉じる
- **タッチ対応**: 44px以上のタッチターゲット
- **スクリーンリーダー**: 選択状態のアナウンス

#### スタイリング
- グラデーション背景のタグ
- スライドインアニメーション
- レスポンシブデザイン（モバイル対応）

## ポップアップブロッカー対策（v2.1.1 新機能）

### 概要
ブラウザのポップアップブロッカーを回避するため、**Open-Firstパターン**を採用。ユーザーのクリック直後に新しいタブを開き、その後非同期処理を実行。

## データフロー簡略化（v2.1.2 新機能）

### 概要
編集機能のデータ管理を3層構造から1層構造にリファクタリング。リアルタイム自動保存により、ユーザーが混乱しない直感的な操作を実現。

### Before vs After

#### Before（v2.1.1まで）
```javascript
dataManager: {
    original: {},    // AI生成時のオリジナルデータ
    edited: {},      // ユーザー編集データ（分離管理）
    advices: []      // 選択されたアドバイス
}

// 編集時の複雑なフロー
1. ユーザー入力 → edited に保存
2. 「保存」ボタン → original と edited をマージ
3. kyotakuReportData に最終保存
```

#### After（v2.1.2以降）
```javascript
dataManager: {
    current: {}      // 単一データソース
}

// シンプルなフロー
1. ユーザー入力 → current に直接更新
2. デバウンス300ms → LocalStorage自動保存
3. 編集/閲覧は表示モードの切替のみ
```

### 実装詳細

#### リアルタイム自動保存
```javascript
// デバウンス付き保存（300ms遅延）
debouncedSave: debounce(function() {
    localStorage.setItem('kyotakuReportData', JSON.stringify(dataManager.current));
    updateSaveStatus('自動保存済み');
}, 300)

// フィールド更新時
updateField: function(field, value) {
    this.current[field] = value;
    this.debouncedSave();
}
```

#### 安全な移行処理
```javascript
function migrateDataIfNeeded() {
    if (localStorage.getItem('migration_v2_1_2_completed')) return;

    const original = JSON.parse(localStorage.getItem('originalReportData') || '{}');
    const edited = JSON.parse(localStorage.getItem('editedReportData') || '{}');
    const current = JSON.parse(localStorage.getItem('kyotakuReportData') || '{}');

    // 既存データを優先してマージ
    const finalData = Object.keys(current).length > 0 ? current : {...original, ...edited};

    localStorage.setItem('kyotakuReportData', JSON.stringify(finalData));
    localStorage.setItem('migration_v2_1_2_completed', Date.now().toString());
}
```

#### ボタン機能の簡略化
- **編集/閲覧ボタン**: 表示モードの切替のみ（データ操作なし）
- **リセットボタン**: 削除（混乱を避けるため）
- **保存ボタン**: 非表示（将来のDB保存機能用に保持）

### 利点
1. **直感的操作**: 編集すれば自動保存
2. **混乱の排除**: 「編集したのに保存してない」状況がなくなる
3. **パフォーマンス**: デバウンスによりLocalStorage負荷軽減
4. **安全性**: 既存データを壊さない移行処理

### 実装詳細

#### Open-Firstパターン
```javascript
// 1. クリック直後に新タブを開く（同期的）
const reportWindow = window.open('about:blank', '_blank');

// 2. ローディング画面を表示
reportWindow.document.write(loadingHTML);

// 3. 非同期AI処理を実行
const aiData = await this.callAIAPI(reportData);

// 4. 処理完了後、既存のタブにナビゲート
reportWindow.location.href = reportUrl;
```

#### ローディング画面
- スピナーアニメーション付き
- 「報告書を生成中...」メッセージ
- プロフェッショナルなデザイン

#### エラー処理
- ポップアップブロック検出
- 親切なエラーメッセージ表示
- エラー時の自動ウィンドウクローズ

## エラーハンドリング

### ポップアップブロック
- エラーメッセージ: "ポップアップがブロックされています。ポップアップを許可してください。"
- 対処: ブラウザのポップアップ設定を確認

### APIキー未設定
- エラーメッセージ: "OpenAI APIキーが設定されていません"
- 対処: .env.localにOPENAI_API_KEYを設定

### カルテ内容不足
- 10文字未満: AI生成ボタンが無効
- 5000文字超過: 自動的に切り詰め

### AI生成エラー
- トースト通知でエラー表示
- 開いたウィンドウを自動クローズ
- 処理は継続（アプリケーションは停止しない）

## PDF保存機能（v2.2.0 新機能）

### 概要
生成・編集した居宅療養管理指導報告書をPDFとして保存し、Documentsテーブルに登録する機能。プレビュー画面と完全に一致したPDFを生成。

### 保存フロー

#### ワークフロー
1. 報告書の生成・編集完了
2. 「この内容で保存」ボタンをクリック
3. プレビューHTMLをそのままPDF化
4. ローカルファイルシステムに保存
5. Documentsテーブルに登録
6. 2秒後に患者選択画面へ自動遷移

### 技術仕様

#### WYSIWYG PDF生成
プレビュー画面で見たとおりのPDFを生成するため、HTMLをそのままPDF化する方式を採用。

##### フロントエンド処理
```javascript
exportReportHtml: function() {
    // DOM全体を複製
    const clonedDocument = document.documentElement.cloneNode(true);

    // 編集UI要素を削除
    const elementsToRemove = clonedDocument.querySelectorAll([
        '.no-print',
        '.edit-controls',
        '.save-status',
        '.save-button',
        '[data-advice-selector]',
        'script'
    ].join(','));

    elementsToRemove.forEach(element => element.remove());

    // contenteditable属性を削除
    const editableElements = clonedDocument.querySelectorAll('[contenteditable]');
    editableElements.forEach(element => {
        element.removeAttribute('contenteditable');
    });

    return '<!DOCTYPE html>\n' + clonedDocument.outerHTML;
}
```

##### バックエンド処理
```javascript
// pdfService.js
async createPdfFromHtml(htmlContent, patientId) {
    const { patientDir, fullPath } = formatters.buildFilePath(
        patientId,
        formatters.generateFileName()
    );

    // Puppeteerで直接PDF化
    const result = await this.savePDFToFile(htmlContent, fullPath);

    return {
        fileName: path.basename(fullPath),
        patientDir,
        fullPath: result.filePath
    };
}
```

#### データベース登録
```sql
INSERT INTO Documents (
    fileName,
    patientID,
    Category,
    FileType,
    pass,
    base_dir,
    isUploaded,
    created_at
) VALUES (
    '20250918居宅療養管理指導報告書.pdf',
    '99999999',
    '居宅',
    'pdf',
    'C:\\path\\to\\file.pdf',
    'C:\\path\\to\\directory',
    false,
    CURRENT_TIMESTAMP
)
```

### API仕様

#### エンドポイント
```javascript
POST /api/ai/save-kyotaku-report
Content-Type: application/json

{
    "reportData": { // 報告書データ（後方互換性用）
        "patientId": "99999999",
        "patientName": "田中太郎",
        "content": "診療内容...",
        // ...
    },
    "patientId": "99999999",
    "html": "<!DOCTYPE html>..." // プレビューHTML全体
}

Response:
{
    "success": true,
    "data": {
        "fileId": 12,
        "fileName": "20250918居宅療養管理指導報告書.pdf",
        "filePath": "C:\\Users\\...\\patients\\99999999\\20250918居宅療養管理指導報告書.pdf",
        "patientId": "99999999",
        "category": "居宅",
        "fileType": "pdf",
        "createdAt": "2025-09-18T10:12:15.383Z"
    },
    "message": "Kyotaku report PDF saved successfully"
}
```

### 実装上の考慮事項

#### パフォーマンス最適化
1. **HTMLサイズ制限**: Expressのボディサイズを1MBに拡張
```javascript
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
```

2. **不要要素の削除**: 編集UI要素をPDF化前に除去
3. **Puppeteerブラウザ再利用**: シングルトンパターンで起動コスト削減

#### 日本語対応
- Puppeteer環境での日本語フォント対応
- インラインCSSによるフォント指定
- 文字化け防止のためのエンコーディング管理

#### セキュリティ
- XSS防止: script要素の完全除去
- contenteditable属性の削除
- インタラクティブ要素の無効化

### ファイル管理

#### 保存先構造
```
patients/
├── 99999999/
│   ├── 20250918居宅療養管理指導報告書.pdf
│   ├── 20250919居宅療養管理指導報告書.pdf
│   └── uploaded/  # アップロード済みファイル
│       └── 20250917居宅療養管理指導報告書.pdf
```

#### ファイル名規則
- フォーマット: `YYYYMMDD居宅療養管理指導報告書.pdf`
- 患者ID: 8桁ゼロ埋め
- 日付: システム日付（JST）

### エラーハンドリング

#### PDF生成エラー
- Puppeteer起動失敗
- メモリ不足
- ディスク容量不足

#### データベースエラー
- トランザクションロールバック
- 重複ファイル名チェック

#### ユーザーフィードバック
- 保存中: ローディングアイコン表示
- 成功: ✅ PDFを保存しました
- エラー: ❌ 詳細なエラーメッセージ

## 実装ファイル

### フロントエンド
- `frontend/ai_report.html` - メインページ（v2.4.0でフィルターUI追加）
- `frontend/js/ai_report_page.js` - ロジック実装（v2.4.0でフィルター処理追加）
- `frontend/css/ai_report.css` - スタイリング（v2.4.0でフィルターコンポーネント追加）
- `frontend/templates/kyotaku_report_template.html` - 報告書テンプレート（編集・PDF保存機能含む）

### バックエンド
- `backend/services/aiService.js` - AI処理サービス
- `backend/services/pdfService.js` - PDF生成サービス（Puppeteer使用）
- `backend/controllers/aiController.js` - APIコントローラー（PDF保存機能含む、v2.4.0で`is_ai_generated`フラグ追加）
- `backend/controllers/patientsController.js` - 患者APIコントローラー（v2.4.0でAI報告書ステータス取得機能追加）
- `backend/routes/ai.js` - ルーティング定義
- `backend/utils/formatters.js` - ファイル名・パス生成ユーティリティ