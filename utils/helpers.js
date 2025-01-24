const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const {
	logDebugMessageToConsole
} = require('./logger');
const {
	getDataDirectoryPath, getPublicDirectoryPath, getNodeSettingsPath, getVideosDirectoryPath, getLastCheckedContentTrackerPath
} = require('./paths');
const {
	performDatabaseReadJob_GET
} = require('./database');
const {
	indexer_getNodeIdentification, indexer_doNodeIdentificationRefresh
} = require('./indexer-communications');
const {
	isIpv4Address
} = require('../utils/validators');

let isDeveloperMode;
let jwtSecret;
let expressSessionName;
let expressSessionSecret;
let isDockerEnvironment;

async function getAuthenticationStatus(token) {
	let isAuthenticated = true;

	if (token == null || token === '') {
		isAuthenticated = false;
	}
	else {
		try {
			const decoded = jwt.verify(token, jwtSecret);
		}
		catch (error) {
			isAuthenticated = false;
		}
	}

	return isAuthenticated;
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
	let isVideoIdUnique = false;

	do {
		videoId = '';
		hyphenCount = 0;
		underscoreCount = 0;

		for (let i = 0; i < length;) {
			const randomChar = characters.charAt(Math.floor(Math.random() * characters.length));

			if (randomChar === '-') {
				hyphenCount++;
				if (hyphenCount > 1) {
					continue;
				}
			}
			else if (randomChar === '_') {
				underscoreCount++;
				if (underscoreCount > 1) {
					continue;
				}
			}
			else {
				videoId += randomChar;
				i++;
			}
		}

		if (hyphenCount <= 1 && underscoreCount <= 1) {
			const video = await performDatabaseReadJob_GET('SELECT * FROM videos WHERE video_id = ?', [videoId]);

			if (video == null) {
				isVideoIdUnique = true;
			}
		}
	} while (!isVideoIdUnique);

	return videoId;
}

async function performNodeIdentification() {
	logDebugMessageToConsole('validating node to MoarTube network', null, null);

	if (getNodeIdentification() == null) {
		setNodeidentification({ moarTubeTokenProof: '' });
	}

	const nodeIdentification = getNodeIdentification();

	const moarTubeTokenProof = nodeIdentification.moarTubeTokenProof;

	if (moarTubeTokenProof === '') {
		logDebugMessageToConsole('this node is unidentified, creating node identification', null, null);

		nodeIdentification.moarTubeTokenProof = (await indexer_getNodeIdentification()).moarTubeTokenProof;
	}
	else {
		logDebugMessageToConsole('node identification found, validating node identification', null, null);

		nodeIdentification.moarTubeTokenProof = (await indexer_doNodeIdentificationRefresh(moarTubeTokenProof)).moarTubeTokenProof;
	}

	setNodeidentification(nodeIdentification);

	logDebugMessageToConsole('node identification successful', null, null);
}

function getNodeIconPngBase64() {
	let pngImageBase64;

	const customDirectoryPath = path.join(path.join(getDataDirectoryPath(), 'images'), 'icon.png');
	const defaultDirectoryPath = path.join(path.join(getPublicDirectoryPath(), 'images'), 'icon.png');

	if (fs.existsSync(customDirectoryPath)) {
		pngImageBase64 = fs.readFileSync(customDirectoryPath).toString('base64');
	}
	else {
		pngImageBase64 = fs.readFileSync(defaultDirectoryPath).toString('base64');
	}

	return pngImageBase64;
}

function getNodeAvatarPngBase64() {
	let pngImageBase64;

	const customDirectoryPath = path.join(path.join(getDataDirectoryPath(), 'images'), 'avatar.png');
	const defaultDirectoryPath = path.join(path.join(getPublicDirectoryPath(), 'images'), 'avatar.png');

	if (fs.existsSync(customDirectoryPath)) {
		pngImageBase64 = fs.readFileSync(customDirectoryPath).toString('base64');
	}
	else {
		pngImageBase64 = fs.readFileSync(defaultDirectoryPath).toString('base64');
	}

	return pngImageBase64;
}

function getNodeBannerPngBase64() {
	let pngImageBase64;

	const customDirectoryPath = path.join(path.join(getDataDirectoryPath(), 'images'), 'banner.png');
	const defaultDirectoryPath = path.join(path.join(getPublicDirectoryPath(), 'images'), 'banner.png');

	if (fs.existsSync(customDirectoryPath)) {
		pngImageBase64 = fs.readFileSync(customDirectoryPath).toString('base64');
	}
	else {
		pngImageBase64 = fs.readFileSync(defaultDirectoryPath).toString('base64');
	}

	return pngImageBase64;
}

function getVideoThumbnailJpgBase64(videoId) {
	let jpgImageBase64;

	const directoryPath = path.join(getVideosDirectoryPath(), videoId + '/images/thumbnail.jpg');

	if (fs.existsSync(directoryPath)) {
		jpgImageBase64 = fs.readFileSync(directoryPath).toString('base64');
	}
	else {

	}

	return jpgImageBase64;
}

function getVideoPreviewJpgBase64(videoId) {
	let jpgImageBase64;

	const directoryPath = path.join(getVideosDirectoryPath(), videoId + '/images/preview.jpg');

	if (fs.existsSync(directoryPath)) {
		jpgImageBase64 = fs.readFileSync(directoryPath).toString('base64');
	}
	else {

	}

	return jpgImageBase64;
}

function getVideoPosterJpgBase64(videoId) {
	let jpgImageBase64;

	const directoryPath = path.join(getVideosDirectoryPath(), videoId + '/images/poster.jpg');

	if (fs.existsSync(directoryPath)) {
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

function getNodebaseUrl() {
	const nodeSettings = getNodeSettings();

	const publicNodeProtocol = nodeSettings.publicNodeProtocol;
	const publicNodeAddress = nodeSettings.publicNodeAddress;
	let publicNodePort = nodeSettings.publicNodePort;

	if (publicNodeProtocol === 'http') {
		publicNodePort = publicNodePort == 80 ? '' : ':' + publicNodePort;
	}
	else if (publicNodeProtocol === 'https') {
		publicNodePort = publicNodePort == 443 ? '' : ':' + publicNodePort;
	}

	const nodeBaseUrl = publicNodeProtocol + '://' + publicNodeAddress + publicNodePort;

	return nodeBaseUrl;
}

function getExternalVideosBaseUrl() {
	const nodeSettings = getNodeSettings();

	const storageConfig = nodeSettings.storageConfig;

	let externalVideosBaseUrl;

	if (storageConfig.storageMode === 'filesystem') {
		const publicNodeProtocol = nodeSettings.publicNodeProtocol;
		const publicNodeAddress = nodeSettings.publicNodeAddress;
		let publicNodePort = nodeSettings.publicNodePort;

		if (publicNodeProtocol === 'http') {
			publicNodePort = publicNodePort == 80 ? '' : ':' + publicNodePort;
		}
		else if (publicNodeProtocol === 'https') {
			publicNodePort = publicNodePort == 443 ? '' : ':' + publicNodePort;
		}

		if (isIpv4Address(publicNodeAddress)) {
			externalVideosBaseUrl = `${publicNodeProtocol}://${publicNodeAddress}${publicNodePort}`;
		}
		else {
			if (getIsDeveloperMode()) {
				externalVideosBaseUrl = `${publicNodeProtocol}://testingexternalvideos.${publicNodeAddress}${publicNodePort}`;
			}
			else {
				externalVideosBaseUrl = `${publicNodeProtocol}://externalvideos.${publicNodeAddress}${publicNodePort}`;
			}
		}
	}
	else if (storageConfig.storageMode === 's3provider') {
		const bucketName = storageConfig.s3Config.bucketName;
		const endpoint = storageConfig.s3Config.s3ProviderClientConfig.endpoint;

		// if the endpoint is present, we assume the S3 provider is not AWS and default to using the provided URL endpoint
		if (endpoint != null) {
			if (storageConfig.s3Config.isCnameConfigured) {
				const protocol = endpoint.split(':')[0];

				externalVideosBaseUrl = `${protocol}://${bucketName}`;
			}
			else {
				externalVideosBaseUrl = `${endpoint}/${bucketName}`;
			}
		}
		else {
			// if the endpoint is not present, we assume the S3 provider is AWS and construct the URL endpoint
			if (storageConfig.s3Config.isCnameConfigured) {
				externalVideosBaseUrl = `https://${bucketName}`;
			}
			else {
				const region = storageConfig.s3Config.s3ProviderClientConfig.region;

				externalVideosBaseUrl = `http://${bucketName}.s3.${region}.amazonaws.com`;
			}
		}
	}

	return externalVideosBaseUrl;
}

function getExternalResourcesBaseUrl() {
	const nodeSettings = getNodeSettings();

	let externalResourcesBaseUrl;

	const publicNodeProtocol = nodeSettings.publicNodeProtocol;
	const publicNodeAddress = nodeSettings.publicNodeAddress;
	let publicNodePort = nodeSettings.publicNodePort;

	if (publicNodeProtocol === 'http') {
		publicNodePort = publicNodePort == 80 ? '' : ':' + publicNodePort;
	}
	else if (publicNodeProtocol === 'https') {
		publicNodePort = publicNodePort == 443 ? '' : ':' + publicNodePort;
	}

	if (isIpv4Address(publicNodeAddress)) {
		externalResourcesBaseUrl = `${publicNodeProtocol}://${publicNodeAddress}${publicNodePort}`;
	}
	else {
		if (getIsDeveloperMode()) {
			externalResourcesBaseUrl = `${publicNodeProtocol}://testingexternalresources.${publicNodeAddress}${publicNodePort}`;
		}
		else {
			externalResourcesBaseUrl = `${publicNodeProtocol}://externalresources.${publicNodeAddress}${publicNodePort}`;
		}
	}

	return externalResourcesBaseUrl;
}

function setNodeidentification(nodeIdentification) {
	fs.writeFileSync(path.join(getDataDirectoryPath(), '_node_identification.json'), JSON.stringify(nodeIdentification));
}

async function deleteDirectoryRecursive(directoryPath) {
	try {
		fs.rmSync(directoryPath, { recursive: true, force: true });
	}
	catch (error) {
		logDebugMessageToConsole('failed to delete directory path: ' + directoryPath, error, null);
	}
}

async function deleteFile(filePath) {
	try {
		fs.rmSync(filePath, { force: true });
	}
	catch (error) {
		logDebugMessageToConsole('failed to delete file path: ' + filePath, error, null);
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

function getHostsFilePath() {
	const platform = require('os').platform();

	switch (platform) {
		case 'win32':
			return path.join(process.env.SystemRoot, 'System32', 'drivers', 'etc', 'hosts');
		case 'darwin':
		case 'linux':
			return '/etc/hosts';
		default:
			throw new Error(`Unsupported platform: ${platform}`);
	}
}

module.exports = {
	logDebugMessageToConsole,
	websocketNodeBroadcast,
	websocketChatBroadcast,
	sanitizeTagsSpaces,
	deleteDirectoryRecursive,
	deleteFile,
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
	setNodeidentification,
	getExternalVideosBaseUrl,
	getExternalResourcesBaseUrl,
	getHostsFilePath,
	getNodebaseUrl
};