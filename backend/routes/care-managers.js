const express = require('express');
const router = express.Router();
const careManagersController = require('../controllers/careManagersController');

// ケアマネージャー関連のルート
router.get('/', careManagersController.getAllCareManagers);
router.get('/office/:officeId', careManagersController.getCareManagersByOffice);
router.post('/', careManagersController.createCareManager);
router.put('/:id', careManagersController.updateCareManager);
router.delete('/:id', careManagersController.deleteCareManager);

module.exports = router;