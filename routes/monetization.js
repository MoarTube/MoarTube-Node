const express = require('express');

const { walletAddressAll_GET, walletAddressAdd_POST, walletAddressDelete_POST } = require('../controllers/monetization.js');

const router = express.Router();

router.get('/walletAddress/all', async (req, res) => {
    const data = await walletAddressAll_GET(req, res);

    res.send(data);
});

router.post('/walletAddress/add', async (req, res) => {
    const data = await walletAddressAdd_POST(req, res);

    res.send(data);
});

router.post('/walletAddress/delete', async (req, res) => {
    const data = await walletAddressDelete_POST(req, res);

    res.send(data);
});

module.exports = router;