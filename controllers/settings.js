const fs = require('fs');
const path = require('path');
const bcryptjs = require('bcryptjs');
const packageJson = require('../package.json');

const {
    logDebugMessageToConsole
} = require('../utils/logger');
const {
    getImagesDirectoryPath, getDataDirectoryPath, getPublicDirectoryPath, getDatabaseFilePath, getVideosDirectoryPath
} = require('../utils/paths');
const {
    getNodeSettings, setNodeSettings, getNodeIdentification, performNodeIdentification, getIsDockerEnvironment, websocketChatBroadcast, getExternalVideosBaseUrl
} = require('../utils/helpers');
const {
    isNodeNameValid, isNodeAboutValid, isNodeIdValid, isUsernameValid, isPasswordValid, isPublicNodeProtocolValid, isPublicNodeAddressValid,
    isPortValid, isCloudflareCredentialsValid, isBooleanValid, isDatabaseConfigValid, isStorageConfigValid
} = require('../utils/validators');
const {
    indexer_doNodePersonalizeNodeNameUpdate, indexer_doNodePersonalizeNodeAboutUpdate, indexer_doNodePersonalizeNodeIdUpdate,
    indexer_doNodeExternalNetworkUpdate
} = require('../utils/indexer-communications');
const {
    cloudflare_setCdnConfiguration, cloudflare_resetCdn, cloudflare_purgeNodeImages, cloudflare_purgeNodePage,
    cloudflare_purgeAllWatchPages, cloudflare_addCdnDnsRecord, cloudflare_purgeEntireCache
} = require('../utils/cloudflare-communications');
const {
    submitDatabaseWriteJob, performDatabaseReadJob_ALL, clearDatabase
} = require('../utils/database');

function root_GET() {
    const nodeSettings = getNodeSettings();

    nodeSettings.version = packageJson.version;

    return { isError: false, nodeSettings: nodeSettings };
}

function avatar_GET() {
    const customAvatarDirectoryPath = path.join(path.join(getDataDirectoryPath(), 'images'), 'avatar.png');
    const defaultAvatarDirectoryPath = path.join(path.join(getPublicDirectoryPath(), 'images'), 'avatar.png');

    let avatarFilePath;

    if (fs.existsSync(customAvatarDirectoryPath)) {
        avatarFilePath = customAvatarDirectoryPath;
    }
    else if (fs.existsSync(defaultAvatarDirectoryPath)) {
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

async function avatar_POST(iconFile, avatarFile) {
    const iconSourceFilePath = path.join(getImagesDirectoryPath(), iconFile.filename);
    const avatarSourceFilePath = path.join(getImagesDirectoryPath(), avatarFile.filename);

    const iconDestinationFilePath = path.join(getImagesDirectoryPath(), 'icon.png');
    const avatarDestinationFilePath = path.join(getImagesDirectoryPath(), 'avatar.png');

    fs.renameSync(iconSourceFilePath, iconDestinationFilePath);
    fs.renameSync(avatarSourceFilePath, avatarDestinationFilePath);

    cloudflare_purgeNodeImages();

    await submitDatabaseWriteJob('UPDATE videos SET is_index_outdated = CASE WHEN is_indexed = ? THEN ? ELSE is_index_outdated END', [true, true]);

    return { isError: false };
}

function banner_GET(req, res) {
    const customBannerDirectoryPath = path.join(path.join(getDataDirectoryPath(), 'images'), 'banner.png');
    const defaultBannerDirectoryPath = path.join(path.join(getPublicDirectoryPath(), 'images'), 'banner.png');

    let bannerFilePath;

    if (fs.existsSync(customBannerDirectoryPath)) {
        bannerFilePath = customBannerDirectoryPath;
    }
    else if (fs.existsSync(defaultBannerDirectoryPath)) {
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

    cloudflare_purgeNodeImages();

    return { isError: false };
}

async function personalizeNodeName_POST(nodeName) {
    if (isNodeNameValid(nodeName)) {
        const nodeSettings = getNodeSettings();

        nodeSettings.nodeName = nodeName;

        setNodeSettings(nodeSettings);

        const indexedVideos = await performDatabaseReadJob_ALL('SELECT * FROM videos WHERE is_indexed = ?', [true]);

        if (indexedVideos.length > 0) {
            await performNodeIdentification();

            const nodeIdentification = getNodeIdentification();

            const moarTubeTokenProof = nodeIdentification.moarTubeTokenProof;

            const indexerResponseData = await indexer_doNodePersonalizeNodeNameUpdate(moarTubeTokenProof, nodeName);

            if (indexerResponseData.isError) {
                throw new Error(indexerResponseData.message);
            }
            else {
                cloudflare_purgeNodePage();
            }
        }

        return { isError: false };
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function personalizeNodeAbout_POST(nodeAbout) {
    if (isNodeAboutValid(nodeAbout)) {
        const nodeSettings = getNodeSettings();

        nodeSettings.nodeAbout = nodeAbout;

        setNodeSettings(nodeSettings);

        const indexedVideos = await performDatabaseReadJob_ALL('SELECT * FROM videos WHERE is_indexed = ?', [true]);

        if (indexedVideos.length > 0) {
            await performNodeIdentification();

            const nodeIdentification = getNodeIdentification();

            const moarTubeTokenProof = nodeIdentification.moarTubeTokenProof;

            const indexerResponseData = await indexer_doNodePersonalizeNodeAboutUpdate(moarTubeTokenProof, nodeAbout);

            if (indexerResponseData.isError) {
                throw new Error(indexerResponseData.message);
            }
            else {
                cloudflare_purgeNodePage();
            }
        }

        return { isError: false };
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function personalizeNodeId_POST(nodeId) {
    if (isNodeIdValid(nodeId)) {
        const indexedVideos = await performDatabaseReadJob_ALL('SELECT * FROM videos WHERE is_indexed = ?', [true]);

        if (indexedVideos.length > 0) {
            await performNodeIdentification();

            const nodeIdentification = getNodeIdentification();

            const moarTubeTokenProof = nodeIdentification.moarTubeTokenProof;

            const indexerResponseData = await indexer_doNodePersonalizeNodeIdUpdate(moarTubeTokenProof, nodeId);

            if (indexerResponseData.isError) {
                throw new Error(indexerResponseData.message);
            }
            else {
                cloudflare_purgeNodePage();
            }
        }

        const nodeSettings = getNodeSettings();

        nodeSettings.nodeId = nodeId;

        setNodeSettings(nodeSettings);

        return { isError: false };
    }
    else {
        throw new Error('invalid parameters');
    }
}

function secure_POST(isSecure, keyFile, certFile, caFiles) {
    if (isSecure) {
        if (keyFile == null || keyFile.length !== 1) {
            return { isError: true, message: 'private key file is missing' };
        }
        else if (certFile == null || certFile.length !== 1) {
            return { isError: true, message: 'cert file is missing' };
        }
        else {
            logDebugMessageToConsole('switching node to HTTPS mode', null, null);

            const nodeSettings = getNodeSettings();

            nodeSettings.isSecure = true;

            setNodeSettings(nodeSettings);

            return { isError: false };
        }
    }
    else {
        logDebugMessageToConsole('switching node to HTTP mode', null, null);

        const nodeSettings = getNodeSettings();

        nodeSettings.isSecure = false;

        setNodeSettings(nodeSettings);

        return { isError: false };
    }
}

async function cloudflareConfigure_POST(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey) {
    const isValid = await isCloudflareCredentialsValid(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey);

    if (isValid) {
        const nodeSettings = getNodeSettings();

        const storageConfig = nodeSettings.storageConfig;

        await cloudflare_resetCdn(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey);
        await cloudflare_setCdnConfiguration(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey);
        await cloudflare_addCdnDnsRecord(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey, storageConfig);
        await cloudflare_purgeEntireCache(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey);

        nodeSettings.isCloudflareCdnEnabled = true;
        nodeSettings.cloudflareEmailAddress = cloudflareEmailAddress;
        nodeSettings.cloudflareZoneId = cloudflareZoneId;
        nodeSettings.cloudflareGlobalApiKey = cloudflareGlobalApiKey;

        setNodeSettings(nodeSettings);

        return { isError: false };
    }
    else {
        throw new Error('could not validate the Cloudflare credentials');
    }
}

async function cloudflareClear_POST() {
    const nodeSettings = getNodeSettings();

    if (nodeSettings.isCloudflareCdnEnabled) {
        const cloudflareEmailAddress = nodeSettings.cloudflareEmailAddress;
        const cloudflareZoneId = nodeSettings.cloudflareZoneId;
        const cloudflareGlobalApiKey = nodeSettings.cloudflareGlobalApiKey;

        await cloudflare_resetCdn(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey);
        await cloudflare_purgeEntireCache(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey);

        nodeSettings.isCloudflareCdnEnabled = false;
        nodeSettings.cloudflareEmailAddress = '';
        nodeSettings.cloudflareZoneId = '';
        nodeSettings.cloudflareGlobalApiKey = '';

        setNodeSettings(nodeSettings);
    }

    return { isError: false };
}

async function cloudflareTurnstileConfigure_POST(cloudflareTurnstileSiteKey, cloudflareTurnstileSecretKey) {
    const nodeSettings = getNodeSettings();

    nodeSettings.isCloudflareTurnstileEnabled = true;
    nodeSettings.cloudflareTurnstileSiteKey = cloudflareTurnstileSiteKey;
    nodeSettings.cloudflareTurnstileSecretKey = cloudflareTurnstileSecretKey;

    setNodeSettings(nodeSettings);

    websocketChatBroadcast({ eventName: 'information', videoId: 'all', cloudflareTurnstileSiteKey: cloudflareTurnstileSiteKey });

    cloudflare_purgeAllWatchPages();

    return { isError: false };
}

async function cloudflareTurnstileConfigureClear_POST() {
    const nodeSettings = getNodeSettings();

    nodeSettings.isCloudflareTurnstileEnabled = false;
    nodeSettings.cloudflareTurnstileSiteKey = '';
    nodeSettings.cloudflareTurnstileSecretKey = '';

    setNodeSettings(nodeSettings);

    websocketChatBroadcast({ eventName: 'information', videoId: 'all', cloudflareTurnstileSiteKey: '' });

    cloudflare_purgeAllWatchPages();

    return { isError: false };
}

function commentsToggle_POST(isCommentsEnabled) {
    if (isBooleanValid(isCommentsEnabled)) {
        const nodeSettings = getNodeSettings();

        nodeSettings.isCommentsEnabled = isCommentsEnabled;

        setNodeSettings(nodeSettings);

        return { isError: false };
    }
    else {
        return { isError: true, message: 'invalid parameters' };
    }
}

async function databaseConfigToggle_POST(databaseConfig) {
    if (isDatabaseConfigValid(databaseConfig)) {
        try {
            const { Sequelize } = require('sequelize');

            const databaseDialect = databaseConfig.databaseDialect;

            let sequelize;

            if (databaseDialect === 'sqlite') {
                sequelize = new Sequelize({
                    dialect: 'sqlite',
                    storage: getDatabaseFilePath(),
                    logging: false
                });
            }
            else if (databaseDialect === 'postgres') {
                const postgresConfig = databaseConfig.postgresConfig;

                const databaseName = postgresConfig.databaseName;
                const username = postgresConfig.username;
                const password = postgresConfig.password;
                const host = postgresConfig.host;
                const port = postgresConfig.port;

                sequelize = new Sequelize(databaseName, username, password, {
                    dialect: 'postgres',
                    host: host,
                    port: port,
                    logging: false
                });
            }

            await sequelize.authenticate();

            await sequelize.close();

            const nodeSettings = getNodeSettings();

            nodeSettings.databaseConfig = databaseConfig;

            setNodeSettings(nodeSettings);

            process.send({ cmd: 'restart_database', databaseDialect: databaseDialect });

            return { isError: false };
        }
        catch (error) {
            throw error;
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function storageConfigToggle_POST(storageConfig) {
    if (isStorageConfigValid(storageConfig)) {
        try {
            const nodeSettings = getNodeSettings();

            if (nodeSettings.isCloudflareCdnEnabled) {
                const cloudflareEmailAddress = nodeSettings.cloudflareEmailAddress;
                const cloudflareZoneId = nodeSettings.cloudflareZoneId;
                const cloudflareGlobalApiKey = nodeSettings.cloudflareGlobalApiKey;

                await cloudflare_addCdnDnsRecord(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey, storageConfig);
                await cloudflare_purgeEntireCache(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey);
            }

            nodeSettings.storageConfig = storageConfig;

            setNodeSettings(nodeSettings);

            return { isError: false };
        }
        catch (error) {
            throw error;
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

function likesToggle_POST(isLikesEnabled) {
    if (isBooleanValid(isLikesEnabled)) {
        const nodeSettings = getNodeSettings();

        nodeSettings.isLikesEnabled = isLikesEnabled;

        setNodeSettings(nodeSettings);

        return { isError: false };
    }
    else {
        return { isError: true, message: 'invalid parameters' };
    }
}

function dislikesToggle_POST(isDislikesEnabled) {
    if (isBooleanValid(isDislikesEnabled)) {
        const nodeSettings = getNodeSettings();

        nodeSettings.isDislikesEnabled = isDislikesEnabled;

        setNodeSettings(nodeSettings);

        return { isError: false };
    }
    else {
        return { isError: true, message: 'invalid parameters' };
    }
}

function reportsToggle_POST(isReportsEnabled) {
    if (isBooleanValid(isReportsEnabled)) {
        const nodeSettings = getNodeSettings();

        nodeSettings.isReportsEnabled = isReportsEnabled;

        setNodeSettings(nodeSettings);

        return { isError: false };
    }
    else {
        return { isError: true, message: 'invalid parameters' };
    }
}

function liveChatToggle_POST(isLiveChatEnabled) {
    if (isBooleanValid(isLiveChatEnabled)) {
        const nodeSettings = getNodeSettings();

        nodeSettings.isLiveChatEnabled = isLiveChatEnabled;

        setNodeSettings(nodeSettings);

        return { isError: false };
    }
    else {
        return { isError: true, message: 'invalid parameters' };
    }
}

function account_POST(username, password) {
    if (isUsernameValid(username) && isPasswordValid(password)) {
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
    if (getIsDockerEnvironment()) {
        return { isError: true, message: 'This node cannot change listening ports because it is running inside of a docker container.' };
    }
    else {
        if (isPortValid(listeningNodePort)) {
            logDebugMessageToConsole('switching node to HTTPS mode', null, null);

            const nodeSettings = getNodeSettings();

            nodeSettings.nodeListeningPort = listeningNodePort;

            setNodeSettings(nodeSettings);

            return { isError: false };
        }
        else {
            return { isError: true, message: 'invalid parameters' };
        }
    }
}

async function networkExternal_POST(publicNodeProtocol, publicNodeAddress, publicNodePort) {
    if (isPublicNodeProtocolValid(publicNodeProtocol) && isPublicNodeAddressValid(publicNodeAddress) && isPortValid(publicNodePort)) {
        const indexedVideos = await performDatabaseReadJob_ALL('SELECT * FROM videos WHERE is_indexed = ?', [true]);

        if (indexedVideos.length > 0) {
            await performNodeIdentification();

            const nodeIdentification = getNodeIdentification();
            const moarTubeTokenProof = nodeIdentification.moarTubeTokenProof;

            const indexerResponseData = await indexer_doNodeExternalNetworkUpdate(moarTubeTokenProof, publicNodeProtocol, publicNodeAddress, publicNodePort);

            if (indexerResponseData.isError) {
                throw new Error(indexerResponseData.message);
            }
        }

        const nodeSettings = getNodeSettings();

        if (nodeSettings.storageConfig.storageMode === 'filesystem') {
            const externalVideosBaseUrl = getExternalVideosBaseUrl();
            const videosDirectoryPath = getVideosDirectoryPath();

            const videos = await performDatabaseReadJob_ALL('SELECT video_id, outputs FROM videos', []);

            for (const video of videos) {
                const videoId = video.video_id;
                const outputs = JSON.parse(video.outputs);

                if (outputs.m3u8.length > 0) {
                    const masterManifestPath = path.join(videosDirectoryPath, videoId, 'adaptive', 'm3u8', 'manifest-master.m3u8');

                    if (fs.existsSync(masterManifestPath)) {
                        await performUpdate(masterManifestPath, externalVideosBaseUrl)
                    }

                    for (const resolution of outputs.m3u8) {
                        const manifestPath = path.join(videosDirectoryPath, videoId, 'adaptive', 'm3u8', 'manifest-' + resolution + '.m3u8');

                        if (fs.existsSync(manifestPath)) {
                            await performUpdate(manifestPath, externalVideosBaseUrl)
                        }
                    }
                }
            }
        }

        async function performUpdate(manifestPath, externalVideosBaseUrl) {
            const oldManifest = fs.readFileSync(manifestPath, "utf-8");

            const newManifest = oldManifest.replace(/(https?:\/\/).*?(\/external\/)/g, externalVideosBaseUrl + "$2");

            fs.writeFileSync(manifestPath, newManifest, "utf-8");
        }

        nodeSettings.publicNodeProtocol = publicNodeProtocol;
        nodeSettings.publicNodeAddress = publicNodeAddress;
        nodeSettings.publicNodePort = publicNodePort;

        setNodeSettings(nodeSettings);

        return { isError: false };
    }
    else {
        return { isError: true, message: 'invalid parameters' };
    }
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
    commentsToggle_POST,
    likesToggle_POST,
    dislikesToggle_POST,
    reportsToggle_POST,
    liveChatToggle_POST,
    account_POST,
    networkInternal_POST,
    networkExternal_POST,
    databaseConfigToggle_POST,
    storageConfigToggle_POST
};