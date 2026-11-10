const express = require('express');
const attendanceController = require('../controllers/attendanceController');

const router = express.Router();

router.post('/register', attendanceController.register);
router.get('/today', attendanceController.today);
router.get('/', attendanceController.list);

module.exports = router;
