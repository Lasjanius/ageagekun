# Product Requirements Document (PRD)
# AI居宅療養管理指導報告書 自動生成機能

## 1. 概要

### 1.1 プロダクト概要
AI居宅療養管理指導報告書自動生成機能は、医療従事者が患者の診療記隂（カルテ）から居宅療養管理指導報告書を自動生成するシステムです。Azure OpenAI (gpt-4o-mini)を活用し、カルテ内容から適切な医療情報を抽出・整理して、標準化された報告書を生成します。

### 1.2 目的
- 報告書作成時間の短縮（手動作成30分 → AI生成3秒）
- 報告書品質の標準化
- 医療従事者の事務作業負担軽減
- 正確で一貫性のある報告書の作成

## 2. 機能仕様

### 2.1 主要機能

#### 2.1.1 AI報告書作成ページ（ai_report.html）
1. **3ステップウィザード形式**
   - ステップ1: 患者選択
   - ステップ2: カルテ入力とAI生成
   - ステップ3: 追加情報入力と報告書生成

2. **患者選択機能（ステップ1）**
   - データベースから全患者情報を取得・表示
   - リアルタイム検索フィルタリング
   - 患者ID、患者名、ケアマネージャー名での検索
   - グリッド形式での患者カード表示

3. **カルテ入力・AI生成機能（ステップ2）**
   - フリーテキストでの診療内容入力
   - バイタルサイン、検査値、症状、処方内容の記載
   - 「AI生成」ボタンによる即時処理
   - AI抽出結果のステップ3への自動反映

4. **追加情報確認・報告書生成（ステップ3）**
   - AI抽出データの確認・編集
     - 介護度
     - 主病名
     - 診察日
     - 次回診察日
   - 「報告書を生成する」ボタンで最終出力

5. **報告書表示・印刷機能**
   - LocalStorageを使用したデータ受け渡し
   - A4単ページでの印刷最適化
   - 印刷後の自動データクリア

### 2.2 詳細ユーザーフロー
```
1. http://localhost:3000/ai_report.html または 3001 にアクセス
   ↓
2. 「AI報告書作成」ページが開く
   ↓
3. ステップ1: 患者選択
   - 患者カードをクリックして選択
   - 「次へ」ボタンが有効化
   ↓
4. ステップ2: カルテ入力
   - カルテ内容を貼り付け（10文字以上）
   - 「AI生成」ボタンをクリック
   - AI処理中インジケーター表示
   ↓
5. AIによる自動処理
   - カルテから情報抽出
   - 診療内容要約（最大8行）
   - 生活指導選択（1項目）
   - 各種日付・情報の抽出
   ↓
6. ステップ3: 追加情報確認
   - AI抽出データが自動入力される
   - 必要に応じて編集可能
   - 「報告書を生成する」ボタンをクリック
   ↓
7. 報告書の新規タブ表示
   - LocalStorageからデータ読み込み
   - テンプレートに動的反映
   - 印刷可能な状態で表示
   ↓
8. 印刷実行
   - Ctrl+P または印刷ボタン
   - 印刷後LocalStorageクリア
```

## 3. 技術仕様

### 3.1 システムアーキテクチャ
```
┌─────────────────────────────────────────────────┐
│                   ユーザー（ブラウザ）             │
└────────────┬────────────────────────┬───────────┘
             ↓                        ↓
    http://localhost:3000    http://localhost:3001
             ↓                        ↓
┌────────────────────────┐  ┌───────────────────┐
│  Backend Server (3000)  │  │ Frontend Dev (3001)│
│  - Express.js          │  │  - Static Server   │
│  - API エンドポイント   │  │  - HTML/CSS/JS    │
│  - 静的ファイル配信     │  │  - Templates      │
│  - WebSocket           │  └───────────────────┘
└────────────┬───────────┘
             ↓
┌────────────────────────┐  ┌───────────────────┐
│     PostgreSQL DB      │  │  Azure OpenAI API  │
│   - patients           │  │  - gpt-4o-mini     │
│   - Documents          │  │  - Text Generation│
│   - rpa_queue          │  └───────────────────┘
└────────────────────────┘
```

### 3.2 サーバー構成

#### 3.2.1 バックエンドサーバー（backend/server.js）
```javascript
// ポート3000で動作
const express = require('express');
const path = require('path');

// 静的ファイル配信（フロントエンドファイル）
app.use(express.static(path.join(__dirname, '../frontend')));

// APIルート
app.use('/api/patients', patientsRoutes);
app.use('/api/ai', aiRoutes);
```

#### 3.2.2 フロントエンド開発サーバー（frontend/server.js）
```javascript
// ポート3001で動作
// クエリパラメータ対応済み
const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
let pathname = parsedUrl.pathname;
```

### 3.3 データフロー

#### 3.3.1 LocalStorage専用設計
**重要：URLパラメータを使用せず、LocalStorageのみでデータを受け渡します。**

```javascript
// ai_report_page.js - データ保存
localStorage.setItem('kyotakuReportData', JSON.stringify({
  patientName: '患者名',
  medicalContent: 'AI生成診療内容',
  adviceText: '生活指導内容',
  advices: ['dementia'], // 選択されたアドバイスカテゴリ
  age: 80, // 数値のみ（単位なし）
  // ... その他のフィールド
}));

// URL生成（patientIdパラメータなし）
const reportUrl = `${window.location.protocol}//${window.location.host}/templates/kyotaku_report_template.html`;
window.open(reportUrl, '_blank');
```

#### 3.3.2 テンプレートのデータ読み込み優先順位
```javascript
// kyotaku_report_template.html - データ読み込み優先順位
1. LocalStorageチェック（最優先）
2. URLパラメータ（レガシー、非推奨）
3. エラー表示（データなし）
```

### 3.4 API仕様

#### 3.4.1 AI報告書生成API
```
POST /api/ai/generate-kyotaku-report
```

**Request Body:**
```json
{
  "patient_id": 99999998,
  "karte_content": "2024/1/15 訪問診療\nBP 135/82..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "patient_name": "患者名",
    "birthdate": "1940年5月15日",
    "age": 84,
    "address": "住所",
    "cm_name": "ケアマネージャー名",
    "homecare_office": "事業所名",

    "period_start": "2024年1月1日",
    "period_end": "2024年1月31日",

    "exam_date": "2024/1/15",
    "next_exam_date": "2024/2/15",
    "doctor_name": "たすくホームクリニック医師",

    "care_level": "要介護3",
    "primary_disease": "高血圧症、糖尿病",

    "medical_content": "血圧は132/78mmHgで前回より改善傾向。\nHbA1c 7.0%で血糖コントロール良好。",
    "selected_advice": "diabetes",
    "advice_text": "糖尿病生活指導：間食を控えるように。服薬中の方は低血糖症状にも要注意。"
  }
}
```

### 3.5 AI処理仕様

#### 3.5.1 Azure OpenAI API設定
```javascript
const completion = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    {
      role: "system",
      content: "あなたは経験豊富な在宅医療専門医です。必ずJSON形式で回答してください。"
    },
    {
      role: "user",
      content: prompt
    }
  ],
  temperature: 0.3,  // 低温で一貫性を高める
  max_tokens: 1000,
  response_format: { type: "json_object" }
});
```

#### 3.5.2 AIによる自動抽出項目
1. **介護度** - カルテから「要介護」「要支援」を検出
2. **主病名** - 診断名、病名を抽出
3. **診察日** - カルテ記載日付を抽出
4. **次回診察日** - 「次回」「○月後」から推定
5. **診療内容要約** - 最大8行でバイタル、検査値、症状を要約
6. **生活指導選択** - 9カテゴリから最重要1つを選択
   - diabetes（糖尿病）
   - hypertension（高血圧）
   - dementia（認知症）
   - kidney（腎臓病）
   - bedridden（寝たきり）
   - aspiration（誤嚥防止）
   - fall_prevention（転倒予防）
   - malnutrition（低栄養）
   - lipid（脂質異常症）

## 4. UI/UX仕様

### 4.1 AI報告書作成ページデザイン

#### 4.1.1 ページレイアウト
```
┌────────────────────────────────────────────┐
│            AI報告書作成                     │
├────────────────────────────────────────────┤
│  [1.患者選択] → [2.カルテ入力] → [3.確認]    │
├────────────────────────────────────────────┤
│                                            │
│     ステップごとのコンテンツエリア            │
│                                            │
├────────────────────────────────────────────┤
│  [前へ]              [次へ/AI生成/生成する]  │
└────────────────────────────────────────────┘
```

#### 4.1.2 スタイル仕様
- **プライマリカラー**: #007bff（青）
- **成功カラー**: #28a745（緑）
- **警告カラー**: #ffc107（黄）
- **エラーカラー**: #dc3545（赤）
- **背景**: #f5f7fa（薄グレー）
- **カード**: 白背景 + box-shadow

### 4.2 報告書テンプレート仕様

#### 4.2.1 データバインディング処理
```javascript
// プレースホルダー置換ロジック
document.querySelectorAll('[data-field]').forEach(element => {
    const field = element.getAttribute('data-field');
    // periodフィールドは特別処理
    if (field === 'period') return;

    let value = data[field];
    // birthdateの日付フォーマット変換
    if (field === 'birthdate' && value) {
        // YYYY-MM-DD → YYYY年MM月DD日
        const dateMatch = value.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (dateMatch) {
            value = `${dateMatch[1]}年${parseInt(dateMatch[2])}月${parseInt(dateMatch[3])}日`;
        }
    }

    if (value !== undefined && value !== null) {
        element.textContent = element.textContent.replace(/\{\{[^}]*?\}\}/, value);
    }
});
```

#### 4.2.2 アドバイス自動選択アルゴリズム
```javascript
// 主病名に基づくアドバイス推測
if (!data.advices || data.advices.length === 0) {
    const primaryDisease = data.primaryDisease || '';
    let defaultAdvices = [];

    if (primaryDisease.includes('認知症') || primaryDisease.includes('アルツハイマー')) {
        defaultAdvices.push('dementia');
    }
    if (primaryDisease.includes('高血圧')) {
        defaultAdvices.push('hypertension');
    }
    if (primaryDisease.includes('糖尿病')) {
        defaultAdvices.push('diabetes');
    }

    // デフォルト: 転倒予防
    if (defaultAdvices.length === 0) {
        defaultAdvices.push('fall_prevention');
    }
}
```

### 4.3 報告書テンプレートデザイン

#### 4.3.1 A4印刷最適化レイアウト
```
┌─────────────────────────────────────────────┐
│          居宅療養管理指導報告書               │
│         対象期間: 2024年1月1日～31日          │
├─────────────────────────────────────────────┤
│ 送信元: たすくホームクリニック               │
│ 送信先: ケアマネージャー様                   │
├─────────────────────────────────────────────┤
│ 患者情報:                                   │
│   患者名: ○○○○ 様                        │
│   生年月日: ○年○月○日（○歳）              │
│   住所: ○○○○                            │
├─────────────────────────────────────────────┤
│ 診察情報:                                   │
│   診察日: ○年○月○日                       │
│   次回診察日: ○年○月○日                    │
│   介護度: 要介護○                          │
│   主病名: ○○○                            │
├─────────────────────────────────────────────┤
│ 診療内容:                                   │
│   [AI生成された診療内容が表示される]          │
│                                            │
│ 生活指導:                                   │
│   ☑ 選択された指導項目                      │
└─────────────────────────────────────────────┘
```

## 5. セキュリティ仕様

### 5.1 環境変数管理（.env.local）
```
OPENAI_API_KEY=sk-xxxxxxxxxxxxx
DATABASE_URL=postgresql://postgres:rad1ohead@localhost:5432/ageagekun
PORT=3000
CORS_ORIGIN=*
AI_MODEL=gpt-4o-mini
```

### 5.2 データ保護
- LocalStorageの使用は一時的（印刷後自動クリア）
- 患者情報はサーバー側でのみ処理
- APIキーはクライアントに露出しない

## 6. エラー処理

### 6.1 AIサービスエラー処理
```javascript
// backend/services/aiService.js
if (!this.openai) {
  throw new Error('AI APIキーが設定されていません。.env.localファイルにAZURE_OPENAI_API_KEYを設定してください');
}
```

### 6.2 フロントエンドエラー処理
- トースト通知による視覚的フィードバック
- 成功: 緑色トースト
- エラー: 赤色トースト
- 警告: 黄色トースト

## 7. テスト仕様

### 7.1 動作確認項目
1. **マルチポートアクセス**
   - http://localhost:3000/ai_report.html ✅
   - http://localhost:3001/ai_report.html ✅

2. **報告書生成フロー**
   - 患者選択 → カルテ入力 → AI生成 → 報告書表示 ✅
   - LocalStorageデータ受け渡し ✅
   - 印刷後のデータクリア ✅

3. **クエリパラメータ処理**
   - ?patientId=99999998 付きURL ✅

## 8. パフォーマンス要件

### 8.1 レスポンス時間
- 患者リスト取得: < 500ms
- AI報告書生成: 3-5秒（Azure OpenAI API依存）
- 画面遷移: < 200ms
- LocalStorage読み書き: < 10ms

### 8.2 リソース制限
- カルテ入力: 最大5,000文字（APIで自動カット）
- LocalStorage使用量: < 100KB
- 同時AI生成: 1件（ボタン無効化で制御）

## 9. 今後の拡張計画

### Phase 1 (実装完了) ✅
- ✅ 3ステップウィザード形式のUI
- ✅ AI自動情報抽出（介護度、病名、日付）
- ✅ LocalStorageベースのデータ受け渡し
- ✅ マルチポート対応（3000/3001）
- ✅ クエリパラメータ処理対応
- ✅ A4印刷最適化

### Phase 2 (次期開発)
- [ ] 報告書履歴の保存・管理
- [ ] 複数患者の一括処理
- [ ] PDFダウンロード機能
- [ ] 報告書テンプレートのカスタマイズ

### Phase 3 (将来構想)
- [ ] 音声入力でのカルテ作成
- [ ] 画像認識（検査結果の自動取り込み）
- [ ] 電子カルテシステム連携
- [ ] AIモデルのファインチューニング

## 10. 変更履歴

| バージョン | 日付 | 変更内容 | 担当者 |
|-----------|------|----------|--------|
| 1.0.0 | 2025-01-16 | 初版作成 | AI Report Team |
| 1.1.0 | 2025-01-17 | 3ステップウィザード実装 | Development Team |
| 1.2.0 | 2025-01-18 | LocalStorage実装、マルチポート対応 | Development Team |
| 1.3.0 | 2025-01-18 | バグ修正版リリース（詳細は11.3参照） | Claude |

## 11. トラブルシューティング

### 11.1 404エラー（File not found）
**原因**: クエリパラメータ付きURLの処理エラー
**解決**: frontend/server.jsでURL解析を実装済み
```javascript
const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
let pathname = parsedUrl.pathname;
```

### 11.2 LocalStorageが読み込めない
**原因**: 異なるオリジン間でのアクセス
**解決**: 動的URL生成により同一オリジンを保証

### 11.3 バージョン1.3.0で修正されたバグ

#### 11.3.1 データオーバーライド問題
**現象**: LocalStorageから正しいデータが読み込まれても、サンプルデータで上書きされる
**原因**: report_generator.jsのフォールバック処理が常に実行される
**修正**: LocalStorageが存在する場合はreport_generator.jsが何もしないように変更

#### 11.3.2 表示の重複問題
**現象**:
- 診察日：「2024年9月18日2024年9月18日」
- 年齢：「80歳歳」
**原因**: JavaScriptとテンプレートの両方で単位や値を追加
**修正**:
- JavaScriptから単位を削除（年齢の"歳"）
- テンプレートから重複プレースホルダを削除

#### 11.3.3 居宅療養アドバイス未表示問題
**現象**: advices配列が空の場合、アドバイスが一つも表示されない
**原因**: AIが`selected_advice`を返しても、advices配列に変換されていない
**修正**:
- AIの`selected_advice`を`advices`配列に変換
- 主病名から自動的にアドバイスを推測する機能追加

#### 11.3.4 office_addressの未表示問題
**現象**: フロントエンドから直接入力したoffice_addressが報告書に表示されない
**原因**: 空文字列の場合、条件判定でfalsyと判断される
**修正**: `if (data[sourceKey])` → `if (data[sourceKey] !== undefined)`

#### 11.3.5 バックエンドAPIのハードコードデータ
**現象**: APIが常に固定値を返す（「高血圧症、糖尿病」など）
**原因**: patientsController.jsにハードコードされた値
**修正**: 固定値をnullに変更、AIやユーザー入力から取得するよう修正

### 11.3 AI生成が失敗する
**原因**: Azure OpenAI APIキー未設定
**解決**: .env.localファイルにAPIキーを設定

## 12. 技術スタック詳細

### 12.1 フロントエンド
- **HTML5**: セマンティックマークアップ
- **CSS3**: Flexbox/Grid レイアウト
- **JavaScript (ES6+)**:
  - クラスベース実装（AIReportPage）
  - async/await による非同期処理
  - LocalStorage API
  - Fetch API

### 12.2 バックエンド
- **Node.js**: v18+
- **Express.js**: v4.18.2
- **PostgreSQL**: v17
- **OpenAI SDK**: v4.20.1

### 12.3 主要ライブラリ
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "pg": "^8.11.3",
    "openai": "^4.20.1",
    "dotenv": "^16.3.1",
    "ws": "^8.14.2"
  }
}
```

---

*本PRDは継続的に更新されます。最新版は`docs/PRD_AI_Report_Generation.md`を参照してください。*