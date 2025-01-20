const express = require('express');

const { walletAddressAll_GET, walletAddressAdd_POST, walletAddressDelete_POST } = require('../controllers/monetization.js');
const { logDebugMessageToConsole } = require('../utils/logger');
const { performAuthenticationCheck } = require('../middleware/authentication');

const router = express.Router();

router.get('/all', performAuthenticationCheck(false), async (req, res) => {
    try {
        const data = await walletAddressAll_GET();
        
        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

router.post('/add', performAuthenticationCheck(true), async (req, res) => {
    try {
        const walletAddress = req.body.walletAddress;
        const chain = req.body.chain;
        const currency = req.body.currency;

        const data = await walletAddressAdd_POST(walletAddress, chain, currency);
        
        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

router.post('/delete', performAuthenticationCheck(true), async (req, res) => {
    try {
        const cryptoWalletAddressId = req.body.cryptoWalletAddressId;

        const data = await walletAddressDelete_POST(cryptoWalletAddressId);

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

module.exports = router;