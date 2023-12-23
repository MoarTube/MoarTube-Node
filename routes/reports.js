const express = require('express');

const { reportsCount_GET } = require('../controllers/reports');

const router = express.Router();

router.get('/count', async (req, res) => {
    reportsCount_GET(req, res);
});

module.exports = router;