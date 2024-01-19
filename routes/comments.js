const express = require('express');

const { search_GET, commentIdReport_POST } = require('../controllers/comments');

const router = express.Router();

router.get('/search', async (req, res) => {
    search_GET(req, res);
});

router.post('/:commentId/report', async (req, res) => {
    commentIdReport_POST(req, res);
});

module.exports = router;