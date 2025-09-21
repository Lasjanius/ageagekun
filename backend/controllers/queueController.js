const db = require('../config/database');

// ステータス定義（定数化）
const QUEUE_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  UPLOADED: 'uploaded',
  READY_TO_PRINT: 'ready_to_print',
  DONE: 'done',
  FAILED: 'failed',
  CANCELED: 'canceled'
};

// アクティブなステータス（ホワイトリスト）
const ACTIVE_STATUSES = [
  QUEUE_STATUS.PENDING,
  QUEUE_STATUS.PROCESSING,
  QUEUE_STATUS.UPLOADED,
  QUEUE_STATUS.READY_TO_PRINT
];

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

// ステータスを'uploaded'に更新（PAD用）
const updateToUploaded = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      UPDATE rpa_queue
      SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = $3
      RETURNING *
    `;

    const result = await db.query(query, [
      id,
      QUEUE_STATUS.UPLOADED,
      QUEUE_STATUS.PROCESSING
    ]);

    if (result.rows.length === 0) {
      return res.status(409).json({
        success: false,
        error: 'Invalid state transition or queue item not found'
      });
    }

    res.json({
      success: true,
      message: 'Upload completed',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating to uploaded:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update status',
      message: error.message
    });
  }
};

// ステータスを'ready_to_print'に更新
const updateToReadyToPrint = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      UPDATE rpa_queue
      SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = $3
      RETURNING *
    `;

    const result = await db.query(query, [
      id,
      QUEUE_STATUS.READY_TO_PRINT,
      QUEUE_STATUS.UPLOADED
    ]);

    if (result.rows.length === 0) {
      return res.status(409).json({
        success: false,
        error: 'Invalid state transition or queue item not found'
      });
    }

    res.json({
      success: true,
      message: 'Ready for printing',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating to ready_to_print:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update status',
      message: error.message
    });
  }
};

// ステータスを'done'に更新（印刷完了時）
const updateToDone = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      UPDATE rpa_queue
      SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = $3
      RETURNING *
    `;

    const result = await db.query(query, [
      id,
      QUEUE_STATUS.DONE,
      QUEUE_STATUS.READY_TO_PRINT
    ]);

    if (result.rows.length === 0) {
      return res.status(409).json({
        success: false,
        error: 'Invalid state transition or queue item not found'
      });
    }

    res.json({
      success: true,
      message: 'All processing completed',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating to done:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update status',
      message: error.message
    });
  }
};

// 旧updateToCompleteは後方互換性のため残す（uploadedにリダイレクト）
const updateToComplete = async (req, res) => {
  console.warn('updateToComplete is deprecated. Use updateToUploaded instead.');
  return updateToUploaded(req, res);
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
      uploaded: 0,
      ready_to_print: 0,
      done: 0,
      failed: 0,
      canceled: 0
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

// 保留中のキューアイテムを取得（アクティブなステータスのみ）
const getPendingQueues = async (req, res) => {
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
      WHERE q.status = ANY($1::varchar[])
      ORDER BY q.created_at DESC
    `;

    const result = await db.query(query, [ACTIVE_STATUSES]);

    // payload内のデータも含めて整形
    const formattedQueues = result.rows.map(row => ({
      id: row.id,
      file_id: row.file_id,
      patient_id: row.patient_id,
      status: row.status,
      error_message: row.error_message,
      created_at: row.created_at,
      updated_at: row.updated_at,
      // payloadからの情報
      file_name: row.payload?.file_name || row.file_name,
      patient_name: row.payload?.patient_name || row.patient_name,
      category: row.payload?.category || row.category,
      pass: row.payload?.pass || row.pass,
      base_dir: row.payload?.base_dir
    }));

    res.json({
      success: true,
      data: formattedQueues,
      count: formattedQueues.length
    });
  } catch (error) {
    console.error('Error fetching pending queues:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending queues',
      message: error.message
    });
  }
};

module.exports = {
  createBatchQueue,
  getQueueStatus,
  updateToProcessing,
  updateToUploaded,        // 新規追加
  updateToReadyToPrint,    // 新規追加
  updateToDone,           // 新規追加
  updateToComplete,       // 後方互換性のため残す
  updateToFailed,
  getQueueOverview,
  getPendingQueues,
  cancelQueue,
  // 定数もエクスポート
  QUEUE_STATUS,
  ACTIVE_STATUSES
};