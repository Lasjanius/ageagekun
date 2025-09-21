const express = require('express');
const router = express.Router();
const queueController = require('../controllers/queueController');

// キュー関連のルート
router.post('/create-batch', queueController.createBatchQueue);
router.get('/overview', queueController.getQueueOverview);
router.get('/pending', queueController.getPendingQueues);
router.get('/:id/status', queueController.getQueueStatus);

// ステータス更新エンドポイント（新しいフロー）
router.put('/:id/processing', queueController.updateToProcessing);
router.put('/:id/uploaded', queueController.updateToUploaded);          // PAD用（新規）
router.put('/:id/ready-to-print', queueController.updateToReadyToPrint); // 新規
router.put('/:id/done', queueController.updateToDone);                   // 新規（印刷完了）
router.put('/:id/failed', queueController.updateToFailed);

// 後方互換性のため残す（deprecated）
router.put('/:id/complete', queueController.updateToComplete);           // → uploadedにリダイレクト

// キューキャンセル用エンドポイント
router.delete('/cancel-all', queueController.cancelQueue);

// 個別キューアイテム削除エンドポイント
router.delete('/:id', queueController.deleteQueueItem);

module.exports = router;