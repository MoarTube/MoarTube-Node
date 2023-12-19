const express = require('express');

const { signIn_POST, signOut_GET, authenticated_GET } = require('../controllers/account');

const router = express.Router();

router.post('/signin', function(req, res) {
    signIn_POST(req, res);
});

router.get('/signout', (req, res) => {
    signOut_GET(req, res);
});

router.get('/authenticated', (req, res) => {
    authenticated_GET(req, res);
});

module.exports = router;