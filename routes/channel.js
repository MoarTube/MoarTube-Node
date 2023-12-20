const express = require('express');

const { 
     search_GET
} = require('../controllers/channel');

const router = express.Router();

router.get('/search', (req, res) => {
    search_GET(req, res);
});

module.exports = router;