const express = require('express');
const router = express.Router();
const careOfficesController = require('../controllers/careOfficesController');

// 居宅介護支援事業所関連のルート
router.get('/', careOfficesController.getAllCareOffices);
router.post('/', careOfficesController.createCareOffice);
router.put('/:id', careOfficesController.updateCareOffice);
router.delete('/:id', careOfficesController.deleteCareOffice);

module.exports = router;