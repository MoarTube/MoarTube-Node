const express = require('express');

const { socialmediaAll_GET, socialMediaAdd_POST, socialMediaDelete_POST } = require('../controllers/socials.js');

const router = express.Router();

router.get('/socialMedia/all', async (req, res) => {
    const data = await socialmediaAll_GET(req, res);

    res.send(data);
});

router.post('/socialMedia/add', async (req, res) => {
    const data = await socialMediaAdd_POST(req, res);

    res.send(data);
});

router.post('/socialMedia/delete', async (req, res) => {
    const data = await socialMediaDelete_POST(req, res);

    res.send(data);
});

module.exports = router;