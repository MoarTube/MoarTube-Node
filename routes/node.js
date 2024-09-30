const express = require('express');

const { root_GET, search_GET, newContentCounts_GET, contentChecked_POST } = require('../controllers/node');
const { logDebugMessageToConsole } = require('../utils/logger');
const { getAuthenticationStatus } = require('../utils/helpers');

const router = express.Router();

router.get('/', (req, res) => {
    let searchTerm = req.query.searchTerm;
    let sortTerm = req.query.sortTerm;
    let tagTerm = req.query.tagTerm;

    const data = root_GET(searchTerm, sortTerm, tagTerm);

    res.render('node', data);
});

router.get('/search', async (req, res) => {
    const searchTerm = req.query.searchTerm;
    const sortTerm = req.query.sortTerm;
    const tagTerm = req.query.tagTerm;

    const data = await search_GET(searchTerm, sortTerm, tagTerm);

    res.send(data);
});

router.get('/newContentCounts', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            const data = await newContentCounts_GET();

            res.send(data);
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

router.post('/contentChecked', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            const contentType = req.body.contentType;

            const data = contentChecked_POST(contentType);

            res.send(data);
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