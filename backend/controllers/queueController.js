const db = require('../config/database');

// 複数のファイルをキューに追加
const createBatchQueue = async (req, res) => {
  const { files } = req.body; // Array of file objects
  
  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No files provided'
    });
  }
  
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    const queueIds = [];
    
    for (const file of files) {
      // 新しいテーブル構造に合わせたINSERT
      const insertQuery = `
        INSERT INTO rpa_queue (file_id, patient_id, payload, status)
        VALUES ($1, $2, $3::jsonb, 'pending')
        RETURNING id
      `;
      
      // PAD用のデータをpayloadに格納
      // base_dirはpassからファイル名を除いたディレクトリパス
      const base_dir = file.pass ? file.pass.substring(0, file.pass.lastIndexOf('\\')) : '';
      
      const payload = {
        file_name: file.file_name,
        category: file.category,
        pass: file.pass,
        base_dir: base_dir,
        patient_name: file.patient_name
      };
      
      const result = await client.query(insertQuery, [
        file.file_id,
        file.patient_id,
        JSON.stringify(payload)
      ]);
      
      queueIds.push({
        queue_id: result.rows[0].id,
        file_id: file.file_id,
        file_name: file.file_name
      });
    }
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: `${queueIds.length} files added to queue`,
      data: queueIds
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating batch queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create queue batch',
      message: error.message
    });
  } finally {
    client.release();
  }
};

// キューのステータスを取得
const getQueueStatus = async (req, res) => {
  const { id } = req.params;
  
  try {
    const query = `
      SELECT 
        q.id,
        q.file_id,
        q.patient_id,
        q.status,
        q.payload,
        q.error_message,
        q.created_at,
        q.updated_at,
        d.fileName as file_name,
        d.Category as category,
        d.pass,
        p.patientName as patient_name
      FROM rpa_queue q
      LEFT JOIN Documents d ON q.file_id = d.fileID
      LEFT JOIN patients p ON q.patient_id = p.patientID
      WHERE q.id = $1
    `;
    
    const result = await db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Queue item not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching queue status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch queue status',
      message: error.message
    });
  }
};

// ステータスを'processing'に更新（PAD用）
const updateToProcessing = async (req, res) => {
  const { id } = req.params;
  
  try {
    const query = `
      UPDATE rpa_queue
      SET status = 'processing'
      WHERE id = $1 AND status = 'pending'
      RETURNING *
    `;
    
    const result = await db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Queue item not found or already processing'
      });
    }
    
    res.json({
      success: true,
      message: 'Status updated to processing',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating to processing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update status',
      message: error.message
    });
  }
};

// ステータスを'done'に更新（PAD用）
const updateToComplete = async (req, res) => {
  const { id } = req.params;
  
  try {
    const query = `
      UPDATE rpa_queue
      SET status = 'done'
      WHERE id = $1 AND status = 'processing'
      RETURNING *
    `;
    
    const result = await db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Queue item not found or not in processing state'
      });
    }
    
    res.json({
      success: true,
      message: 'Upload completed successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating to complete:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update status',
      message: error.message
    });
  }
};

// ステータスを'failed'に更新（PAD用）
const updateToFailed = async (req, res) => {
  const { id } = req.params;
  const { error_message } = req.body;
  
  try {
    const query = `
      UPDATE rpa_queue
      SET 
        status = 'failed', 
        error_message = $2
      WHERE id = $1 AND status = 'processing'
      RETURNING *
    `;
    
    const result = await db.query(query, [id, error_message || 'Unknown error']);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Queue item not found or not in processing state'
      });
    }
    
    res.json({
      success: true,
      message: 'Status updated to failed',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating to failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update status',
      message: error.message
    });
  }
};

// キューの全体状況を取得
const getQueueOverview = async (req, res) => {
  try {
    const query = `
      SELECT 
        status,
        COUNT(*) as count
      FROM rpa_queue
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY status
      ORDER BY status
    `;
    
    const result = await db.query(query);
    
    const overview = {
      pending: 0,
      processing: 0,
      done: 0,
      failed: 0
    };
    
    result.rows.forEach(row => {
      overview[row.status] = parseInt(row.count);
    });
    
    res.json({
      success: true,
      data: overview
    });
  } catch (error) {
    console.error('Error fetching queue overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch queue overview',
      message: error.message
    });
  }
};

// キューをキャンセル（pending状態のアイテムを削除またはcanceledに更新）
const cancelQueue = async (req, res) => {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    // まず現在のpending状態のアイテムを取得
    const selectQuery = `
      SELECT id, file_id 
      FROM rpa_queue 
      WHERE status = 'pending'
    `;
    const pendingItems = await client.query(selectQuery);
    
    // pending状態のアイテムをcanceledに更新（削除ではなく状態変更にする）
    const updateQuery = `
      UPDATE rpa_queue
      SET 
        status = 'canceled',
        error_message = 'ユーザーによりキャンセルされました',
        updated_at = CURRENT_TIMESTAMP
      WHERE status = 'pending'
      RETURNING id, file_id
    `;
    
    const result = await client.query(updateQuery);
    const canceledCount = result.rowCount;
    
    await client.query('COMMIT');
    
    // WebSocket通知用にキャンセルされたアイテムのIDリストを返す
    const canceledIds = result.rows.map(row => row.id);
    
    // WebSocketで通知を送信
    const wss = req.app.get('wss');
    if (wss) {
      canceledIds.forEach(queueId => {
        const message = JSON.stringify({
          type: 'queue_update',
          data: {
            queue_id: queueId,
            status: 'canceled',
            error: 'ユーザーによりキャンセルされました'
          }
        });
        
        wss.clients.forEach(client => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(message);
          }
        });
      });
    }
    
    res.json({
      success: true,
      message: `${canceledCount}件のキューアイテムをキャンセルしました`,
      data: {
        canceled_count: canceledCount,
        canceled_ids: canceledIds
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error canceling queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel queue',
      message: error.message
    });
  } finally {
    client.release();
  }
};

module.exports = {
  createBatchQueue,
  getQueueStatus,
  updateToProcessing,
  updateToComplete,
  updateToFailed,
  getQueueOverview,
  cancelQueue
};