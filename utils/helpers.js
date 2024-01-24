const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const { logDebugMessageToConsole } = require('./logger');
const { getDataDirectoryPath, getPublicDirectoryPath, getNodeSettingsPath, getVideosDirectoryPath, getLastCheckedContentTrackerPath } = require('./paths');
const { performDatabaseReadJob_GET } = require('./database');
const { indexer_getNodeIdentification, indexer_doNodeIdentificationRefresh } = require('./indexer-communications');

var isDeveloperMode;
var jwtSecret;
var expressSessionName;
var expressSessionSecret;
var isDockerEnvironment;

function getAuthenticationStatus(token) {
    return new Promise(function(resolve, reject) {
        if(token == null || token === '') {
            resolve(false);
        }
        else {
            try {
                const decoded = jwt.verify(token, jwtSecret);
                    
                resolve(true);
            }
            catch(error) {
                resolve(false);
            }
        }
    });
}

function sanitizeTagsSpaces(tags) {
    return tags.replace(/\s+/g, ' ');
}

async function generateVideoId() {
    const characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-';
    const length = 11;

    let videoId = '';
    let hyphenCount = 0;
    let underscoreCount = 0;
    let isUnique = false;

    do {
        videoId = '';
        hyphenCount = 0;
        underscoreCount = 0;

        for (let i = 0; i < length; i++) {
            const randomChar = characters.charAt(Math.floor(Math.random() * characters.length));

            if (randomChar === '-') {
                hyphenCount++;
                if (hyphenCount > 1) {
					continue;
				}
            }

            if (randomChar === '_') {
                underscoreCount++;
                if (underscoreCount > 1) {
					continue;
				}
            }

            videoId += randomChar;
        }

        if (hyphenCount <= 1 && underscoreCount <= 1) {
            await new Promise((resolve, reject) => {
                performDatabaseReadJob_GET('SELECT * FROM videos WHERE video_id = ?', [videoId])
                .then(video => {
                    if (video == null) {
                        resolve(true);
                    } 
                    else {
                        resolve(false);
                    }
                })
                .catch(error => {
                    reject(error);
                });
            }).then(isIdUnique => {
                isUnique = isIdUnique;
            }).catch(error => {
                throw error;
            });
        }
    } while (!isUnique);

    return videoId;
}

function performNodeIdentification() {
	return new Promise(function(resolve, reject) {
		logDebugMessageToConsole('validating node to MoarTube network', null, null, true);
		
		if (getNodeIdentification() == null) {
			setNodeidentification({moarTubeTokenProof: ''});
		}
		
		const nodeIdentification = getNodeIdentification();
	
		const moarTubeTokenProof = nodeIdentification.moarTubeTokenProof;
		
		if(moarTubeTokenProof === '') {
			logDebugMessageToConsole('this node is unidentified, creating node identification', null, null, true);
			
			indexer_getNodeIdentification()
			.then(indexerResponseData => {
				if(indexerResponseData.isError) {
					logDebugMessageToConsole(indexerResponseData.message, null, new Error().stack, true);
					
					reject(indexerResponseData.message);
				}
				else {
					nodeIdentification.moarTubeTokenProof = indexerResponseData.moarTubeTokenProof;

					setNodeidentification(nodeIdentification);

					logDebugMessageToConsole('node identification successful', null, null, true);
					
					resolve();
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);

				reject(error);
			});
		}
		else {
			logDebugMessageToConsole('node identification found, validating node identification', null, null, true);
			
			indexer_doNodeIdentificationRefresh(moarTubeTokenProof)
			.then(indexerResponseData => {
				if(indexerResponseData.isError) {
					reject(indexerResponseData.message);
				}
				else {
					logDebugMessageToConsole('node identification valid', null, null, true);
					
					nodeIdentification.moarTubeTokenProof = indexerResponseData.moarTubeTokenProof;

					setNodeidentification(nodeIdentification);
					
					resolve();
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);

				reject(error);
			});
		}
	});
}

function getNodeIconPngBase64() {
	var pngImageBase64;

	const customDirectoryPath = path.join(path.join(getDataDirectoryPath(), 'images'), 'icon.png');
	const defaultDirectoryPath = path.join(path.join(getPublicDirectoryPath(), 'images'), 'icon.png');

	if(fs.existsSync(customDirectoryPath)) {
		pngImageBase64 = fs.readFileSync(customDirectoryPath).toString('base64');
	}
	else {
		pngImageBase64 = fs.readFileSync(defaultDirectoryPath).toString('base64');
	}

	return pngImageBase64;
}

function getNodeAvatarPngBase64() {
	var pngImageBase64;

	const customDirectoryPath = path.join(path.join(getDataDirectoryPath(), 'images'), 'avatar.png');
	const defaultDirectoryPath = path.join(path.join(getPublicDirectoryPath(), 'images'), 'avatar.png');

	if(fs.existsSync(customDirectoryPath)) {
		pngImageBase64 = fs.readFileSync(customDirectoryPath).toString('base64');
	}
	else {
		pngImageBase64 = fs.readFileSync(defaultDirectoryPath).toString('base64');
	}

	return pngImageBase64;
}

function getNodeBannerPngBase64() {
	var pngImageBase64;

	const customDirectoryPath = path.join(path.join(getDataDirectoryPath(), 'images'), 'banner.png');
	const defaultDirectoryPath = path.join(path.join(getPublicDirectoryPath(), 'images'), 'banner.png');

	if(fs.existsSync(customDirectoryPath)) {
		pngImageBase64 = fs.readFileSync(customDirectoryPath).toString('base64');
	}
	else {
		pngImageBase64 = fs.readFileSync(defaultDirectoryPath).toString('base64');
	}

	return pngImageBase64;
}

function getVideoThumbnailJpgBase64(videoId) {
	var jpgImageBase64;

	const directoryPath = path.join(getVideosDirectoryPath(), videoId + '/images/thumbnail.jpg');

	if(fs.existsSync(directoryPath)) {
		jpgImageBase64 = fs.readFileSync(directoryPath).toString('base64');
	}
	else {
		
	}

	return jpgImageBase64;
}

function getVideoPreviewJpgBase64(videoId) {
	var jpgImageBase64;

	const directoryPath = path.join(getVideosDirectoryPath(), videoId + '/images/preview.jpg');

	if(fs.existsSync(directoryPath)) {
		jpgImageBase64 = fs.readFileSync(directoryPath).toString('base64');
	}
	else {
		
	}

	return jpgImageBase64;
}

function getVideoPosterJpgBase64(videoId) {
	var jpgImageBase64;

	const directoryPath = path.join(getVideosDirectoryPath(), videoId + '/images/poster.jpg');

	if(fs.existsSync(directoryPath)) {
		jpgImageBase64 = fs.readFileSync(directoryPath).toString('base64');
	}
	else {
		
	}

	return jpgImageBase64;
}

function getNodeIdentification() {
	if (fs.existsSync(path.join(getDataDirectoryPath(), '_node_identification.json'))) {
		const nodeIdentification = JSON.parse(fs.readFileSync(path.join(getDataDirectoryPath(), '_node_identification.json'), 'utf8'));
		
		return nodeIdentification;
	}
	else {
		return null;
	}
}

function setNodeidentification(nodeIdentification) {
	fs.writeFileSync(path.join(getDataDirectoryPath(), '_node_identification.json'), JSON.stringify(nodeIdentification));
}

function deleteDirectoryRecursive(directoryPath) {
	fs.rm(directoryPath, { recursive: true, force: true }, function(error) {
		// do nothing, best effort
	});
}

function websocketNodeBroadcast(message) {
    process.send({ cmd: 'websocket_broadcast', message: message });
}

function websocketChatBroadcast(message) {
    process.send({ cmd: 'websocket_broadcast_chat', message: message });
}

/* getters */

function getJwtSecret() {
    return jwtSecret;
}

function getIsDockerEnvironment() {
    return isDockerEnvironment;
}

function getIsDeveloperMode() {
    return isDeveloperMode;
}

function getExpressSessionName() {
    return expressSessionName;
}

function getExpressSessionSecret() {
    return expressSessionSecret;
}

function getNodeSettings() {
	const nodeSettings = JSON.parse(fs.readFileSync(getNodeSettingsPath(), 'utf8'));

	return nodeSettings;
}

function getLastCheckedContentTracker() {
	const lastCheckedContentTracker = JSON.parse(fs.readFileSync(getLastCheckedContentTrackerPath(), 'utf8'));

	return lastCheckedContentTracker;
}

/* setters */

function setJwtSecret(secret) {
    jwtSecret = secret;
}

function setIsDockerEnvironment(value) {
    isDockerEnvironment = value;
}

function setIsDeveloperMode(value) {
    isDeveloperMode = value;
}

function setExpressSessionName(value) {
    expressSessionName = value;
}

function setExpressSessionSecret(value) {
    expressSessionSecret = value;
}

function setNodeSettings(nodeSettings) {
	fs.writeFileSync(getNodeSettingsPath(), JSON.stringify(nodeSettings));
}

function setLastCheckedContentTracker(lastCheckedContentTracker) {
	fs.writeFileSync(getLastCheckedContentTrackerPath(), JSON.stringify(lastCheckedContentTracker));
}

module.exports = {
    logDebugMessageToConsole,
    websocketNodeBroadcast,
    websocketChatBroadcast,
    sanitizeTagsSpaces,
    deleteDirectoryRecursive,
    performNodeIdentification,
    generateVideoId,
    getJwtSecret,
    getAuthenticationStatus,
    getNodeSettings,
	getLastCheckedContentTracker,
    getIsDockerEnvironment,
    getIsDeveloperMode,
    getExpressSessionName,
    getExpressSessionSecret,
    getNodeIdentification,
    getNodeIconPngBase64,
    getNodeAvatarPngBase64,
    getNodeBannerPngBase64,
    getVideoThumbnailJpgBase64,
    getVideoPreviewJpgBase64,
    getVideoPosterJpgBase64,
    setJwtSecret,
    setNodeSettings,
	setLastCheckedContentTracker,
    setIsDockerEnvironment,
    setIsDeveloperMode,
    setExpressSessionName,
    setExpressSessionSecret,
    setNodeidentification
};