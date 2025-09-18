require('dotenv').config({ path: '../.env' });
const db = require('../config/database');

// テスト用タスクを作成
async function createTestTask() {
  try {
    console.log('📝 Creating test upload task...');
    
    // 未アップロードのドキュメントを1件取得
    const docQuery = `
      SELECT 
        d.fileID,
        d.fileName,
        d.Category,
        d.pass,
        p.patientID,
        p.patientName
      FROM Documents d
      JOIN patients p ON d.patientID = p.patientID
      WHERE d.isUploaded = FALSE
      LIMIT 1
    `;
    
    const docResult = await db.query(docQuery);
    
    if (docResult.rows.length === 0) {
      console.log('❌ No pending documents found');
      process.exit(1);
    }
    
    const doc = docResult.rows[0];
    console.log('📄 Found document:', doc.filename);
    console.log('   Patient:', doc.patientname);
    console.log('   Category:', doc.category);
    console.log('   Path:', doc.pass);
    
    // rpa_queueにタスクを追加
    const insertQuery = `
      INSERT INTO rpa_queue (task_type, file_id, payload, status)
      VALUES ('upload_pdf', $1, $2, 'pending')
      RETURNING id
    `;
    
    const payload = {
      patient_id: doc.patientid,
      patient_name: doc.patientname,
      category: doc.category,
      filename: doc.filename,
      pass: doc.pass
    };
    
    const result = await db.query(insertQuery, [
      doc.fileid,
      JSON.stringify(payload)
    ]);
    
    console.log(`✅ Created test task with queue ID: ${result.rows[0].id}`);
    console.log('');
    console.log('📋 Task details:');
    console.log('   - File ID:', doc.fileid);
    console.log('   - File Name:', doc.filename);
    console.log('   - Patient ID:', doc.patientid);
    console.log('   - Category:', doc.category);
    console.log('');
    console.log('👀 Now monitoring the task status...');
    console.log('   The upload processor should pick this up within 5 seconds');
    console.log('');
    
    // タスクの状態を監視
    let previousStatus = 'pending';
    const checkInterval = setInterval(async () => {
      const statusQuery = `
        SELECT status, error_message, started_at, finished_at
        FROM rpa_queue
        WHERE id = $1
      `;
      
      const statusResult = await db.query(statusQuery, [result.rows[0].id]);
      const status = statusResult.rows[0];
      
      if (status.status !== previousStatus) {
        console.log(`📊 Status changed: ${previousStatus} → ${status.status}`);
        previousStatus = status.status;
        
        if (status.status === 'processing') {
          console.log('   Started at:', status.started_at);
        }
        
        if (status.status === 'done') {
          console.log('   ✅ Upload completed successfully!');
          console.log('   Finished at:', status.finished_at);
          
          // ファイル移動を確認
          const fileQuery = `
            SELECT pass, isUploaded, uploaded_at
            FROM Documents
            WHERE fileID = $1
          `;
          
          const fileResult = await db.query(fileQuery, [doc.fileid]);
          const file = fileResult.rows[0];
          
          console.log('');
          console.log('📁 File status:');
          console.log('   - isUploaded:', file.isuploaded);
          console.log('   - New path:', file.pass);
          console.log('   - Uploaded at:', file.uploaded_at);
          
          clearInterval(checkInterval);
          process.exit(0);
        }
        
        if (status.status === 'failed') {
          console.log('   ❌ Upload failed!');
          console.log('   Error:', status.error_message);
          console.log('   Finished at:', status.finished_at);
          clearInterval(checkInterval);
          process.exit(1);
        }
      }
    }, 1000);
    
    // 60秒後にタイムアウト
    setTimeout(() => {
      console.log('⏱️ Timeout: Task did not complete within 60 seconds');
      clearInterval(checkInterval);
      process.exit(1);
    }, 60000);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// 実行
createTestTask();