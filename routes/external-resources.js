const express = require('express');

const { javascript_GET, css_GET, fonts_GET, images1_GET, images2_GET } = require('../controllers/external-resources');

const router = express.Router();

router.use('/javascript', javascript_GET());
router.use('/css', css_GET());
router.use('/fonts', fonts_GET());
router.use('/images', (req, res, next) => {
    const url = req.url;

    const fileStream = images1_GET(url);

    if(fileStream != null) {
        res.setHeader('Content-Type', 'image/png');
        fileStream.pipe(res);
    }
    else {
        next();
    }
});
router.use('/images', images2_GET());

module.exports = router;