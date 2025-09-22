const express = require('express');
const router = express.Router();
const batchPrintController = require('../controllers/batchPrintController');

// PDF連結印刷関連のルート

// ready_to_printステータスのドキュメント一覧を取得
router.get('/ready-documents', batchPrintController.getReadyDocuments);

// PDF連結処理を開始（非同期）
router.post('/merge', batchPrintController.startMerge);

// 生成されたPDFを表示（ストリーミング）
router.get('/view/:batchId', batchPrintController.viewBatchPrint);

// 連結PDF履歴を取得（60日経過アラート付き）
router.get('/history', batchPrintController.getHistory);

// 連結PDFを削除（物理削除）
router.delete('/:batchId', batchPrintController.deleteBatchPrint);

module.exports = router;