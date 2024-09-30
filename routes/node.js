const express = require('express');

const { root_GET, search_GET, newContentCounts_GET, contentChecked_POST } = require('../controllers/node');

const router = express.Router();

router.get('/', (req, res) => {
    root_GET(req, res);
});

router.get('/search', async (req, res) => {
    const searchTerm = req.query.searchTerm;
    const sortTerm = req.query.sortTerm;
    const tagTerm = req.query.tagTerm;

    const data = await search_GET(searchTerm, sortTerm, tagTerm);

    res.send(data);
});

router.get('/newContentCounts', (req, res) => {
    newContentCounts_GET(req, res);
});

router.post('/contentChecked', (req, res) => {
    contentChecked_POST(req, res);
});

module.exports = router;