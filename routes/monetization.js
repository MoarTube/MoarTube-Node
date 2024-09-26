const express = require('express');

const { walletAddressAll_GET, walletAddressAdd_POST, walletAddressDelete_POST } = require('../controllers/monetization.js');

const router = express.Router();

router.get('/walletAddress/all', (req, res) => {
    walletAddressAll_GET(req, res);
});

router.post('/walletAddress/add', (req, res) => {
    walletAddressAdd_POST(req, res);
});

router.post('/walletAddress/delete', (req, res) => {
    walletAddressDelete_POST(req, res);
});

module.exports = router;