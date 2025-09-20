const express = require('express');
const router = express.Router();
const documentsController = require('../controllers/documentsController');

// ドキュメント関連のルート
router.get('/all', documentsController.getAllDocuments);
router.get('/categories', documentsController.getCategories);
router.get('/pending-uploads', documentsController.getPendingUploads);
router.put('/:id/upload-status', documentsController.updateUploadStatus);
router.get('/statistics', documentsController.getStatistics);
router.delete('/:id', documentsController.deleteDocument);

module.exports = router;