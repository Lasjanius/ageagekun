const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

// AI生成関連のルート
router.post('/generate-kyotaku-report', aiController.generateKyotakuReport);
router.get('/status', aiController.checkApiStatus);

module.exports = router;