const express = require('express');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const {
    root_GET, avatar_GET, avatar_POST, banner_GET, banner_POST, personalizeNodeName_POST, personalizeNodeAbout_POST, personalizeNodeId_POST, secure_POST, account_POST,
    networkInternal_POST, networkExternal_POST, cloudflareConfigure_POST, cloudflareClear_POST, cloudflareTurnstileConfigure_POST, cloudflareTurnstileConfigureClear_POST,
    commentsToggle_POST, likesToggle_POST, dislikesToggle_POST, reportsToggle_POST, liveChatToggle_POST, databaseConfigToggle_POST, storageConfigToggle_POST,
    exportDatabase_GET, importDatabase_POST
} = require('../controllers/settings');
const {
    getImagesDirectoryPath, getCertificatesDirectoryPath
} = require('../utils/paths');
const {
    logDebugMessageToConsole
} = require('../utils/logger');
const {
    performAuthenticationCheck
} = require('../middleware/authentication');

const router = express.Router();

router.get('/', performAuthenticationCheck(true), async (req, res) => {
    try {
        const data = root_GET();

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.get('/avatar', performAuthenticationCheck(false), (req, res) => {
    try {
        const fileStream = avatar_GET();

        if (fileStream != null) {
            res.setHeader('Content-Type', 'image/png');

            fileStream.pipe(res);
        }
        else {
            res.status(404).send('avatar not found');
        }
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.status(500).send('node avatar retrieval error');
    }
});

router.post('/avatar', performAuthenticationCheck(true), (req, res) => {
    logDebugMessageToConsole('uploading node avatar', null, null);

    multer(
        {
            fileFilter: function (req, file, cb) {
                const mimeType = file.mimetype;

                if (mimeType === 'image/png') {
                    cb(null, true);
                }
                else {
                    cb(new Error('Invalid file upload mime type detected!'));
                }
            },
            storage: multer.diskStorage({
                destination: function (req, file, cb) {
                    fs.access(getImagesDirectoryPath(), fs.constants.F_OK, function (error) {
                        if (error) {
                            cb(new Error('file upload error'), null);
                        }
                        else {
                            cb(null, getImagesDirectoryPath());
                        }
                    });
                },
                filename: function (req, file, cb) {
                    let extension;

                    if (file.mimetype === 'image/png') {
                        extension = '.png';
                    }

                    const fileName = uuidv4() + extension;

                    cb(null, fileName);
                }
            })
        }).fields([{ name: 'iconFile', maxCount: 1 }, { name: 'avatarFile', maxCount: 1 }])
        (req, res, async function (error) {
            if (error) {
                logDebugMessageToConsole(null, error, new Error().stack);

                res.send({ isError: true, message: error.message });
            }
            else {
                logDebugMessageToConsole('uploaded node avatar', null, null);

                try {
                    const iconFile = req.files['iconFile'][0];
                    const avatarFile = req.files['avatarFile'][0];

                    const data = await avatar_POST(iconFile, avatarFile);

                    res.send(data);
                }
                catch (error) {
                    logDebugMessageToConsole(null, error, new Error().stack);

                    res.send({ isError: true, message: 'error communicating with the MoarTube node' });
                }
            }
        });
});

router.get('/banner', performAuthenticationCheck(false), (req, res) => {
    try {
        const fileStream = banner_GET();

        if (fileStream != null) {
            res.setHeader('Content-Type', 'image/png');

            fileStream.pipe(res);
        }
        else {
            res.status(404).send('banner not found');
        }
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.status(500).send('node banner retrieval error');
    }
});

router.post('/banner', performAuthenticationCheck(true), (req, res) => {
    logDebugMessageToConsole('uploading node banner', null, null);

    multer(
        {
            fileFilter: function (req, file, cb) {
                const mimeType = file.mimetype;

                if (mimeType === 'image/png') {
                    cb(null, true);
                }
                else {
                    cb(new Error('Invalid file upload mime type detected!'));
                }
            },
            storage: multer.diskStorage({
                destination: function (req, file, cb) {
                    fs.access(getImagesDirectoryPath(), fs.constants.F_OK, function (error) {
                        if (error) {
                            cb(new Error('file upload error'), null);
                        }
                        else {
                            cb(null, getImagesDirectoryPath());
                        }
                    });
                },
                filename: function (req, file, cb) {
                    let extension;

                    if (file.mimetype === 'image/png') {
                        extension = '.png';
                    }

                    const fileName = uuidv4() + extension;

                    cb(null, fileName);
                }
            })
        }).fields([{ name: 'bannerFile', maxCount: 1 }])
        (req, res, function (error) {
            if (error) {
                logDebugMessageToConsole(null, error, new Error().stack);

                res.send({ isError: true, message: error.message });
            }
            else {
                logDebugMessageToConsole('uploaded node banner', null, null);

                try {
                    const bannerFile = req.files['bannerFile'][0];

                    const data = banner_POST(bannerFile);

                    res.send(data);
                }
                catch (error) {
                    logDebugMessageToConsole(null, error, new Error().stack);

                    res.send({ isError: true, message: 'error communicating with the MoarTube node' });
                }
            }
        });
});

router.post('/personalize/nodeName', performAuthenticationCheck(true), async (req, res) => {
    try {
        const nodeName = req.body.nodeName;

        const data = await personalizeNodeName_POST(nodeName);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/personalize/nodeAbout', performAuthenticationCheck(true), async (req, res) => {
    try {
        const nodeAbout = req.body.nodeAbout;

        const data = await personalizeNodeAbout_POST(nodeAbout);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/personalize/nodeId', performAuthenticationCheck(true), async (req, res) => {
    try {
        const nodeId = req.body.nodeId;

        const data = await personalizeNodeId_POST(nodeId);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/secure', performAuthenticationCheck(true), (req, res) => {
    let isSecure = (req.query.isSecure === 'true');

    if (isSecure) {
        multer({
            fileFilter: function (req, file, cb) {
                cb(null, true);
            },
            storage: multer.diskStorage({
                destination: function (req, file, cb) {
                    fs.access(getCertificatesDirectoryPath(), fs.constants.F_OK, function (error) {
                        if (error) {
                            cb(new Error('file upload error'), null);
                        }
                        else {
                            cb(null, getCertificatesDirectoryPath());
                        }
                    });
                },
                filename: function (req, file, cb) {
                    if (file.fieldname === 'keyFile') {
                        cb(null, 'private_key.pem');
                    }
                    else if (file.fieldname === 'certFile') {
                        cb(null, 'certificate.pem');
                    }
                    else if (file.fieldname === 'caFiles') {
                        cb(null, file.originalname);
                    }
                    else {
                        cb(new Error('invalid field name in POST /settings/secure:' + file.fieldname), null);
                    }
                }
            })
        }).fields([{ name: 'keyFile', maxCount: 1 }, { name: 'certFile', maxCount: 1 }, { name: 'caFiles' }])
            (req, res, async function (error) {
                if (error) {
                    logDebugMessageToConsole(null, error, new Error().stack);

                    res.send({ isError: true, message: 'error communicating with the MoarTube node' });
                }
                else {
                    try {
                        const keyFile = req.files['keyFile'];
                        const certFile = req.files['certFile'];
                        const caFiles = req.files['caFiles'];

                        const data = secure_POST(isSecure, keyFile, certFile, caFiles);

                        res.send(data);

                        process.send({ cmd: 'restart_server' });
                    }
                    catch (error) {
                        logDebugMessageToConsole(null, error, new Error().stack);

                        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
                    }
                }
            });
    }
    else {
        try {
            const data = secure_POST(isSecure);

            res.send(data);

            process.send({ cmd: 'restart_server' });
        }
        catch (error) {
            logDebugMessageToConsole(null, error, new Error().stack);

            res.send({ isError: true, message: 'error communicating with the MoarTube node' });
        }
    }
});

router.post('/cloudflare/configure', performAuthenticationCheck(true), async (req, res) => {
    try {
        const cloudflareEmailAddress = req.body.cloudflareEmailAddress;
        const cloudflareZoneId = req.body.cloudflareZoneId;
        const cloudflareGlobalApiKey = req.body.cloudflareGlobalApiKey;

        const data = await cloudflareConfigure_POST(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/cloudflare/clear', performAuthenticationCheck(true), async (req, res) => {
    try {
        const data = await cloudflareClear_POST();

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/cloudflare/turnstile/configure', performAuthenticationCheck(true), async (req, res) => {
    try {
        const cloudflareTurnstileSiteKey = req.body.cloudflareTurnstileSiteKey;
        const cloudflareTurnstileSecretKey = req.body.cloudflareTurnstileSecretKey;

        const data = await cloudflareTurnstileConfigure_POST(cloudflareTurnstileSiteKey, cloudflareTurnstileSecretKey);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/cloudflare/turnstile/clear', performAuthenticationCheck(true), async (req, res) => {
    try {
        const data = await cloudflareTurnstileConfigureClear_POST();

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/databaseConfig/toggle', performAuthenticationCheck(true), async (req, res) => {
    try {
        const databaseConfig = req.body.databaseConfig;

        const data = await databaseConfigToggle_POST(databaseConfig);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/storageConfig/toggle', performAuthenticationCheck(true), async (req, res) => {
    try {
        const storageConfig = req.body.storageConfig;

        const data = await storageConfigToggle_POST(storageConfig);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/comments/toggle', performAuthenticationCheck(true), (req, res) => {
    try {
        const isCommentsEnabled = req.body.isCommentsEnabled;

        const data = commentsToggle_POST(isCommentsEnabled);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/likes/toggle', performAuthenticationCheck(true), (req, res) => {
    try {
        const isLikesEnabled = req.body.isLikesEnabled;

        const data = likesToggle_POST(isLikesEnabled);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/dislikes/toggle', performAuthenticationCheck(true), (req, res) => {
    try {
        const isDislikesEnabled = req.body.isDislikesEnabled;

        const data = dislikesToggle_POST(isDislikesEnabled);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/reports/toggle', performAuthenticationCheck(true), (req, res) => {
    try {
        const isReportsEnabled = req.body.isReportsEnabled;

        const data = reportsToggle_POST(isReportsEnabled);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/liveChat/toggle', performAuthenticationCheck(true), (req, res) => {
    try {
        const isLiveChatEnabled = req.body.isLiveChatEnabled;

        const data = liveChatToggle_POST(isLiveChatEnabled);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/account', performAuthenticationCheck(true), (req, res) => {
    try {
        const username = req.body.username;
        const password = req.body.password;

        const data = account_POST(username, password);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/network/internal', performAuthenticationCheck(true), (req, res) => {
    try {
        const listeningNodePort = req.body.listeningNodePort;

        const data = networkInternal_POST(listeningNodePort);

        res.send(data);

        process.send({ cmd: 'restart_server' });
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/network/external', performAuthenticationCheck(true), async (req, res) => {
    try {
        const publicNodeProtocol = req.body.publicNodeProtocol;
        const publicNodeAddress = req.body.publicNodeAddress;
        const publicNodePort = req.body.publicNodePort;

        const data = await networkExternal_POST(publicNodeProtocol, publicNodeAddress, publicNodePort);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/import/database', performAuthenticationCheck(false), async (req, res) => {
    try {
        multer({
            storage: multer.memoryStorage(),
        }).fields([{ name: 'database_file', maxCount: 1 }])
        (req, res, async function (error) {
            if (error) {
                logDebugMessageToConsole(null, error, new Error().stack);

                res.send({ isError: true, message: 'error communicating with the MoarTube node' });
            }
            else {
                try {
                    const databaseFile = req.files['database_file'];
                    
                    const data = await importDatabase_POST(databaseFile);

                    res.send(data);
                }
                catch (error) {
                    logDebugMessageToConsole(null, error, new Error().stack);

                    res.send({ isError: true, message: 'error communicating with the MoarTube node' });
                }
            }
        });
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.get('/export/database', performAuthenticationCheck(false), async (req, res) => {
    try {
        const data = await exportDatabase_GET();

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

module.exports = router;