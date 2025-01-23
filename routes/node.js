const express = require('express');

const { root_GET, search_GET, newContentCounts_GET, contentChecked_POST } = require('../controllers/node');
const { logDebugMessageToConsole } = require('../utils/logger');
const { performAuthenticationCheck } = require('../middleware/authentication');

const router = express.Router();

router.get('/', performAuthenticationCheck(false), async (req, res) => {
    try {
        const searchTerm = req.query.searchTerm;
        const sortTerm = req.query.sortTerm;
        const tagTerm = req.query.tagTerm;

        const data = await root_GET(searchTerm, sortTerm, tagTerm);

        res.render('node', data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.status(500).send('node page rendering error');
    }
});

router.get('/search', performAuthenticationCheck(false), async (req, res) => {
    try {
        const searchTerm = req.query.searchTerm;
        const sortTerm = req.query.sortTerm;
        const tagTerm = req.query.tagTerm;

        const data = await search_GET(searchTerm, sortTerm, tagTerm);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.get('/newContentCounts', performAuthenticationCheck(true), async (req, res) => {
    try {
        const data = await newContentCounts_GET();

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/contentChecked', performAuthenticationCheck(true), (req, res) => {
    try {
        const contentType = req.body.contentType;

        const data = contentChecked_POST(contentType);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

module.exports = router;