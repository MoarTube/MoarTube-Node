const fs = require('fs');
const path = require('path');
const multer = require('multer');
const httpTerminator = require('http-terminator');

const { logDebugMessageToConsole, getAuthenticationStatus, getNodeSettings, setNodeSettings, getNodeIdentification, performNodeIdentification } = require('../utils/helpers');
const { 
    isNodeNameValid, isNodeAboutValid, isNodeIdValid, isBooleanValid, isBooleanStringValid, isUsernameValid, isPasswordValid, 
    isPublicNodeProtocolValid, isPublicNodeAddressValid, isPortValid
} = require('../utils/validators');
const { indexer_doNodePersonalizeUpdate, indexer_doNodeExternalNetworkUpdate } = require('../utils/indexer-communications');

function root_GET(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const nodeSettings = getNodeSettings();
            
            res.send({isError: false, nodeSettings: nodeSettings});
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
}

function avatar_GET(req, res) {
    const customAvatarDirectoryPath = path.join(path.join(getDataDirectoryPath(), 'images'), 'avatar.png');
    const defaultAvatarDirectoryPath = path.join(path.join(getPublicDirectoryPath(), 'images'), 'avatar.png');
    
    var avatarFilePath;

    if(fs.existsSync(customAvatarDirectoryPath)) {
        avatarFilePath = customAvatarDirectoryPath;
    }
    else if(fs.existsSync(defaultAvatarDirectoryPath)) {
        avatarFilePath = defaultAvatarDirectoryPath;
    }
    
    if (avatarFilePath != null) {
        const fileStream = fs.createReadStream(avatarFilePath);
        
        res.setHeader('Content-Type', 'image/png');
        
        fileStream.pipe(res);
    }
    else {
        res.status(404).send('avatar not found');
    }
}

function avatar_POST(req, res) {
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
                        fs.access(IMAGES_DIRECTORY_PATH, fs.F_OK, function(error) {
                            if(error) {
                                cb(new Error('file upload error'));
                            }
                            else {
                                cb(null, IMAGES_DIRECTORY_PATH);
                            }
                        });
                    },
                    filename: function (req, file, cb) {
                        var extension;
                        
                        if(file.mimetype === 'image/png') {
                            extension = '.png';
                        }
                        
                        const fileName = uuidv4() + extension;
                        
                        cb(null, fileName);
                    }
                })
            }).fields([{ name: 'iconFile', minCount: 1, maxCount: 1 }, { name: 'avatarFile', minCount: 1, maxCount: 1 }])
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
                    
                    const iconSourceFilePath = path.join(IMAGES_DIRECTORY_PATH, iconFile.filename);
                    const avatarSourceFilePath = path.join(IMAGES_DIRECTORY_PATH, avatarFile.filename);
                    
                    const iconDestinationFilePath = path.join(IMAGES_DIRECTORY_PATH, 'icon.png');
                    const avatarDestinationFilePath = path.join(IMAGES_DIRECTORY_PATH, 'avatar.png');
                    
                    fs.renameSync(iconSourceFilePath, iconDestinationFilePath);
                    fs.renameSync(avatarSourceFilePath, avatarDestinationFilePath);

                    submitDatabaseWriteJob('UPDATE videos SET is_index_outdated = CASE WHEN is_indexed = 1 THEN 1 ELSE is_index_outdated END', [], function(isError) {
                        if(isError) {
                            res.send({isError: true, message: 'error communicating with the MoarTube node'});
                        }
                        else {
                            res.send({isError: false});
                        }
                    });
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
}

function banner_GET(req, res) {
    const customBannerDirectoryPath = path.join(path.join(getDataDirectoryPath(), 'images'), 'banner.png');
    const defaultBannerDirectoryPath = path.join(path.join(getPublicDirectoryPath(), 'images'), 'banner.png');
    
    var bannerFilePath;

    if(fs.existsSync(customBannerDirectoryPath)) {
        bannerFilePath = customBannerDirectoryPath;
    }
    else if(fs.existsSync(defaultBannerDirectoryPath)) {
        bannerFilePath = defaultBannerDirectoryPath;
    }
    
    if (bannerFilePath != null) {
        const fileStream = fs.createReadStream(bannerFilePath);
        
        res.setHeader('Content-Type', 'image/png');
        
        fileStream.pipe(res);
    }
    else {
        res.status(404).send('banner not found');
    }
}

function banner_POST(req, res) {
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
                        fs.access(IMAGES_DIRECTORY_PATH, fs.F_OK, function(error) {
                            if(error) {
                                cb(new Error('file upload error'));
                            }
                            else {
                                cb(null, IMAGES_DIRECTORY_PATH);
                            }
                        });
                    },
                    filename: function (req, file, cb) {
                        var extension;
                        
                        if(file.mimetype === 'image/png') {
                            extension = '.png';
                        }
                        
                        const fileName = Date.now() + extension;
                        
                        cb(null, fileName);
                    }
                })
            }).fields([{ name: 'bannerFile', minCount: 1, maxCount: 1 }])
            (req, res, async function(error)
            {
                if(error) {
                    logDebugMessageToConsole(null, error, new Error().stack, true);
                    
                    res.send({isError: true, message: error.message});
                }
                else {
                    logDebugMessageToConsole('uploaded node banner', null, null, true);
                    
                    const bannerFile = req.files['bannerFile'][0];
                    
                    const bannerSourceFilePath = path.join(IMAGES_DIRECTORY_PATH, bannerFile.filename);
                    
                    const bannerDestinationFilePath = path.join(IMAGES_DIRECTORY_PATH, 'banner.png');
                    
                    fs.renameSync(bannerSourceFilePath, bannerDestinationFilePath);
                    
                    res.send({isError: false});
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
}

function personalize_POST(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const nodeName = req.body.nodeName;
            const nodeAbout = req.body.nodeAbout;
            const nodeId = req.body.nodeId;
            
            if(isNodeNameValid(nodeName) && isNodeAboutValid(nodeAbout) && isNodeIdValid(nodeId)) {
                const nodeSettings = getNodeSettings();

                nodeSettings.nodeName = nodeName;
                nodeSettings.nodeAbout = nodeAbout;
                nodeSettings.nodeId = nodeId;

                if(!nodeSettings.isNodeConfigured) {
                    res.send({isError: true, message: "personalize unavailable; this node has not performed initial configuration"});
                }
                else {
                    if(nodeSettings.isNodePrivate) {
                        setNodeSettings(nodeSettings);
                        
                        res.send({ isError: false });
                    }
                    else {
                        performNodeIdentification(false)
                        .then(() => {
                            const nodeIdentification = getNodeIdentification();
                            
                            if(nodeIdentification != null) {
                                const nodeIdentifier = nodeIdentification.nodeIdentifier;
                                const nodeIdentifierProof = nodeIdentification.nodeIdentifierProof;
                                
                                indexer_doNodePersonalizeUpdate(nodeIdentifier, nodeIdentifierProof, nodeName, nodeAbout, nodeId)
                                .then(indexerResponseData => {
                                    if(indexerResponseData.isError) {
                                        logDebugMessageToConsole(indexerResponseData.message, null, new Error().stack, true);
                                        
                                        res.send({isError: true, message: 'error communicating with the MoarTube indexer'});
                                    }
                                    else {
                                        setNodeSettings(nodeSettings);
                                        
                                        res.send({ isError: false });
                                    }
                                })
                                .catch(error => {
                                    logDebugMessageToConsole(null, error, new Error().stack, true);

                                    res.send({isError: true, message: 'error communicating with the MoarTube indexer'});
                                });
                            }
                            else {
                                logDebugMessageToConsole('/settings/personalize attempted retrieving node identification but was null', null, new Error().stack, true);
                                
                                res.send({isError: true, message: 'error communicating with the MoarTube indexer'});
                            }
                        })
                        .catch(error => {
                            logDebugMessageToConsole(null, error, new Error().stack, true);

                            res.send({isError: true, message: 'an unknown error occurred'});
                        });
                    }
                }
            }
            else {
                res.send({ isError: true, message: 'invalid parameters' });
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
}

function private_POST(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const isNodePrivate = req.body.isNodePrivate;
            
            if(isBooleanValid(isNodePrivate)) {
                const nodeSettings = getNodeSettings();
                
                nodeSettings.isNodePrivate = isNodePrivate;

                setNodeSettings(nodeSettings);
                
                res.send({ isError: false });
            }
            else {
                res.send({ isError: true, message: 'invalid username and/or password' });
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
}

function secure_POST(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            var isSecure = req.query.isSecure;

            if(isBooleanStringValid(isSecure)) {
                isSecure = (isSecure === 'true');

                if(isSecure) {
                    multer({
                        fileFilter: function (req, file, cb) {
                            cb(null, true);
                        },
                        storage: multer.diskStorage({
                            destination: function (req, file, cb) {
                                fs.access(CERTIFICATES_DIRECTORY_PATH, fs.F_OK, function(error) {
                                    if(error) {
                                        cb(new Error('file upload error'));
                                    }
                                    else {
                                        cb(null, CERTIFICATES_DIRECTORY_PATH);
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
                                    cb(new Error('invalid field name in POST /settings/secure:' + file.fieldname));
                                }
                            }
                        })
                    }).fields([{ name: 'keyFile', minCount: 1, maxCount: 1 }, { name: 'certFile', minCount: 1, maxCount: 1 }, { name: 'caFiles', minCount: 0 }])
                    (req, res, async function(error) {
                        if(error) {
                            logDebugMessageToConsole(null, error, new Error().stack, true);
                            
                            res.send({isError: true, message: 'error communicating with the MoarTube node'});
                        }
                        else {
                            var keyFile = req.files['keyFile'];
                            var certFile = req.files['certFile'];
                            const caFiles = req.files['caFiles'];
                            
                            if(keyFile == null || keyFile.length !== 1) {
                                res.send({isError: true, message: 'private key file is missing'});
                            }
                            else if(certFile == null || certFile.length !== 1) {
                                res.send({isError: true, message: 'cert file is missing'});
                            }
                            else {
                                logDebugMessageToConsole('switching node to HTTPS mode', null, null, true);

                                res.send({isError: false});

                                process.send({ cmd: 'restart_server', httpMode: 'HTTPS' });
                            }
                        }
                    });
                }
                else {
                    logDebugMessageToConsole('switching node to HTTP mode', null, null, true);

                    res.send({isError: false});
                    
                    process.send({ cmd: 'restart_server', httpMode: 'HTTP' });
                }
            }
            else {
                res.send({isError: true, message: 'invalid parameters'});
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
}

function account_POST(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const username = req.body.username;
            const password = req.body.password;
            
            if(isUsernameValid(username) && isPasswordValid(password)) {
                const usernameHash = encodeURIComponent(Buffer.from(bcryptjs.hashSync(username, 10), 'utf8').toString('base64'));
                const passwordHash = encodeURIComponent(Buffer.from(bcryptjs.hashSync(password, 10), 'utf8').toString('base64'));
                
                const nodeSettings = getNodeSettings();
                
                nodeSettings.username = usernameHash;
                nodeSettings.password = passwordHash;

                setNodeSettings(nodeSettings);
                
                res.send({ isError: false });
            }
            else {
                res.send({ isError: true, message: 'invalid username and/or password' });
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
}

function networkInternal_POST(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            if(IS_DOCKER_ENVIRONMENT) {
                res.send({isError: true, message: 'This node cannot change listening ports because it is running inside of a docker container.'});
            }
            else {
                const listeningNodePort = req.body.listeningNodePort;
                
                if(isPortValid(listeningNodePort)) {
                    
                    res.send({isError: false});
                    
                    //httpServerWrapper.httpServer.closeAllConnections();
                    
                    httpServerWrapper.websocketServer.clients.forEach(function each(client) {
                        if (client.readyState === webSocket.OPEN) {
                            client.close();
                        }
                    });
                    
                    logDebugMessageToConsole('attempting to terminate node', null, null, true);
                    
                    const terminator = httpTerminator.createHttpTerminator({server: httpServerWrapper.httpServer});
                    
                    logDebugMessageToConsole('termination of node in progress', null, null, true);
                    
                    await terminator.terminate();
                    
                    logDebugMessageToConsole('terminated node', null, null, true);
                    
                    httpServerWrapper.websocketServer.close(function() {
                        logDebugMessageToConsole('node websocketServer closed', null, null, true);
                        
                        httpServerWrapper.httpServer.close(async () => {
                            logDebugMessageToConsole('node web server closed', null, null, true);
                            
                            const nodeSettings = getNodeSettings();
                            
                            nodeSettings.nodeListeningPort = listeningNodePort;
                            
                            setNodeSettings(nodeSettings);
                            
                            MOARTUBE_NODE_HTTP_PORT = listeningNodePort;
                            
                            httpServerWrapper = await initializeHttpServer();
                        });
                    });
                }
                else {
                    res.send({ isError: true, message: 'invalid parameters' });
                }
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
}

function networkExternal_POST(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const publicNodeProtocol = req.body.publicNodeProtocol;
            const publicNodeAddress = req.body.publicNodeAddress;
            const publicNodePort = req.body.publicNodePort;
            
            if(isPublicNodeProtocolValid(publicNodeProtocol) && isPublicNodeAddressValid(publicNodeAddress) && isPortValid(publicNodePort)) {
                const nodeSettings = getNodeSettings();

                nodeSettings.publicNodeProtocol = publicNodeProtocol;
                nodeSettings.publicNodeAddress = publicNodeAddress;
                nodeSettings.publicNodePort = publicNodePort;
                nodeSettings.isNodeConfigured = true;
                
                if(nodeSettings.isNodePrivate) {
                    setNodeSettings(nodeSettings);
                    
                    res.send({ isError: false });
                }
                else {
                    performNodeIdentification(true)
                    .then(() => {
                        const nodeIdentification = getNodeIdentification();
                        
                        const nodeIdentifier = nodeIdentification.nodeIdentifier;
                        const nodeIdentifierProof = nodeIdentification.nodeIdentifierProof;
                        
                        indexer_doNodeExternalNetworkUpdate(nodeIdentifier, nodeIdentifierProof, publicNodeProtocol, publicNodeAddress, publicNodePort)
                        .then(indexerResponseData => {
                            if(indexerResponseData.isError) {
                                res.send({isError: true, message: indexerResponseData.message});
                            }
                            else {
                                setNodeSettings(nodeSettings);
                                
                                res.send({ isError: false });
                            }
                        })
                        .catch(error => {
                            logDebugMessageToConsole(null, error, new Error().stack, true);
                            
                            res.send({isError: true, message: 'an unknown error occurred'});
                        });
                    })
                    .catch(error => {
                        logDebugMessageToConsole(null, error, new Error().stack, true);
                        
                        res.send({isError: true, message: 'an unknown error occurred'});
                    });
                }
            }
            else {
                res.send({ isError: true, message: 'invalid parameters' });
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
}

module.exports = {
    root_GET,
    avatar_GET,
    avatar_POST,
    banner_GET,
    banner_POST,
    personalize_POST,
    private_POST,
    secure_POST,
    account_POST,
    networkInternal_POST,
    networkExternal_POST
};