const express = require('express');

const { commentIdReport_POST } = require('../controllers/comments');

const router = express.Router();

router.post('/:commentId/report', async (req, res) => {
    commentIdReport_POST(req, res);
});

module.exports = router;