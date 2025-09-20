const db = require('../config/database');
const formatters = require('../utils/formatters');
const fs = require('fs').promises;
const path = require('path');

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

// 新しいドキュメントを登録
const createDocument = async (req, res) => {
  const { fileName, patientId, category, fileType, pass, baseDir } = req.body;

  // バリデーション
  if (!fileName || !patientId || !category || !fileType || !pass) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields',
      message: 'fileName, patientId, category, fileType, and pass are required'
    });
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const insertQuery = `
      INSERT INTO Documents (fileName, patientID, Category, FileType, pass, base_dir, isUploaded, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, false, CURRENT_TIMESTAMP)
      RETURNING fileID, fileName, patientID, Category, FileType, pass, base_dir, isUploaded, created_at
    `;

    const values = [fileName, patientId, category, fileType, pass, baseDir || pass.replace(fileName, '').replace(/\\$/, '')];
    const result = await client.query(insertQuery, values);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Document created successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create document',
      message: error.message
    });
  } finally {
    client.release();
  }
};

// カテゴリ一覧を取得
const getCategories = async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT Category as category
      FROM Documents
      WHERE Category IS NOT NULL
      ORDER BY Category
    `;

    const result = await db.query(query);
    const categories = result.rows.map(row => row.category);

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories',
      message: error.message
    });
  }
};

// ドキュメントを削除
const deleteDocument = async (req, res) => {
  const { id } = req.params;
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // 1. ドキュメント情報を取得（ファイルパス確認のため）
    const docQuery = `
      SELECT d.*,
             (SELECT COUNT(*) FROM rpa_queue WHERE file_id = d.fileID AND status = 'processing') as processing_count
      FROM Documents d
      WHERE d.fileID = $1
    `;
    const docResult = await client.query(docQuery, [id]);

    if (docResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Document not found',
        message: `ドキュメントID ${id} が見つかりません`
      });
    }

    const document = docResult.rows[0];

    // 2. 処理中のキューがある場合は削除を拒否
    if (document.processing_count > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: 'Cannot delete processing document',
        message: 'このドキュメントは現在処理中のため削除できません。処理完了後に再度お試しください。'
      });
    }

    // 3. Documentsテーブルから削除（CASCADE DELETEでrpa_queueも自動削除）
    const deleteQuery = `
      DELETE FROM Documents
      WHERE fileID = $1
      RETURNING fileID, fileName, patientID
    `;
    const deleteResult = await client.query(deleteQuery, [id]);

    await client.query('COMMIT');

    // 4. ファイルシステムからファイルを削除（トランザクション外）
    if (document.pass) {
      try {
        await fs.unlink(document.pass);
        console.log(`✅ File deleted: ${document.pass}`);
      } catch (fileError) {
        // ファイルが既に存在しない場合もエラーにしない
        if (fileError.code !== 'ENOENT') {
          console.error(`⚠️ Failed to delete file: ${document.pass}`, fileError);
        }
      }
    }

    // 5. WebSocket通知を送信
    const websocketService = req.app.get('websocketService');
    if (websocketService) {
      websocketService.broadcast('document_deleted', {
        file_id: deleteResult.rows[0].fileid,
        file_name: deleteResult.rows[0].filename,
        patient_id: deleteResult.rows[0].patientid
      });
    }

    res.json({
      success: true,
      message: 'Document deleted successfully',
      data: {
        file_id: deleteResult.rows[0].fileid,
        file_name: deleteResult.rows[0].filename
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete document',
      message: error.message
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getAllDocuments,
  getPendingUploads,
  updateUploadStatus,
  getStatistics,
  createDocument,
  getCategories,
  deleteDocument
};