const express = require('express');

const { information_GET, heartbeat_GET, videos_POST } = require('../controllers/status');
const { logDebugMessageToConsole } = require('../utils/logger');

const router = express.Router();

router.get('/information', async (req, res) => {
    try {
        const data = await information_GET();

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack, true);
    
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

router.get('/heartbeat', async (req, res) => {
    try {
        const data = await heartbeat_GET();

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack, true);

        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

router.post('/videos', async (req, res) => {
    try {
        const videoIds = req.body.videoIds;

        const data = await videos_POST(videoIds);

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack, true);
    
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

module.exports = router;