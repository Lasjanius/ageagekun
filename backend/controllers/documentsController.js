const db = require('../config/database');

// 全ドキュメント一覧を取得
const getAllDocuments = async (req, res) => {
  try {
    const query = `
      SELECT 
        d.fileID as file_id,
        d.fileName as file_name,
        d.Category as category,
        d.pass,
        d.isUploaded,
        p.patientID as patient_id,
        p.patientName as patient_name,
        d.created_at
      FROM Documents d
      JOIN patients p ON d.patientID = p.patientID
      ORDER BY p.patientID, d.created_at
    `;
    
    const result = await db.query(query);
    
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch documents',
      message: error.message
    });
  }
};

// 未アップロードファイル一覧を取得（後方互換性のため）
const getPendingUploads = async (req, res) => {
  try {
    const query = `
      SELECT 
        d.fileID as file_id,
        d.fileName as file_name,
        d.Category as category,
        d.pass,
        d.isUploaded,
        p.patientID as patient_id,
        p.patientName as patient_name,
        d.created_at
      FROM Documents d
      JOIN patients p ON d.patientID = p.patientID
      WHERE d.isUploaded = false
      ORDER BY p.patientID, d.created_at
    `;
    
    const result = await db.query(query);
    
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching pending uploads:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending uploads',
      message: error.message
    });
  }
};

// ファイルのアップロード状態を更新
const updateUploadStatus = async (req, res) => {
  const { id } = req.params;
  const { isUploaded } = req.body;
  
  try {
    const query = `
      UPDATE Documents 
      SET 
        isUploaded = $1,
        uploaded_at = CASE WHEN $1 = true THEN NOW() ELSE uploaded_at END
      WHERE fileID = $2
      RETURNING *
    `;
    
    const result = await db.query(query, [isUploaded, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating upload status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update upload status',
      message: error.message
    });
  }
};

// 統計情報を取得
const getStatistics = async (req, res) => {
  try {
    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE isUploaded = false) as pending_count,
        COUNT(*) FILTER (WHERE isUploaded = true) as uploaded_count,
        COUNT(*) as total_count,
        COUNT(DISTINCT patientID) as patient_count
      FROM Documents
    `;
    
    const result = await db.query(query);
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      message: error.message
    });
  }
};

module.exports = {
  getAllDocuments,
  getPendingUploads,
  updateUploadStatus,
  getStatistics
};