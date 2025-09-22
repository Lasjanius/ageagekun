const batchPrintService = require('../services/batchPrintService');
const fs = require('fs-extra');
const path = require('path');

/**
 * ready_to_printステータスのドキュメント一覧を取得
 */
const getReadyDocuments = async (req, res) => {
  try {
    const { sortBy, sortOrder } = req.query;

    const result = await batchPrintService.getReadyDocuments(sortBy, sortOrder);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Error fetching ready documents:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * PDF連結処理を開始（非同期）
 */
const startMerge = async (req, res) => {
  try {
    const { documentIds, sortBy = 'createdAt', sortOrder = 'asc' } = req.body;

    // 基本的なバリデーション
    if (!documentIds || !Array.isArray(documentIds)) {
      return res.status(400).json({
        success: false,
        error: 'ドキュメントIDが指定されていません'
      });
    }

    if (documentIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'ドキュメントが選択されていません'
      });
    }

    // ジョブをキューに追加（非同期処理）
    const job = await batchPrintService.addMergeJob(documentIds, sortBy, sortOrder);

    res.json({
      success: true,
      message: `${documentIds.length}件のPDF連結処理を開始しました`,
      data: {
        jobId: job.id,
        status: job.status,
        documentCount: documentIds.length
      }
    });
  } catch (error) {
    console.error('❌ Error starting merge:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 生成されたPDFをストリーミング配信
 */
const viewBatchPrint = async (req, res) => {
  try {
    const { batchId } = req.params;

    // バッチIDのバリデーション
    if (!batchId || isNaN(batchId)) {
      return res.status(400).json({
        success: false,
        error: '無効なバッチIDです'
      });
    }

    // PDFファイル情報を取得
    const batchPrint = await batchPrintService.getBatchPrint(parseInt(batchId));

    if (!batchPrint) {
      return res.status(404).json({
        success: false,
        error: 'PDFファイルが見つかりません'
      });
    }

    const { file_path, file_name } = batchPrint;

    // ファイルの存在確認
    if (!await fs.pathExists(file_path)) {
      return res.status(404).json({
        success: false,
        error: 'PDFファイルが存在しません'
      });
    }

    // PDFをストリーミング配信
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${file_name}"`);

    const stream = fs.createReadStream(file_path);
    stream.on('error', (error) => {
      console.error('❌ Error streaming PDF:', error);
      res.status(500).json({
        success: false,
        error: 'PDFの読み込みに失敗しました'
      });
    });

    stream.pipe(res);
  } catch (error) {
    console.error('❌ Error viewing batch print:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 連結PDF履歴を取得
 */
const getHistory = async (req, res) => {
  try {
    const result = await batchPrintService.getBatchPrintHistory();

    // 60日以上経過したファイルがある場合、警告メッセージを追加
    const response = {
      success: true,
      data: result
    };

    if (result.oldCount > 0) {
      response.warning = `${result.oldCount}件の連結PDFが60日以上経過しています`;
    }

    res.json(response);
  } catch (error) {
    console.error('❌ Error fetching history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 連結PDFを削除（物理削除）
 */
const deleteBatchPrint = async (req, res) => {
  try {
    const { batchId } = req.params;

    // バッチIDのバリデーション
    if (!batchId || isNaN(batchId)) {
      return res.status(400).json({
        success: false,
        error: '無効なバッチIDです'
      });
    }

    // 削除処理
    const result = await batchPrintService.deleteBatchPrint(parseInt(batchId));

    res.json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (error) {
    console.error('❌ Error deleting batch print:', error);

    // ファイルが見つからない場合は404を返す
    if (error.message === 'PDFが見つかりません') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  getReadyDocuments,
  startMerge,
  viewBatchPrint,
  getHistory,
  deleteBatchPrint
};