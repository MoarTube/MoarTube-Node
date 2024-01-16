const express = require('express');

const { reportsComments_GET, reportsCommentsArchive_POST, reportsCommentsReportIdDelete_DELETE } = require('../controllers/reports-comments');

const router = express.Router();

router.get('/', async (req, res) => {
    reportsComments_GET(req, res);
});

router.post('/archive', (req, res) => {
    reportsCommentsArchive_POST(req, res);
});

router.delete('/:reportId/delete', async (req, res) => {
    reportsCommentsReportIdDelete_DELETE(req, res);
});

module.exports = router;