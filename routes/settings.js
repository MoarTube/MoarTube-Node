const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const { 
    root_GET, avatar_GET, avatar_POST, banner_GET, banner_POST, personalizeNodeName_POST, personalizeNodeAbout_POST, personalizeNodeId_POST, secure_POST, account_POST, 
    networkInternal_POST, networkExternal_POST, cloudflareConfigure_POST, cloudflareClear_POST, cloudflareTurnstileConfigure_POST, cloudflareTurnstileConfigureClear_POST
} = require('../controllers/settings');
const { getImagesDirectoryPath, getCertificatesDirectoryPath, getDataDirectoryPath, getPublicDirectoryPath
} = require('../utils/paths');
const { logDebugMessageToConsole } = require('../utils/logger');
const { getAuthenticationStatus } = require('../utils/helpers');

const router = express.Router();

router.get('/', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const data = root_GET();

            res.send(data);
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.get('/avatar', (req, res) => {
    const fileStream = avatar_GET();

    if(fileStream != null) {
        res.setHeader('Content-Type', 'image/png');
        
        fileStream.pipe(res);
    }
    else {
        res.status(404).send('avatar not found');
    }
});

router.post('/avatar', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            logDebugMessageToConsole('uploading node avatar', null, null, true);
            
            multer(
            {
                fileFilter: function (req, file, cb) {
                    const mimeType = file.mimetype;
                    
                    if(mimeType === 'image/png') {
                        cb(null, true);
                    }
                    else {
                        cb(new Error('Invalid file upload mime type detected!'));
                    }
                },
                storage: multer.diskStorage({
                    destination: function (req, file, cb) {
                        fs.access(getImagesDirectoryPath(), fs.constants.F_OK, function(error) {
                            if(error) {
                                cb(new Error('file upload error'), null);
                            }
                            else {
                                cb(null, getImagesDirectoryPath());
                            }
                        });
                    },
                    filename: function (req, file, cb) {
                        let extension;
                        
                        if(file.mimetype === 'image/png') {
                            extension = '.png';
                        }
                        
                        const fileName = uuidv4() + extension;
                        
                        cb(null, fileName);
                    }
                })
            }).fields([{ name: 'iconFile', maxCount: 1 }, { name: 'avatarFile', maxCount: 1 }])
            (req, res, async function(error)
            {
                if(error) {
                    logDebugMessageToConsole(null, error, new Error().stack, true);
                    
                    res.send({isError: true, message: error.message});
                }
                else {
                    logDebugMessageToConsole('uploaded node avatar', null, null, true);

                    const iconFile = req.files['iconFile'][0];
                    const avatarFile = req.files['avatarFile'][0];
                    
                    const data = await avatar_POST(iconFile, avatarFile);

                    res.send(data);
                }
            });
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.get('/banner', (req, res) => {
    const fileStream = banner_GET();

    if(fileStream != null) {
        res.setHeader('Content-Type', 'image/png');
        
        fileStream.pipe(res);
    }
    else {
        res.status(404).send('banner not found');
    }
});

router.post('/banner', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            logDebugMessageToConsole('uploading node banner', null, null, true);
            
            multer(
            {
                fileFilter: function (req, file, cb) {
                    const mimeType = file.mimetype;
                    
                    if(mimeType === 'image/png') {
                        cb(null, true);
                    }
                    else {
                        cb(new Error('Invalid file upload mime type detected!'));
                    }
                },
                storage: multer.diskStorage({
                    destination: function (req, file, cb) {
                        fs.access(getImagesDirectoryPath(), fs.constants.F_OK, function(error) {
                            if(error) {
                                cb(new Error('file upload error'), null);
                            }
                            else {
                                cb(null, getImagesDirectoryPath());
                            }
                        });
                    },
                    filename: function (req, file, cb) {
                        let extension;
                        
                        if(file.mimetype === 'image/png') {
                            extension = '.png';
                        }
                        
                        const fileName = uuidv4() + extension;
                        
                        cb(null, fileName);
                    }
                })
            }).fields([{ name: 'bannerFile', maxCount: 1 }])
            (req, res, function(error)
            {
                if(error) {
                    logDebugMessageToConsole(null, error, new Error().stack, true);
                    
                    res.send({isError: true, message: error.message});
                }
                else {
                    logDebugMessageToConsole('uploaded node banner', null, null, true);

                    const bannerFile = req.files['bannerFile'][0];

                    const data = banner_POST(bannerFile);

                    res.send(data);
                }
            });
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.post('/personalize/nodeName', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            const nodeName = req.body.nodeName;

            const data = await personalizeNodeName_POST(nodeName);

            res.send(data);
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.post('/personalize/nodeAbout', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            const nodeAbout = req.body.nodeAbout;

            const data = await personalizeNodeAbout_POST(nodeAbout);

            res.send(data);
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.post('/personalize/nodeId', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            const nodeId = req.body.nodeId;

            const data = await personalizeNodeId_POST(nodeId);

            res.send(data);
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.post('/secure', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            let isSecure = (req.query.isSecure === 'true');

            if(isSecure) {
                multer({
                    fileFilter: function (req, file, cb) {
                        cb(null, true);
                    },
                    storage: multer.diskStorage({
                        destination: function (req, file, cb) {
                            fs.access(getCertificatesDirectoryPath(), fs.constants.F_OK, function(error) {
                                if(error) {
                                    cb(new Error('file upload error'), null);
                                }
                                else {
                                    cb(null, getCertificatesDirectoryPath());
                                }
                            });
                        },
                        filename: function (req, file, cb) {
                            if(file.fieldname === 'keyFile') {
                                cb(null, 'private_key.pem');
                            }
                            else if(file.fieldname === 'certFile') {
                                cb(null, 'certificate.pem');
                            }
                            else if(file.fieldname === 'caFiles') {
                                cb(null, file.originalname);
                            }
                            else {
                                cb(new Error('invalid field name in POST /settings/secure:' + file.fieldname), null);
                            }
                        }
                    })
                }).fields([{ name: 'keyFile', maxCount: 1 }, { name: 'certFile', maxCount: 1 }, { name: 'caFiles' }])
                (req, res, async function(error) {
                    if(error) {
                        logDebugMessageToConsole(null, error, new Error().stack, true);
                        
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        const keyFile = req.files['keyFile'];
                        const certFile = req.files['certFile'];
                        const caFiles = req.files['caFiles'];

                        const data = secure_POST(isSecure, keyFile, certFile, caFiles);

                        res.send(data);

                        process.send({ cmd: 'restart_server' });
                    }
                });
            }
            else {
                const data = secure_POST(isSecure);

                res.send(data);

                process.send({ cmd: 'restart_server' });
            }
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.post('/cloudflare/configure', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            const cloudflareEmailAddress = req.body.cloudflareEmailAddress;
            const cloudflareZoneId = req.body.cloudflareZoneId;
            const cloudflareGlobalApiKey = req.body.cloudflareGlobalApiKey;

            const data = await cloudflareConfigure_POST(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey);

            res.send(data);
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.post('/cloudflare/clear', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const data = cloudflareClear_POST();

            res.send(data);
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.post('/cloudflare/turnstile/configure', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const cloudflareTurnstileSiteKey = req.body.cloudflareTurnstileSiteKey;
            const cloudflareTurnstileSecretKey = req.body.cloudflareTurnstileSecretKey;
            
            const data = cloudflareTurnstileConfigure_POST(cloudflareTurnstileSiteKey, cloudflareTurnstileSecretKey);

            res.send(data);
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.post('/cloudflare/turnstile/clear', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            const data = cloudflareTurnstileConfigureClear_POST();

            res.send(data);
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.post('/account', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const username = req.body.username;
            const password = req.body.password;

            const data = account_POST(username, password);

            res.send(data);
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.post('/network/internal', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const listeningNodePort = req.body.listeningNodePort;

            const data = networkInternal_POST(listeningNodePort);

            res.send(data);

            process.send({ cmd: 'restart_server' });
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.post('/network/external', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            const publicNodeProtocol = req.body.publicNodeProtocol;
            const publicNodeAddress = req.body.publicNodeAddress;
            const publicNodePort = req.body.publicNodePort;

            const data = await networkExternal_POST(publicNodeProtocol, publicNodeAddress, publicNodePort);

            res.send(data);
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

module.exports = router;