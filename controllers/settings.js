const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bcryptjs = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const packageJson = require('../package.json');

const { logDebugMessageToConsole } = require('../utils/logger');
const { getImagesDirectoryPath, getCertificatesDirectoryPath, getDataDirectoryPath, getPublicDirectoryPath
} = require('../utils/paths');
const { getAuthenticationStatus, getNodeSettings, setNodeSettings, getNodeIdentification, performNodeIdentification, getIsDockerEnvironment, websocketChatBroadcast
} = require('../utils/helpers');
const { 
    isNodeNameValid, isNodeAboutValid, isNodeIdValid, isBooleanStringValid, isUsernameValid, isPasswordValid, 
    isPublicNodeProtocolValid, isPublicNodeAddressValid, isPortValid, isCloudflareCredentialsValid
} = require('../utils/validators');
const { indexer_doNodePersonalizeNodeNameUpdate, indexer_doNodePersonalizeNodeAboutUpdate, indexer_doNodePersonalizeNodeIdUpdate, indexer_doNodeExternalNetworkUpdate } = require('../utils/indexer-communications');
const { cloudflare_setConfiguration, cloudflare_purgeEntireCache, cloudflare_resetIntegration, cloudflare_purgeNodeImages, cloudflare_purgeNodePage,
    cloudflare_purgeWatchPages } = require('../utils/cloudflare-communications');
const { submitDatabaseWriteJob, performDatabaseReadJob_ALL } = require('../utils/database');

function root_GET() {
    const nodeSettings = getNodeSettings();

    nodeSettings.version = packageJson.version;
    
    return {isError: false, nodeSettings: nodeSettings};
}

function avatar_GET() {
    const customAvatarDirectoryPath = path.join(path.join(getDataDirectoryPath(), 'images'), 'avatar.png');
    const defaultAvatarDirectoryPath = path.join(path.join(getPublicDirectoryPath(), 'images'), 'avatar.png');
    
    let avatarFilePath;

    if(fs.existsSync(customAvatarDirectoryPath)) {
        avatarFilePath = customAvatarDirectoryPath;
    }
    else if(fs.existsSync(defaultAvatarDirectoryPath)) {
        avatarFilePath = defaultAvatarDirectoryPath;
    }
    
    if (avatarFilePath != null) {
        const fileStream = fs.createReadStream(avatarFilePath);

        return fileStream;
    }
    else {
        return null;
    }
}

function avatar_POST(iconFile, avatarFile) {
    return new Promise(function(resolve, reject) {
        const iconSourceFilePath = path.join(getImagesDirectoryPath(), iconFile.filename);
        const avatarSourceFilePath = path.join(getImagesDirectoryPath(), avatarFile.filename);
        
        const iconDestinationFilePath = path.join(getImagesDirectoryPath(), 'icon.png');
        const avatarDestinationFilePath = path.join(getImagesDirectoryPath(), 'avatar.png');
        
        fs.renameSync(iconSourceFilePath, iconDestinationFilePath);
        fs.renameSync(avatarSourceFilePath, avatarDestinationFilePath);

        try {
            cloudflare_purgeNodeImages();
        }
        catch(error) {
            logDebugMessageToConsole(null, error, new Error().stack);
        }

        submitDatabaseWriteJob('UPDATE videos SET is_index_outdated = CASE WHEN is_indexed = 1 THEN 1 ELSE is_index_outdated END', [], function(isError) {
            if(isError) {
                resolve({isError: true, message: 'error communicating with the MoarTube node'});
            }
            else {
                resolve({isError: false});
            }
        });
    });
}

function banner_GET(req, res) {
    const customBannerDirectoryPath = path.join(path.join(getDataDirectoryPath(), 'images'), 'banner.png');
    const defaultBannerDirectoryPath = path.join(path.join(getPublicDirectoryPath(), 'images'), 'banner.png');
    
    let bannerFilePath;

    if(fs.existsSync(customBannerDirectoryPath)) {
        bannerFilePath = customBannerDirectoryPath;
    }
    else if(fs.existsSync(defaultBannerDirectoryPath)) {
        bannerFilePath = defaultBannerDirectoryPath;
    }

    if (bannerFilePath != null) {
        const fileStream = fs.createReadStream(bannerFilePath);

        return fileStream;
    }
    else {
        return null;
    }
}

function banner_POST(bannerFile) {
    const bannerSourceFilePath = path.join(getImagesDirectoryPath(), bannerFile.filename);
    
    const bannerDestinationFilePath = path.join(getImagesDirectoryPath(), 'banner.png');
    
    fs.renameSync(bannerSourceFilePath, bannerDestinationFilePath);

    try {
        cloudflare_purgeNodeImages();
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);
    }
    
    return {isError: false};
}

function personalizeNodeName_POST(nodeName) {
    return new Promise(function(resolve, reject) {
        if(isNodeNameValid(nodeName)) {
            const nodeSettings = getNodeSettings();

            nodeSettings.nodeName = nodeName;

            setNodeSettings(nodeSettings);
            
            performNodeIdentification()
            .then(() => {
                const nodeIdentification = getNodeIdentification();
                
                const moarTubeTokenProof = nodeIdentification.moarTubeTokenProof;
                
                indexer_doNodePersonalizeNodeNameUpdate(moarTubeTokenProof, nodeName)
                .then(indexerResponseData => {
                    if(indexerResponseData.isError) {
                        logDebugMessageToConsole(indexerResponseData.message, null, new Error().stack);
                        
                        resolve({isError: true, message: indexerResponseData.message});
                    }
                    else {
                        try {
                            cloudflare_purgeNodePage([]);
                        }
                        catch(error) {
                            logDebugMessageToConsole(null, error, new Error().stack);
                        }

                        resolve({ isError: false });
                    }
                })
                .catch(error => {
                    logDebugMessageToConsole(null, error, new Error().stack);

                    resolve({isError: true, message: 'your settings were saved to your node, but they could not be saved to the MoarTube platform'});
                });
            })
            .catch(error => {
                logDebugMessageToConsole(null, error, new Error().stack);

                resolve({isError: true, message: 'your settings were saved to your node, but they could not be saved to the MoarTube platform'});
            });
        }
        else {
            resolve({ isError: true, message: 'invalid parameters' });
        }
    });
}

function personalizeNodeAbout_POST(nodeAbout) {
    return new Promise(function(resolve, reject) {
        if(isNodeAboutValid(nodeAbout)) {
            const nodeSettings = getNodeSettings();

            nodeSettings.nodeAbout = nodeAbout;

            setNodeSettings(nodeSettings);
            
            performNodeIdentification()
            .then(() => {
                const nodeIdentification = getNodeIdentification();
                
                const moarTubeTokenProof = nodeIdentification.moarTubeTokenProof;
                
                indexer_doNodePersonalizeNodeAboutUpdate(moarTubeTokenProof, nodeAbout)
                .then(indexerResponseData => {
                    if(indexerResponseData.isError) {
                        logDebugMessageToConsole(indexerResponseData.message, null, new Error().stack);
                        
                        resolve({isError: true, message: indexerResponseData.message});
                    }
                    else {
                        try {
                            cloudflare_purgeNodePage([]);
                        }
                        catch(error) {
                            logDebugMessageToConsole(null, error, new Error().stack);
                        }

                        resolve({ isError: false });
                    }
                })
                .catch(error => {
                    logDebugMessageToConsole(null, error, new Error().stack);

                    resolve({isError: true, message: 'your settings were saved to your node, but they could not be saved to the MoarTube platform'});
                });
            })
            .catch(error => {
                logDebugMessageToConsole(null, error, new Error().stack);

                resolve({isError: true, message: 'your settings were saved to your node, but they could not be saved to the MoarTube platform'});
            });
        }
        else {
            resolve({ isError: true, message: 'invalid parameters' });
        }
    });
}

function personalizeNodeId_POST(nodeId) {
    return new Promise(function(resolve, reject) {
        if(isNodeIdValid(nodeId)) {
            performNodeIdentification()
            .then(() => {
                const nodeIdentification = getNodeIdentification();
                
                const moarTubeTokenProof = nodeIdentification.moarTubeTokenProof;
                
                indexer_doNodePersonalizeNodeIdUpdate(moarTubeTokenProof, nodeId)
                .then(indexerResponseData => {
                    if(indexerResponseData.isError) {
                        logDebugMessageToConsole(indexerResponseData.message, null, new Error().stack);
                        
                        resolve({isError: true, message: indexerResponseData.message});
                    }
                    else {
                        try {
                            cloudflare_purgeNodePage([]);
                        }
                        catch(error) {
                            logDebugMessageToConsole(null, error, new Error().stack);
                        }

                        const nodeSettings = getNodeSettings();

                        nodeSettings.nodeId = nodeId;
                        
                        setNodeSettings(nodeSettings);

                        resolve({ isError: false });
                    }
                })
                .catch(error => {
                    logDebugMessageToConsole(null, error, new Error().stack);

                    resolve({isError: true, message: 'your node ID could not be saved to the MoarTube platform and was not saved to your node'});
                });
            })
            .catch(error => {
                logDebugMessageToConsole(null, error, new Error().stack);

                resolve({isError: true, message: 'your node ID could not be saved to the MoarTube platform and was not saved to your node'});
            });
        }
        else {
            resolve({ isError: true, message: 'invalid parameters' });
        }
    });
}

function secure_POST(isSecure, keyFile, certFile, caFiles) {
    if(isSecure) {
        if(keyFile == null || keyFile.length !== 1) {
            return {isError: true, message: 'private key file is missing'};
        }
        else if(certFile == null || certFile.length !== 1) {
            return {isError: true, message: 'cert file is missing'};
        }
        else {
            logDebugMessageToConsole('switching node to HTTPS mode', null, null);

            const nodeSettings = getNodeSettings();
            
            nodeSettings.isSecure = true;

            setNodeSettings(nodeSettings);

            return {isError: false};
        }
    }
    else {
        logDebugMessageToConsole('switching node to HTTP mode', null, null);

        const nodeSettings = getNodeSettings();
        
        nodeSettings.isSecure = false;

        setNodeSettings(nodeSettings);

        return {isError: false};
    }
}

function cloudflareConfigure_POST(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey) {
    return new Promise(function(resolve, reject) {
        isCloudflareCredentialsValid(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey)
        .then(isValid => {
            if(isValid) {
                cloudflare_setConfiguration(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey)
                .then(() => {
                    resolve({ isError: false });
                })
                .catch(error => {
                    reject(error);
                });
            }
            else {
                resolve({isError: true, message: 'could not validate the Cloudflare credentials'});
            }
        })
        .catch(error => {
            reject(error);
        });
    });
}

function cloudflareClear_POST() {
    try {
        cloudflare_purgeEntireCache();
        cloudflare_resetIntegration();

        return { isError: false };
    }
    catch(error) {
        throw error;
    }
}

function cloudflareTurnstileConfigure_POST(cloudflareTurnstileSiteKey, cloudflareTurnstileSecretKey) {
    const nodeSettings = getNodeSettings();

    nodeSettings.isCloudflareTurnstileEnabled = true;
    nodeSettings.cloudflareTurnstileSiteKey = cloudflareTurnstileSiteKey;
    nodeSettings.cloudflareTurnstileSecretKey = cloudflareTurnstileSecretKey;

    setNodeSettings(nodeSettings);

    websocketChatBroadcast({eventName: 'information', videoId: 'all', cloudflareTurnstileSiteKey: cloudflareTurnstileSiteKey});

    performDatabaseReadJob_ALL('SELECT video_id FROM videos', [])
    .then(async videos => {
        const videoIds = videos.map(video => video.video_id);

        cloudflare_purgeWatchPages(videoIds);
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack);
    });

    return {isError: false};
}

function cloudflareTurnstileConfigureClear_POST() {
    const nodeSettings = getNodeSettings();

    nodeSettings.isCloudflareTurnstileEnabled = false;
    nodeSettings.cloudflareTurnstileSiteKey = '';
    nodeSettings.cloudflareTurnstileSecretKey = '';

    setNodeSettings(nodeSettings);

    websocketChatBroadcast({eventName: 'information', videoId: 'all', cloudflareTurnstileSiteKey: ''});

    performDatabaseReadJob_ALL('SELECT video_id FROM videos', [])
    .then(async videos => {
        const videoIds = videos.map(video => video.video_id);

        cloudflare_purgeWatchPages(videoIds);
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack);
    });

    return {isError: false};
}

function account_POST(username, password) {
    if(isUsernameValid(username) && isPasswordValid(password)) {
        const usernameHash = encodeURIComponent(Buffer.from(bcryptjs.hashSync(username, 10), 'utf8').toString('base64'));
        const passwordHash = encodeURIComponent(Buffer.from(bcryptjs.hashSync(password, 10), 'utf8').toString('base64'));
        
        const nodeSettings = getNodeSettings();
        
        nodeSettings.username = usernameHash;
        nodeSettings.password = passwordHash;

        setNodeSettings(nodeSettings);
        
        return { isError: false };
    }
    else {
        return { isError: true, message: 'invalid username and/or password' };
    }
}

function networkInternal_POST(listeningNodePort) {
    if(getIsDockerEnvironment()) {
        return {isError: true, message: 'This node cannot change listening ports because it is running inside of a docker container.'};
    }
    else {
        if(isPortValid(listeningNodePort)) {
            logDebugMessageToConsole('switching node to HTTPS mode', null, null);

            const nodeSettings = getNodeSettings();
            
            nodeSettings.nodeListeningPort = listeningNodePort;

            setNodeSettings(nodeSettings);

            return {isError: false};
        }
        else {
            return { isError: true, message: 'invalid parameters' };
        }
    }
}

function networkExternal_POST(publicNodeProtocol, publicNodeAddress, publicNodePort) {
    return new Promise(function(resolve, reject) {
        if(isPublicNodeProtocolValid(publicNodeProtocol) && isPublicNodeAddressValid(publicNodeAddress) && isPortValid(publicNodePort)) {
            const nodeSettings = getNodeSettings();

            nodeSettings.publicNodeProtocol = publicNodeProtocol;
            nodeSettings.publicNodeAddress = publicNodeAddress;
            nodeSettings.publicNodePort = publicNodePort;
            
            performNodeIdentification()
            .then(() => {
                const nodeIdentification = getNodeIdentification();
                
                const moarTubeTokenProof = nodeIdentification.moarTubeTokenProof;
                
                indexer_doNodeExternalNetworkUpdate(moarTubeTokenProof, publicNodeProtocol, publicNodeAddress, publicNodePort)
                .then(indexerResponseData => {
                    if(indexerResponseData.isError) {
                        resolve({isError: true, message: indexerResponseData.message});
                    }
                    else {
                        setNodeSettings(nodeSettings);
                        
                        resolve({ isError: false });
                    }
                })
                .catch(error => {
                    logDebugMessageToConsole(null, error, new Error().stack);
                    
                    resolve({isError: true, message: 'your settings were not saved because they could not be sent to the MoarTube platform'});
                });
            })
            .catch(error => {
                logDebugMessageToConsole(null, error, new Error().stack);
                
                resolve({isError: true, message: 'your settings were not saved because they could not be sent to the MoarTube platform'});
            });
        }
        else {
            resolve({ isError: true, message: 'invalid parameters' });
        }
    });
}

module.exports = {
    root_GET,
    avatar_GET,
    avatar_POST,
    banner_GET,
    banner_POST,
    personalizeNodeName_POST,
    personalizeNodeAbout_POST,
    personalizeNodeId_POST,
    secure_POST,
    cloudflareConfigure_POST,
    cloudflareTurnstileConfigure_POST,
    cloudflareTurnstileConfigureClear_POST,
    cloudflareClear_POST,
    account_POST,
    networkInternal_POST,
    networkExternal_POST
};