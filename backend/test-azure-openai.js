const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');

// .env.localファイルを読み込む
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

async function testAzureOpenAI() {
  console.log('🔧 Azure OpenAI接続テスト開始...\n');

  // 環境変数の確認
  console.log('📋 環境変数確認:');
  console.log(`  AI_PROVIDER: ${process.env.AI_PROVIDER}`);
  console.log(`  AZURE_OPENAI_ENDPOINT: ${process.env.AZURE_OPENAI_ENDPOINT}`);
  console.log(`  AZURE_OPENAI_DEPLOYMENT_NAME: ${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`);
  console.log(`  AZURE_OPENAI_API_VERSION: ${process.env.AZURE_OPENAI_API_VERSION || '2024-10-21'}`);
  console.log(`  API Key: ${process.env.AZURE_OPENAI_API_KEY ? '✅ 設定済み' : '❌ 未設定'}\n`);

  if (!process.env.AZURE_OPENAI_API_KEY) {
    console.error('❌ エラー: AZURE_OPENAI_API_KEYが設定されていません');
    process.exit(1);
  }

  try {
    // Azure OpenAIクライアントの初期化
    const openai = new OpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`,
      defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION || '2024-10-21' },
      defaultHeaders: {
        'api-key': process.env.AZURE_OPENAI_API_KEY
      }
    });

    console.log('🚀 接続テスト実行中...\n');

    // Hello Worldミームについて質問
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "user",
          content: "Hello Worldというミームについて、プログラミング文化における意味と歴史を簡潔に説明してください。"
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    console.log('✅ 接続成功！\n');
    console.log('📝 Azure OpenAIからの応答:');
    console.log('─'.repeat(50));
    console.log(completion.choices[0].message.content);
    console.log('─'.repeat(50));

    // 使用統計
    console.log('\n📊 使用統計:');
    console.log(`  - Model: ${completion.model || process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`);
    console.log(`  - Completion tokens: ${completion.usage?.completion_tokens || 'N/A'}`);
    console.log(`  - Prompt tokens: ${completion.usage?.prompt_tokens || 'N/A'}`);
    console.log(`  - Total tokens: ${completion.usage?.total_tokens || 'N/A'}`);

    // JSON応答テスト
    console.log('\n🔧 JSON形式応答テスト...\n');

    const jsonCompletion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "あなたは技術情報を提供するアシスタントです。必ずJSON形式で回答してください。"
        },
        {
          role: "user",
          content: "プログラミングでHello Worldが最初の例として使われる理由を教えてください。"
        }
      ],
      temperature: 0.3,
      max_tokens: 300,
      response_format: { type: "json_object" }
    });

    console.log('✅ JSON応答テスト成功！');
    const jsonResponse = JSON.parse(jsonCompletion.choices[0].message.content);
    console.log('📝 JSON形式の応答:');
    console.log(JSON.stringify(jsonResponse, null, 2));

    console.log('\n🎉 すべてのテストが成功しました！');
    console.log('Azure OpenAIは正常に動作しています。');

  } catch (error) {
    console.error('\n❌ エラーが発生しました:');
    console.error('─'.repeat(50));

    if (error.response) {
      console.error('ステータスコード:', error.response.status);
      console.error('エラーメッセージ:', error.response.data?.error?.message || error.response.data);
    } else {
      console.error(error.message);
    }

    console.error('─'.repeat(50));
    console.error('\n💡 確認事項:');
    console.error('  1. APIキーが正しいか確認してください');
    console.error('  2. エンドポイントURLが正しいか確認してください');
    console.error('  3. デプロイメント名が正しいか確認してください');
    console.error('  4. モデルがデプロイされているか確認してください');

    process.exit(1);
  }
}

// テスト実行
testAzureOpenAI();