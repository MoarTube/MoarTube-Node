const express = require('express');

const { root_GET, information_GET, heartbeat_GET, watch_GET } = require('../controllers/home');

const router = express.Router();

router.get('/', (req, res) => {
    root_GET(req, res);
});

router.get('/information', (req, res) => {
    information_GET(req, res);
});

router.get('/heartbeat', (req, res) => {
    heartbeat_GET(req, res);
});

router.get('/watch', async (req, res) => {
    watch_GET(req, res);
});

module.exports = router;