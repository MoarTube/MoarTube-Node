const express = require('express');

const { 
    linksAll_GET, linksAdd_POST, linksDelete_POST 
} = require('../controllers/links.js');
const { 
    logDebugMessageToConsole 
} = require('../utils/logger.js');
const { 
    performAuthenticationCheck 
} = require('../middleware/authentication');

const router = express.Router();

router.get('/all', performAuthenticationCheck(false), async (req, res) => {
    try {
        const data = await linksAll_GET();

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/add', performAuthenticationCheck(true), async (req, res) => {
    try {
        const url = req.body.url;
        const svgGraphic = req.body.svgGraphic;

        const data = await linksAdd_POST(url, svgGraphic);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/delete', performAuthenticationCheck(true), async (req, res) => {
    try {
        const linkId = req.body.linkId;

        const data = await linksDelete_POST(linkId);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

module.exports = router;