const express = require('express');

const { 
     CommentIdReport_POST
} = require('../controllers/comments');

const router = express.Router();

router.post('/:commentId/report', async (req, res) => {
    CommentIdReport_POST(req, res);
});

module.exports = router;