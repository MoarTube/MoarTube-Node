const express = require('express');

const { 
    root_GET, avatar_GET, avatar_POST, banner_GET, banner_POST, personalize_POST, secure_POST, account_POST, networkInternal_POST, networkExternal_POST,
    cloudflareConfigure_POST, cloudflareClear_POST
} = require('../controllers/settings');

const router = express.Router();

router.get('/', (req, res) => {
    root_GET(req, res);
});

router.get('/avatar', (req, res) => {
    avatar_GET(req, res);
});

router.post('/avatar', (req, res) => {
    avatar_POST(req, res);
});

router.get('/banner', (req, res) => {
    banner_GET(req, res);
});

router.post('/banner', (req, res) => {
    banner_POST(req, res);
});

router.post('/personalize', (req, res) => {
    personalize_POST(req, res);
});

router.post('/secure', async (req, res) => {
    secure_POST(req, res);
});

router.post('/cloudflare/configure', (req, res) => {
    cloudflareConfigure_POST(req, res);
});

router.post('/cloudflare/clear', (req, res) => {
    cloudflareClear_POST(req, res);
});

router.post('/account', (req, res) => {
    account_POST(req, res);
});

router.post('/network/internal', (req, res) => {
    networkInternal_POST(req, res);
});

router.post('/network/external', (req, res) => {
    networkExternal_POST(req, res);
});

module.exports = router;