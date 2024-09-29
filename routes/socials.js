const express = require('express');

const { socialmediaAll_GET, socialMediaAdd_POST, socialMediaDelete_POST } = require('../controllers/socials.js');

const router = express.Router();

router.get('/socialMedia/all', (req, res) => {
    socialmediaAll_GET(req, res);
});

router.post('/socialMedia/add', (req, res) => {
    socialMediaAdd_POST(req, res);
});

router.post('/socialMedia/delete', (req, res) => {
    socialMediaDelete_POST(req, res);
});

module.exports = router;