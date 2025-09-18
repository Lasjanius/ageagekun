const express = require('express');
const router = express.Router();
const filesController = require('../controllers/filesController');

// ファイル配信
router.get('/:fileId', filesController.serveFile);

// ファイル情報取得
router.get('/:fileId/info', filesController.getFileInfo);

module.exports = router;