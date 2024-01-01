const express = require('express');

const { javascript_GET, css_GET, fonts_GET, images1_GET, images2_GET } = require('../controllers/assets-resources');

const router = express.Router();

router.use('/javascript', javascript_GET());
router.use('/css', css_GET());
router.use('/fonts', fonts_GET());
router.use('/images', (req, res, next) => {
    images1_GET(req, res, next);
});
router.use('/images', images2_GET());

module.exports = router;