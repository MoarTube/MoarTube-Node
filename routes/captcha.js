const express = require('express');

const { 
    discussion_GET, likedislike_GET, index_GET, alias_GET 
} = require('../controllers/captcha');

const router = express.Router();

router.get('/discussion', async (req, res) => {
    discussion_GET(req, res);
});

router.get('/likedislike', async (req, res) => {
    likedislike_GET(req, res);
});

router.get('/index', async (req, res) => {
    index_GET(req, res);
});

router.get('/alias', async (req, res) => {
    alias_GET(req, res);
});

module.exports = router;