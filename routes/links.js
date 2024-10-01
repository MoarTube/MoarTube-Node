const express = require('express');

const { linksAll_GET, linksAdd_POST, linksDelete_POST } = require('../controllers/links.js');
const { logDebugMessageToConsole } = require('../utils/logger.js');
const { getAuthenticationStatus } = require('../utils/helpers.js');

const router = express.Router();

router.get('/all', async (req, res) => {
    try {
        const data = await linksAll_GET();

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack, true);

        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

router.post('/add', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const url = req.body.url;
                const svgGraphic = req.body.svgGraphic;

                const data = await linksAdd_POST(url, svgGraphic);

                res.send(data);
            }
            catch(error) {
                logDebugMessageToConsole(null, error, new Error().stack, true);
                
                res.send({isError: true, message: 'error communicating with the MoarTube node'});
            }
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.post('/delete', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const linkId = req.body.linkId;

                const data = await linksDelete_POST(linkId);

                res.send(data);
            }
            catch(error) {
                logDebugMessageToConsole(null, error, new Error().stack, true);

                res.send({isError: true, message: 'error communicating with the MoarTube node'});
            }
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

module.exports = router;