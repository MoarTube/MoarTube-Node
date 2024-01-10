const express = require('express');

const { root_GET, search_GET } = require('../controllers/node');

const router = express.Router();

router.get('/', (req, res) => {
    root_GET(req, res);
});

router.get('/search', (req, res) => {
    search_GET(req, res);
});

module.exports = router;