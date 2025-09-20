const express = require('express');
const router = express.Router();
const vnsController = require('../controllers/vnsController');

// 訪問看護ステーション関連のルート
router.get('/', vnsController.getAllVNS);
router.post('/', vnsController.createVNS);
router.put('/:id', vnsController.updateVNS);
router.delete('/:id', vnsController.deleteVNS);

module.exports = router;