const pdfService = require('./services/pdfService');
const path = require('path');
const fs = require('fs').promises;

async function testPDFGeneration() {
    console.log('=== PDF生成機能テスト開始 ===\n');

    try {
        // テストデータ
        const testReportData = {
            patientId: '99999999',
            patientName: 'テスト太郎',
            address: '東京都千代田区1-1-1',
            content: 'これはAI生成されたテスト内容です。\n患者様の状態は安定しており、経過良好です。',
            observations: '血圧: 120/80\n体温: 36.5度\n特記事項なし',
            nextPlan: '次回診察予定: 1ヶ月後\n薬剤継続',
            author: 'テスト医師',
            facility: 'テスト医療機関'
        };

        console.log('1. PDFサービスの状態確認...');
        console.log(`   - ライブラリ利用可能: ${pdfService.isLibraryAvailable ? '✅' : '❌'}`);

        if (!pdfService.isLibraryAvailable) {
            throw new Error('PDF生成ライブラリが利用できません');
        }

        console.log('\n2. テストPDF生成中...');
        const result = await pdfService.createKyotakuReportPDF(
            testReportData,
            testReportData.patientId
        );

        console.log('   ✅ PDF生成成功');
        console.log(`   - ファイル名: ${result.fileName}`);
        console.log(`   - 保存先: ${result.fullPath}`);

        // ファイルの存在確認
        console.log('\n3. ファイル確認中...');
        const stats = await fs.stat(result.fullPath);
        console.log(`   ✅ ファイルが存在します`);
        console.log(`   - ファイルサイズ: ${stats.size} bytes`);
        console.log(`   - 作成日時: ${stats.birthtime.toLocaleString('ja-JP')}`);

        // クリーンアップ
        console.log('\n4. テストファイルのクリーンアップ...');
        await fs.unlink(result.fullPath);
        console.log('   ✅ テストファイルを削除しました');

        console.log('\n=== テスト完了 ===');
        console.log('✅ PDF生成機能は正常に動作しています');

    } catch (error) {
        console.error('\n❌ テスト失敗:', error.message);
        console.error('スタックトレース:', error.stack);
        process.exit(1);
    }
}

// テスト実行
testPDFGeneration();