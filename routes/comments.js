const express = require('express');

const { 
    search_GET, commentIdReport_POST 
} = require('../controllers/comments');
const { 
    logDebugMessageToConsole 
} = require('../utils/logger');
const { 
    performAuthenticationCheck 
} = require('../middleware/authentication');

const router = express.Router();

router.get('/search', performAuthenticationCheck(true), async (req, res) => {
    try {
        const videoId = req.query.videoId;
        const searchTerm = req.query.searchTerm;
        const timestamp = req.query.timestamp;
        const limit = req.query.limit;

        const data = await search_GET(videoId, searchTerm, timestamp, limit);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/:commentId/report', performAuthenticationCheck(false), async (req, res) => {
    try {
        const commentId = req.params.commentId;
        const email = req.body.email;
        const reportType = req.body.reportType;
        const message = req.body.message;
        const cloudflareTurnstileToken = req.body.cloudflareTurnstileToken;

        const cloudflareConnectingIp = req.header('CF-Connecting-IP');

        const data = await commentIdReport_POST(commentId, email, reportType, message, cloudflareTurnstileToken, cloudflareConnectingIp);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

module.exports = router;