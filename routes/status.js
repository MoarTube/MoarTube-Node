const express = require('express');

const { 
    information_GET, heartbeat_GET 
} = require('../controllers/status');
const { 
    logDebugMessageToConsole 
} = require('../utils/logger');
const { 
    performAuthenticationCheck 
} = require('../middleware/authentication');

const router = express.Router();

router.get('/information', performAuthenticationCheck(false), async (req, res) => {
    try {
        const data = await information_GET();

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.get('/heartbeat', performAuthenticationCheck(false), (req, res) => {
    try {
        const data = heartbeat_GET();

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

module.exports = router;