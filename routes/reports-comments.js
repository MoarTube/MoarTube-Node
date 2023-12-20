const express = require('express');

const { reportsComments_GET, reportsCommentsArchive_POST, reportsCommentsReportIdDelete_DELETE, reportsCommentsCaptcha_GET } = require('../controllers/reports-comments');

const router = express.Router();

router.get('/reports/comments', async (req, res) => {
    reportsComments_GET(req, res);
});

router.post('/reports/comments/archive', (req, res) => {
    reportsCommentsArchive_POST(req, res);
});

router.delete('/reports/comments/:reportId/delete', async (req, res) => {
    reportsCommentsReportIdDelete_DELETE(req, res);
});

router.get('/reports/comments/captcha', async (req, res) => {
    reportsCommentsCaptcha_GET(req, res);
});

module.exports = router;