# AI報告書作成機能仕様書

## 機能概要
診察カルテをコピー＆ペーストすることで、AIが自動的に内容を要約し、居宅療養管理指導報告書を即座に生成する機能。**2ステップのシンプルなフロー**で、患者選択後にカルテ内容を入力しAI生成ボタンを押すだけで報告書が完成。確認・編集画面を省略し、直接報告書を新しいタブで表示する。

## 2ステップフロー詳細

### ステップ1: 患者選択
- 患者リストからカード形式で選択
- 検索機能（患者名、ID、ケアマネ名）
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

## エラーハンドリング

### APIキー未設定
- エラーメッセージ: "OpenAI APIキーが設定されていません"
- 対処: .env.localにOPENAI_API_KEYを設定

### カルテ内容不足
- 10文字未満: AI生成ボタンが無効
- 5000文字超過: 自動的に切り詰め

### AI生成エラー
- トースト通知でエラー表示
- 処理は継続（アプリケーションは停止しない）

## 実装ファイル

### フロントエンド
- `frontend/ai_report.html` - メインページ
- `frontend/js/ai_report_page.js` - ロジック実装
- `frontend/css/ai_report.css` - スタイリング
- `frontend/templates/kyotaku_report_template.html` - 報告書テンプレート

### バックエンド
- `backend/services/aiService.js` - AI処理サービス
- `backend/controllers/aiController.js` - APIコントローラー
- `backend/routes/ai.js` - ルーティング定義