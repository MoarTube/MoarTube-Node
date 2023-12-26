const express = require('express');

const { root_POST } = require('../controllers/configure');

const router = express.Router();

router.post('/', async (req, res) => {
    root_POST(req, res);
});

module.exports = router;