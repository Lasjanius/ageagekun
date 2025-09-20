const express = require('express');
const router = express.Router();
const queueController = require('../controllers/queueController');

// キュー関連のルート
router.post('/create-batch', queueController.createBatchQueue);
router.get('/overview', queueController.getQueueOverview);
router.get('/pending', queueController.getPendingQueues);
router.get('/:id/status', queueController.getQueueStatus);

// PAD用のステータス更新エンドポイント
router.put('/:id/processing', queueController.updateToProcessing);
router.put('/:id/complete', queueController.updateToComplete);
router.put('/:id/failed', queueController.updateToFailed);

// キューキャンセル用エンドポイント
router.delete('/cancel-all', queueController.cancelQueue);

module.exports = router;