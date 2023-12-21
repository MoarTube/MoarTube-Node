const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

var isDeveloperMode;
var moartubeNodeHttpPort;
var moartubeIndexerIp;
var moartubeIndexerPort;
var moartubeIndexerHttpProtocol;
var moartubeAliaserIp;
var moartubeAliaserPort;
var moartubeAliaserHttpProtocol;
var expressSessionName;
var expressSessionSecret;
var isDockerEnvironment;
var dataDirectoryPath;
var nodeSettingsPath;
var imagesDirectoryPath;
var publicDirectoryPath;
var pagesDirectoryPath;
var videosDirectoryPath;
var databaseDirectoryPath;
var databaseFilePath;
var certificatesDirectoryPath;

function logDebugMessageToConsole(message, error, stackTrace, isLoggingToFile) {
    const date = new Date(Date.now());
    const year = date.getFullYear();
    const month = ('0' + (date.getMonth() + 1)).slice(-2);
    const day = ('0' + date.getDate()).slice(-2);
    const hours = ('0' + date.getHours()).slice(-2);
    const minutes = ('0' + date.getMinutes()).slice(-2);
    const seconds = ('0' + date.getSeconds()).slice(-2);
    const humanReadableTimestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

    if(message == null) {
        message = 'none';
    }
    
    var errorMessage = '<message: ' + message + ', date: ' + humanReadableTimestamp + '>';

    if(error != null) {
        if(error.message != null) {
            errorMessage += '\n' + error.message + '\n';
        }

        if(error.stack != null) {
            errorMessage += '\n' + error.stack + '\n';
        }
        else if(error.stackTrace != null) {
            errorMessage += '\n' + error.stackTrace + '\n';
        }
    }

    if(stackTrace != null) {
        errorMessage += '\n' + stackTrace + '\n';
    }
    
    console.log(errorMessage);
    
    errorMessage += '\n';

    /*
    if(isLoggingToFile) {
        const logFilePath = path.join(__dirname, '/_node_log.txt');
        fs.appendFileSync(logFilePath, errorMessage);
    }
    */
}

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
                const decoded = jwt.verify(token, JWT_SECRET);
                    
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

async function generateVideoId(database) {
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
                database.get('SELECT * FROM videos WHERE video_id = ?', [videoId], function (error, video) {
                    if (error) {
                        reject(error);
                    } else if (video) {
                        resolve(false);
                    } else {
                        resolve(true);
                    }
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

	const customIconDirectoryPath = path.join(path.join(DATA_DIRECTORY_PATH, 'images'), 'icon.png');
	const defaultIconDirectoryPath = path.join(path.join(PUBLIC_DIRECTORY_PATH, 'images'), 'icon.png');

	if(fs.existsSync(customIconDirectoryPath)) {
		nodeIconBase64 = fs.readFileSync(customIconDirectoryPath).toString('base64');
	}
	else {
		nodeIconBase64 = fs.readFileSync(defaultIconDirectoryPath).toString('base64');
	}

	return nodeIconBase64;
}

function getNodeIdentification() {
	if (fs.existsSync(path.join(DATA_DIRECTORY_PATH, '_node_identification.json'))) {
		const nodeIdentification = JSON.parse(fs.readFileSync(path.join(DATA_DIRECTORY_PATH, '_node_identification.json'), 'utf8'));
		
		return nodeIdentification;
	}
	else {
		return null;
	}
}

function setNodeidentification(nodeIdentification) {
	fs.writeFileSync(path.join(DATA_DIRECTORY_PATH, '_node_identification.json'), JSON.stringify(nodeIdentification));
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

function loadConfig() {
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

	setPublicDirectoryPath(path.join(__dirname, 'public'));
	setPagesDirectoryPath(path.join(getPublicDirectoryPath(), 'pages'));

	setIsDockerEnvironment(process.env.IS_DOCKER_ENVIRONMENT === 'true');

	if(getIsDockerEnvironment()) {
		setDataDirectoryPath('/data');
	}
	else {
		setDataDirectoryPath(path.join(__dirname, 'data'));
	}

	setNodeSettingsPath(path.join(getDataDirectoryPath(), '_node_settings.json'));

	setImagesDirectoryPath(path.join(getDataDirectoryPath(), 'images'));
	setVideosDirectoryPath(path.join(getDataDirectoryPath(), 'media/videos'));
	setDatabaseDirectoryPath(path.join(getDataDirectoryPath(), 'db'));
    setDatabaseFilePath(path.join(getDatabaseDirectoryPath(), 'node_db.sqlite'));
	setCertificatesDirectoryPath(path.join(getDataDirectoryPath(), 'certificates'));

	fs.mkdirSync(getImagesDirectoryPath(), { recursive: true });
	fs.mkdirSync(getVideosDirectoryPath(), { recursive: true });
	fs.mkdirSync(getDatabaseDirectoryPath(), { recursive: true });
	fs.mkdirSync(getCertificatesDirectoryPath(), { recursive: true });
	
	const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

	setIsDeveloperMode(config.isDeveloperMode);

	setMoarTubeIndexerHttpProtocol(config.indexerConfig.httpProtocol);
	setMoarTubeIndexerIp(config.indexerConfig.host);
	setMoarTubeIndexerPort(config.indexerConfig.port);

	setMoarTubeAliaserHttpProtocol(config.aliaserConfig.httpProtocol);
	setMoarTubeAliaserIp(config.aliaserConfig.host);
	setMoarTubeAliaserPort(config.aliaserConfig.port);
	
	if(!fs.existsSync(getNodeSettingsPath())) {
		const nodeSettings = {
			"nodeListeningPort": 80,
			"isNodeConfigured":false,
			"isNodePrivate":false,
			"isSecure":false,
			"publicNodeProtocol":"http",
			"publicNodeAddress":"",
			"publicNodePort":"",
			"nodeName":"moartube node",
			"nodeAbout":"just a MoarTube node",
			"nodeId":"",
			"username":"JDJhJDEwJHVrZUJsbmlvVzNjWEhGUGU0NjJrS09lSVVHc1VxeTJXVlJQbTNoL3hEM2VWTFRad0FiZVZL",
			"password":"JDJhJDEwJHVkYUxudzNkLjRiYkExcVMwMnRNL09la3Q5Z3ZMQVpEa1JWMEVxd3RjU09wVXNTYXpTbXRX",
			"expressSessionName": crypto.randomBytes(64).toString('hex'),
			"expressSessionSecret": crypto.randomBytes(64).toString('hex')
		};

		setNodeSettings(nodeSettings);
	}
	
	const nodeSettings = getNodeSettings();

	setMoarTubeNodeHttpPort(nodeSettings.nodeListeningPort);

	setExpressSessionname(nodeSettings.expressSessionName);
	setExpressSessionSecret(nodeSettings.expressSessionSecret);
}

function websocketNodeBroadcast(message) {
    process.send({ cmd: 'websocket_broadcast', message: message });
}

function websocketChatBroadcast(message) {
    process.send({ cmd: 'websocket_broadcast_chat', message: message });
}

/* getters */

function getPublicDirectoryPath() {
    return publicDirectoryPath;
}

function getPagesDirectoryPath() {
    return pagesDirectoryPath;
}

function getIsDockerEnvironment() {
    return isDockerEnvironment;
}

function getDataDirectoryPath() {
    return dataDirectoryPath;
}

function getNodeSettingsPath() {
    return nodeSettingsPath;
}

function getImagesDirectoryPath() {
    return imagesDirectoryPath;
}

function getVideosDirectoryPath() {
    return videosDirectoryPath;
}

function getDatabaseDirectoryPath() {
    return databaseDirectoryPath;
}

function getDatabaseFilePath() {
    return databaseFilePath;
}

function getCertificatesDirectoryPath() {
    return certificatesDirectoryPath;
}

function getIsDeveloperMode() {
    return isDeveloperMode;
}

function getMoarTubeIndexerHttpProtocol() {
    return moartubeIndexerHttpProtocol;
}

function getMoarTubeIndexerIp() {
    return moartubeIndexerIp;
}

function getMoarTubeIndexerPort() {
    return moartubeIndexerPort;
}

function getMoarTubeAliaserHttpProtocol() {
    return moartubeAliaserHttpProtocol;
}

function getMoarTubeAliaserIp() {
    return moartubeAliaserIp;
}

function getMoarTubeAliaserPort() {
    return moartubeAliaserPort;
}

function getMoarTubeNodeHttpPort() {
    return moartubeNodeHttpPort;
}

function getExpressSessionname() {
    return expressSessionName;
}

function getExpressSessionSecret() {
    return expressSessionSecret;
}

function getMoarTubeIndexerUrl() {
    return (getMoarTubeIndexerHttpProtocol() + '://' + getMoarTubeIndexerIp() + ':' + getMoarTubeIndexerPort());
}

function getMoarTubeAliaserUrl() {
    return (getMoarTubeAliaserHttpProtocol() + '://' + getMoarTubeAliaserIp() + ':' + getMoarTubeAliaserPort());
}

function getNodeSettings() {
	const nodeSettings = JSON.parse(fs.readFileSync(NODE_SETTINGS_PATH, 'utf8'));

	return nodeSettings;
}

/* setters */

function setPublicDirectoryPath(path) {
    publicDirectoryPath = path;
}

function setPagesDirectoryPath(path) {
    pagesDirectoryPath = path;
}

function setIsDockerEnvironment(value) {
    isDockerEnvironment = value;
}

function setDataDirectoryPath(path) {
    dataDirectoryPath = path;
}

function setNodeSettingsPath(path) {
    nodeSettingsPath = path;
}

function setImagesDirectoryPath(path) {
    imagesDirectoryPath = path;
}

function setVideosDirectoryPath(path) {
    videosDirectoryPath = path;
}

function setDatabaseDirectoryPath(path) {
    databaseDirectoryPath = path;
}

function setDatabaseFilePath(path) {
    databaseFilePath = path;
}

function setCertificatesDirectoryPath(path) {
    certificatesDirectoryPath = path;
}

function setIsDeveloperMode(value) {
    isDeveloperMode = value;
}

function setMoarTubeIndexerHttpProtocol(value) {
    moartubeIndexerHttpProtocol = value;
}

function setMoarTubeIndexerIp(value) {
    moartubeIndexerIp = value;
}

function setMoarTubeIndexerPort(value) {
    moartubeIndexerPort = value;
}

function setMoarTubeAliaserHttpProtocol(value) {
    moartubeAliaserHttpProtocol = value;
}

function setMoarTubeAliaserIp(value) {
    moartubeAliaserIp = value;
}

function setMoarTubeAliaserPort(value) {
    moartubeAliaserPort = value;
}

function setMoarTubeNodeHttpPort(value) {
    moartubeNodeHttpPort = value;
}

function setExpressSessionname(value) {
    expressSessionName = value;
}

function setExpressSessionSecret(value) {
    expressSessionSecret = value;
}

function setNodeSettings(nodeSettings) {
	fs.writeFileSync(NODE_SETTINGS_PATH, JSON.stringify(nodeSettings));
}

module.exports = {
    logDebugMessageToConsole,
    websocketNodeBroadcast,
    websocketChatBroadcast,
    sanitizeTagsSpaces,
    performNodeIdentification,
    generateCaptcha,
    loadConfig,
    generateVideoId,
    getAuthenticationStatus,
    getNodeSettings,
    getPagesDirectoryPath,
    getPublicDirectoryPath,
    getIsDockerEnvironment,
    getDataDirectoryPath,
    getNodeSettingsPath,
    getImagesDirectoryPath,
    getVideosDirectoryPath,
    getDatabaseDirectoryPath,
    getDatabaseFilePath,
    getCertificatesDirectoryPath,
    getIsDeveloperMode,
    getMoarTubeIndexerHttpProtocol,
    getMoarTubeIndexerIp,
    getMoarTubeIndexerPort,
    getMoarTubeAliaserHttpProtocol,
    getMoarTubeAliaserIp,
    getMoarTubeAliaserPort,
    getMoarTubeNodeHttpPort,
    getExpressSessionname,
    getExpressSessionSecret,
    getMoarTubeIndexerUrl,
    getNodeIdentification,
    getNodeIconBase64,
    setNodeSettings,
    setPublicDirectoryPath,
    setPagesDirectoryPath,
    setIsDockerEnvironment,
    setDataDirectoryPath,
    setNodeSettingsPath,
    setImagesDirectoryPath,
    setVideosDirectoryPath,
    setDatabaseDirectoryPath,
    setDatabaseFilePath,
    setCertificatesDirectoryPath,
    setIsDeveloperMode,
    setMoarTubeIndexerHttpProtocol,
    setMoarTubeIndexerIp,
    setMoarTubeIndexerPort,
    setMoarTubeAliaserHttpProtocol,
    setMoarTubeAliaserIp,
    setMoarTubeAliaserPort,
    setMoarTubeNodeHttpPort,
    setExpressSessionname,
    setExpressSessionSecret,
    setNodeidentification
};