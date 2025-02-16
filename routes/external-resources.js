const express = require('express');

const { 
    javascript_GET, css_GET, fonts_GET, images1_GET, images2_GET 
} = require('../controllers/external-resources');
const { 
    logDebugMessageToConsole 
} = require('../utils/logger');
const { 
    performAuthenticationCheck 
} = require('../middleware/authentication');

const router = express.Router();

router.use('/javascript', performAuthenticationCheck(false), javascript_GET());
router.use('/css', performAuthenticationCheck(false), css_GET());
router.use('/fonts', performAuthenticationCheck(false), fonts_GET());
router.use('/images', performAuthenticationCheck(false), (req, res, next) => {
    try {
        const url = req.url;

        const fileStream = images1_GET(url);

        if (fileStream != null) {
            res.setHeader('Content-Type', 'image/png');

            fileStream.pipe(res);
        }
        else {
            next();
        }
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        next();
    }
});
router.use('/images', performAuthenticationCheck(false), images2_GET());

module.exports = router;