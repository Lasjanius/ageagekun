const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const db = require('../config/database');

// ファイルを配信
const serveFile = async (req, res) => {
  const { fileId } = req.params;
  const { mode = 'inline' } = req.query; // inline または download
  
  try {
    // ファイル情報をデータベースから取得
    const query = `
      SELECT 
        d.fileID,
        d.fileName,
        d.pass as file_path,
        d.Category,
        p.patientName
      FROM Documents d
      JOIN patients p ON d.patientID = p.patientID
      WHERE d.fileID = $1
    `;
    
    const result = await db.query(query, [fileId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
        message: `ファイルID ${fileId} が見つかりません`
      });
    }
    
    const fileInfo = result.rows[0];
    const filePath = fileInfo.file_path;
    
    // ファイルの存在確認
    if (!fs.existsSync(filePath)) {
      console.error(`File not found at path: ${filePath}`);
      return res.status(404).json({
        success: false,
        error: 'Physical file not found',
        message: 'ファイルが物理的に存在しません',
        file_path: filePath
      });
    }
    
    // セキュリティチェック: パストラバーサル攻撃対策
    const resolvedPath = path.resolve(filePath);
    const expectedBasePath = path.resolve('C:\\Users\\hyosh\\Desktop\\allright\\ageagekun\\patients');
    
    if (!resolvedPath.startsWith(expectedBasePath)) {
      console.error(`Security violation: Path traversal attempt detected. Path: ${resolvedPath}`);
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        message: 'アクセスが拒否されました'
      });
    }
    
    // ファイル情報を取得
    const stats = fs.statSync(filePath);
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    
    // ログ記録
    console.log(`📄 File access: ${fileInfo.fileName} (ID: ${fileId}) by ${req.ip} - Mode: ${mode}`);
    
    // レスポンスヘッダーを設定
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', stats.size);
    
    // Content-Dispositionヘッダーを設定（ファイル名を含める）
    const encodedFileName = encodeURIComponent(fileInfo.fileName);
    if (mode === 'download') {
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);
    } else {
      // インラインモード（ブラウザ内で表示）- ファイル名も含める
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedFileName}`);
    }
    
    // キャッシュ制御
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // ファイルをストリーミング配信
    const readStream = fs.createReadStream(filePath);
    
    readStream.on('error', (error) => {
      console.error('File streaming error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'File streaming failed',
          message: 'ファイルの読み込みに失敗しました'
        });
      }
    });
    
    readStream.pipe(res);
    
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'ファイル配信中にエラーが発生しました',
      details: error.message
    });
  }
};

// ファイル情報を取得（メタデータのみ）
const getFileInfo = async (req, res) => {
  const { fileId } = req.params;
  
  try {
    const query = `
      SELECT 
        d.fileID,
        d.fileName,
        d.Category,
        d.created_at,
        d.isUploaded,
        p.patientID,
        p.patientName
      FROM Documents d
      JOIN patients p ON d.patientID = p.patientID
      WHERE d.fileID = $1
    `;
    
    const result = await db.query(query, [fileId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }
    
    const fileInfo = result.rows[0];
    const filePath = fileInfo.file_path;
    
    // ファイルサイズを取得
    let fileSize = null;
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      fileSize = stats.size;
    }
    
    res.json({
      success: true,
      data: {
        ...fileInfo,
        file_size: fileSize,
        file_exists: fs.existsSync(filePath)
      }
    });
    
  } catch (error) {
    console.error('Error getting file info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get file info',
      message: error.message
    });
  }
};

module.exports = {
  serveFile,
  getFileInfo
};