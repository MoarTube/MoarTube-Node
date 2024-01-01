const express = require('express');

const { root_GET } = require('../controllers/watch');

const router = express.Router();

router.get('/', async (req, res) => {
    root_GET(req, res);
});

module.exports = router;