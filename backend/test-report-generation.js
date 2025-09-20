const AIService = require('./services/aiService');
const path = require('path');
const fs = require('fs');

// .env.localファイルを読み込む
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

async function testReportGeneration() {
  console.log('🏥 居宅療養管理指導報告書生成テスト開始...\n');

  const aiService = new AIService();

  // テストデータ
  const patientData = {
    patientName: 'テスト太郎',
    birthdate: '1945-05-15'
  };

  const karteContent = `
診察日: 2025/01/20

【バイタルサイン】
血圧: 136/82mmHg
脈拍: 72回/min (整)
体温: 36.5℃

【既往歴】
・高血圧症
・2型糖尿病
・軽度認知症

【検査結果】
HbA1c: 7.2% (前回 7.5%)
血糖値: 142mg/dl

【所見】
血糖コントロールは前回より改善傾向。
降圧薬の効果良好で血圧安定。
軽度の物忘れあるも、服薬管理は家族のサポートで可能。

【処方】
・アムロジピン 5mg 1錠 朝食後
・メトホルミン 500mg 2錠 朝夕食後

【介護度】
要介護2

【次回予定】
2025年2月20日 定期診察
  `;

  try {
    console.log('📋 入力データ:');
    console.log(`  患者名: ${patientData.patientName}`);
    console.log(`  生年月日: ${patientData.birthdate}`);
    console.log(`  カルテ内容: ${karteContent.substring(0, 50)}...`);
    console.log('');

    console.log('🤖 Azure OpenAI APIを使用して報告書を生成中...\n');

    const result = await aiService.generateKyotakuReport(patientData, karteContent);

    console.log('✅ 報告書生成成功！\n');
    console.log('📄 生成された報告書データ:');
    console.log('─'.repeat(60));
    console.log(JSON.stringify(result, null, 2));
    console.log('─'.repeat(60));

    // 各フィールドの確認
    console.log('\n📊 生成結果の詳細確認:');
    console.log(`  ✓ medical_content: ${result.medical_content ? '生成済み' : '❌ 未生成'}`);
    console.log(`  ✓ selected_advice: ${result.selected_advice || '❌ 未選択'}`);
    console.log(`  ✓ care_level: ${result.care_level || '❌ 未抽出'}`);
    console.log(`  ✓ primary_disease: ${result.primary_disease || '❌ 未抽出'}`);
    console.log(`  ✓ exam_date: ${result.exam_date || '❌ 未抽出'}`);
    console.log(`  ✓ next_exam_date: ${result.next_exam_date || '❌ 未抽出'}`);

    // 生活指導テキストの確認
    if (result.advice_text) {
      console.log(`\n📝 生活指導テキスト:`);
      console.log(`  ${result.advice_text}`);
    }

    console.log('\n🎉 Azure OpenAI APIを使用した報告書生成機能は正常に動作しています！');

  } catch (error) {
    console.error('\n❌ エラーが発生しました:');
    console.error('─'.repeat(60));
    console.error(error.message);
    console.error('─'.repeat(60));

    if (error.stack) {
      console.error('\nスタックトレース:');
      console.error(error.stack);
    }

    console.error('\n💡 確認事項:');
    console.error('  1. Azure OpenAI APIキーが正しく設定されているか');
    console.error('  2. エンドポイントとデプロイメント名が正しいか');
    console.error('  3. JSON応答形式がサポートされているか');

    process.exit(1);
  }
}

// テスト実行
testReportGeneration();