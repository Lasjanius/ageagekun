const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');

// .env.localファイルを探して読み込む
const envPath = path.join(__dirname, '../../.env.local');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  // フォールバック：通常の.env
  require('dotenv').config();
}

class AIService {
  constructor() {
    // OpenAI クライアント初期化
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    } else {
      console.warn('⚠️ OPENAI_API_KEY not set in .env.local');
      this.openai = null;
    }

    // 固定の生活指導テキスト
    this.adviceTexts = {
      diabetes: "糖尿病生活指導：間食を控えるように。服薬中の方は低血糖症状にも要注意。",
      hypertension: "高血圧生活指導：減塩食や適度な運動を心がけましょう。",
      dementia: "物忘れ指導：服薬の見守りなど細かい介護にて対応。気分の変化などに留意しましょう。",
      kidney: "腎臓病生活指導：血圧コントロール、たんぱく質制限、カリウムの多い食べ物を控えるように。",
      bedridden: "寝たきり指導：拘縮予防、褥瘡防止、長時間同じ姿勢を取らないように。",
      aspiration: "誤嚥防止指導：嚥下能力にあった食事形状を工夫し、食事はゆっくり摂りましょう。",
      fall_prevention: "転倒予防指導：日常生活の中で歩行訓練をし、転倒に十分注意しましょう。",
      malnutrition: "低栄養指導：低栄養に対して、栄養剤の補食を指導。",
      lipid: "脂質代謝異常症：食事バランスを良くし、運動をするように。"
    };
  }

  /**
   * 居宅療養管理指導報告書の生成
   */
  async generateKyotakuReport(patientData, karteContent) {
    // APIキー未設定の場合はエラーをthrow
    if (!this.openai) {
      throw new Error('OpenAI APIキーが設定されていません。.env.localファイルにOPENAI_API_KEYを設定してください');
    }

    try {
      const prompt = this.buildPrompt(patientData, karteContent);

      const completion = await this.openai.chat.completions.create({
        model: process.env.AI_MODEL || "gpt-4o-mini",
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

      const result = JSON.parse(completion.choices[0].message.content);

      // バリデーション
      if (!result.medical_content || !result.selected_advice) {
        throw new Error('Invalid AI response format');
      }

      // advice_textが無い場合は固定テキストから補完
      if (!result.advice_text) {
        result.advice_text = this.adviceTexts[result.selected_advice] || this.adviceTexts.fall_prevention;
      }

      // デフォルト値を設定
      if (!result.care_level) result.care_level = '';
      if (!result.primary_disease) result.primary_disease = '';
      if (!result.exam_date) result.exam_date = '';
      if (!result.next_exam_date) result.next_exam_date = '';

      return result;

    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.message || 'AI生成に失敗しました';
      console.error('AI generation error:', errorMessage);
      throw new Error(`OpenAI API Error: ${errorMessage}`);
    }
  }

  /**
   * プロンプト生成
   */
  buildPrompt(patientData, karteContent) {
    const age = this.calculateAge(patientData.birthdate);

    return `
# 役割
あなたは在宅医療専門の医師です。以下のカルテ内容から、ケアマネージャーへの居宅療養管理指導報告書を作成してください。

## 入力情報
- 患者名: ${patientData.patientName}
- 年齢: ${age}歳
- カルテ内容:
${karteContent}

## 生成指示

### 1. 診療内容の要約
以下の観点でカルテを要約してください（最低4行、最大8行、改行で整形）：
- バイタルサイン（血圧、脈拍、体温など）の数値と評価
- 検査結果（血糖値、HbA1c等）があれば具体的数値と測定日
- 前回からの症状変化（安定/改善/悪化）
- 行った処置（バルーン交換・胃瘻交換など）
- 処方薬の変更有無
- 特記事項

重要:
- 数値は必ず含める（例: 血圧130/80mmHg　脈拍 70回/min）
- 専門用語は適度に残す
  - ケアマネージャーが理解できる表現

### 2. 情報抽出
カルテ内容から以下の情報を抽出してください：

#### 介護度 (care_level)
- 「要介護1」「要介護2」「要介護3」「要介護4」「要介護5」「要支援1」「要支援2」のいずれか
- カルテ内に記載がなければ空文字列

#### 主病名 (primary_disease)
- カルテから診断名、病名を抽出
- 複数ある場合は必ず先頭の一つのみ
- 見つからなければ空文字列

#### 診察日 (exam_date)
- カルテに記載された診察日付
- 形式: YYYY/MM/DD
- 例: "2025/01/15"
- 西暦が記載されていない場合は現在の年とする（例: "1/15" → "2025/01/15"）
- 見つからなければ空文字列

#### 次回診察日 (next_exam_date)
- 次回予定、次回来院、○月後などの記載から推定
- 形式: YYYY/MM/DD
- 例: "2025/02/15"
- 明確に記載がなければ空文字列

### 3. 生活指導の選択（3つまで）

カルテ内容から最も重要な指導を最低1つ、最大3つまで選んでください。

判定優先順位：
1. 「血糖」「HbA1c」「インスリン」→ diabetes
2. 「血圧」「mmHg」「降圧薬」→ hypertension
3. 「認知」「MMSE」「記憶」→ dementia
4. 「腎機能」「クレアチニン」「eGFR」→ kidney
5. 「褥瘡」「体位」→ bedridden
6. 「嚥下」「むせ」→ aspiration
7. 「歩行」「ふらつき」→ fall_prevention
8. 「栄養」「体重減少」→ malnutrition
9. 「コレステロール」→ lipid
10. 上記なし → fall_prevention

## 出力形式（JSON）

必ず以下のJSON形式で返答してください：

{
  "medical_content": "診療内容の要約（3行以上。8行以内、改行は\\nで表現）",
  "selected_advice": "選択した指導カテゴリ（英語、上記の diabetes, hypertension 等から1つ）",
  "care_level": "介護度（例: 要介護3）",
  "primary_disease": "主病名（例: 高血圧症）必ず一つ",
  "exam_date": "診察日（例: 2025/01/15）",
  "next_exam_date": "次回診察日（例: 2025/02/15）"
}

## 出力例

{
  "medical_content": "血圧は132/78mmHgで前回より改善傾向。\\nHbA1c 7.0%で血糖コントロール良好。\\n軽度の膝痛あるも歩行は自立レベル維持。\\n処方薬継続、副作用なし。",
  "selected_advice": "diabetes",
  "care_level": "要介護3",
  "primary_disease": "糖尿病",
  "exam_date": "2024/01/15",
  "next_exam_date": "2024/02/15"
}`;
  }

  /**
   * 年齢計算
   */
  calculateAge(birthdate) {
    const birth = new Date(birthdate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return age;
  }


  /**
   * 期間計算ヘルパー
   * @param {string} examDateStr - 診察日文字列 (形式: "YYYY/MM/DD")
   */
  static getReportPeriod(examDateStr) {
    let date = new Date();

    // 診察日文字列から日付を作成
    if (examDateStr) {
      // "2024/01/15" や "2024/1/15" のような形式をパース
      const parts = examDateStr.split('/');
      if (parts.length === 3) {
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1; // JavaScriptの月は0から始まる
        const day = parseInt(parts[2]);

        // 有効な日付か確認
        const parsedDate = new Date(year, month, day);
        if (!isNaN(parsedDate.getTime())) {
          date = parsedDate;
        }
      }
    }

    // 年月から月初・月末を計算
    const year = date.getFullYear();
    const month = date.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();

    return {
      period_start: `${year}年${month + 1}月1日`,
      period_end: `${year}年${month + 1}月${lastDay}日`
    };
  }
}

module.exports = AIService;