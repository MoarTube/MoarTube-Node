const express = require('express');

const { root_GET } = require('../controllers/base');
const { performAuthenticationCheck } = require('../middleware/authentication');

const router = express.Router();

router.get('/', performAuthenticationCheck(false), (req, res) => {
    const originalUrl = req.originalUrl;
    const path = req.path;

    const url = root_GET(originalUrl, path);

    res.redirect(url);
});

module.exports = router;