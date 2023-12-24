const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const { logDebugMessageToConsole } = require('./logger');
const { getDataDirectoryPath, getPublicDirectoryPath, getNodeSettingsPath } = require('./paths');
const { performDatabaseReadJob_GET } = require('./database');
const { indexer_getNodeIdentification, indexer_doNodeIdentificationRefresh } = require('./indexer-communications');

var isDeveloperMode;
var jwtSecret;
var expressSessionName;
var expressSessionSecret;
var isDockerEnvironment;

function generateCaptcha() {
    return new Promise(function(resolve, reject) {
        const svgCaptcha = require('svg-captcha');
        
        const { createCanvas, loadImage, Image  } = require('canvas');
        
        const captcha = svgCaptcha.create({
            size: 6,
            ignoreChars: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
            noise: Math.floor(Math.random() * (6 - 3)) + 3,
            width: 150,
            height: 50,
            fontSize: 40
        });

        // Create a canvas for the base image
        const canvas = createCanvas(150, 50);
        const ctx = canvas.getContext('2d');

        // Draw random noise on the base layer
        for (let x = 0; x < canvas.width; x++) {
          for (let y = 0; y < canvas.height; y++) {
            const r = Math.floor(Math.random() * 255);
            const g = Math.floor(Math.random() * 255);
            const b = Math.floor(Math.random() * 255);
            const a = (Math.floor(Math.random() * (101 - 0)) + 0) / 100;
            
            ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
            ctx.fillRect(x, y, 1, 1);
          }
        }
        
        const img = new Image();
        
        img.onload = () => {
          const finalCanvas = createCanvas(150, 50);
          const finalCtx = finalCanvas.getContext('2d');

          // Draw the base image
          finalCtx.drawImage(canvas, 0, 0);

          // Draw the captcha image on top
          finalCtx.drawImage(img, 0, 0);

          // Convert the final canvas to PNG
          const pngBuffer = finalCanvas.toBuffer('image/png');
          
          resolve({text: captcha.text, data: pngBuffer});
        }
        
        img.onerror = err => { 
            reject();
        }
        
        img.src = `data:image/svg+xml;base64,${Buffer.from(captcha.data).toString('base64')}`;
    });
}

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

function performNodeIdentification(isConfiguring) {
	return new Promise(function(resolve, reject) {
		const nodeSettings = getNodeSettings();

		if(nodeSettings.isNodePrivate) {
			throw new Error('node identification unavailable; this node is currently running privately');
		}
		else if(!nodeSettings.isNodeConfigured && !isConfiguring) {
			throw new Error('node identification unavailable; this node has not performed initial configuration');
		}

		logDebugMessageToConsole('validating node to MoarTube network', null, null, true);
		
		if (getNodeIdentification() == null) {
			setNodeidentification({nodeIdentifier: '', nodeIdentifierProof: ''});
		}
		
		const nodeIdentification = getNodeIdentification();
	
		const nodeIdentifier = nodeIdentification.nodeIdentifier;
		const nodeIdentifierProof = nodeIdentification.nodeIdentifierProof;
		
		if(nodeIdentifier === '' && nodeIdentifierProof === '') {
			logDebugMessageToConsole('this node is unidentified, creating node identification', null, null, true);
			
			indexer_getNodeIdentification()
			.then(indexerResponseData => {
				if(indexerResponseData.isError) {
					logDebugMessageToConsole(indexerResponseData.message, null, new Error().stack, true);
					
					reject(indexerResponseData.message);
				}
				else {
					nodeIdentification.nodeIdentifier = indexerResponseData.nodeIdentifier;
					nodeIdentification.nodeIdentifierProof = indexerResponseData.nodeIdentifierProof;

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
			
			indexer_doNodeIdentificationRefresh(nodeIdentifier, nodeIdentifierProof)
			.then(indexerResponseData => {
				if(indexerResponseData.isError) {
					reject(indexerResponseData.message);
				}
				else {
					logDebugMessageToConsole('node identification valid', null, null, true);
					
					nodeIdentification.nodeIdentifierProof = indexerResponseData.nodeIdentifierProof;

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

function getNodeIconBase64() {
	var nodeIconBase64;

	const customIconDirectoryPath = path.join(path.join(getDataDirectoryPath(), 'images'), 'icon.png');
	const defaultIconDirectoryPath = path.join(path.join(getPublicDirectoryPath(), 'images'), 'icon.png');

	if(fs.existsSync(customIconDirectoryPath)) {
		nodeIconBase64 = fs.readFileSync(customIconDirectoryPath).toString('base64');
	}
	else {
		nodeIconBase64 = fs.readFileSync(defaultIconDirectoryPath).toString('base64');
	}

	return nodeIconBase64;
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
    if(fs.existsSync(directoryPath)) {
        fs.readdirSync(directoryPath).forEach((file) => {
            const curPath = path.join(directoryPath, file);
    
            if (fs.statSync(curPath).isDirectory()) {
                deleteDirectoryRecursive(curPath);
            }
            else {
                fs.unlinkSync(curPath);
            }
        });

        if (fs.readdirSync(directoryPath).length === 0) {
            fs.rmdirSync(directoryPath);
        }
    }
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

module.exports = {
    logDebugMessageToConsole,
    websocketNodeBroadcast,
    websocketChatBroadcast,
    sanitizeTagsSpaces,
    deleteDirectoryRecursive,
    performNodeIdentification,
    generateCaptcha,
    generateVideoId,
    getJwtSecret,
    getAuthenticationStatus,
    getNodeSettings,
    getIsDockerEnvironment,
    getIsDeveloperMode,
    getExpressSessionName,
    getExpressSessionSecret,
    getNodeIdentification,
    getNodeIconBase64,
    setJwtSecret,
    setNodeSettings,
    setIsDockerEnvironment,
    setIsDeveloperMode,
    setExpressSessionName,
    setExpressSessionSecret,
    setNodeidentification
};