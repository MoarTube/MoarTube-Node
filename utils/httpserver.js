const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const webSocket = require('ws');
const httpTerminator = require('http-terminator');
const sanitizeHtml = require('sanitize-html');
const cluster = require('cluster');

const { 
    logDebugMessageToConsole 
} = require('./logger');
const { 
    getCertificatesDirectoryPath 
} = require("./paths");
const { 
    getNodeSettings, getAuthenticationStatus, websocketNodeBroadcast, websocketChatBroadcast 
} = require("./helpers");
const { 
    stoppedPublishVideoUploading, stoppingPublishVideoUploading 
} = require("./trackers/publish-video-uploading-tracker");
const { 
    isVideoIdValid, isChatMessageContentValid, isCloudflareTurnstileTokenValid, isTimestampValid 
} = require('./validators');
const { 
    performDatabaseReadJob_GET, submitDatabaseWriteJob 
} = require('./database');
const { 
    cloudflare_validateTurnstileToken 
} = require('../utils/cloudflare-communications');

let httpServerWrapper;
let app;

function initializeHttpServer(value) {
    if (app == null) {
        app = value;
    }

    const nodeSettings = getNodeSettings();

    let httpServer;

    if (nodeSettings.isSecure) {
        if (fs.existsSync(getCertificatesDirectoryPath())) {
            let key = '';
            let cert = '';
            let ca = [];

            fs.readdirSync(getCertificatesDirectoryPath()).forEach(fileName => {
                if (fileName === 'private_key.pem') {
                    key = fs.readFileSync(path.join(getCertificatesDirectoryPath(), 'private_key.pem'), 'utf8');
                }
                else if (fileName === 'certificate.pem') {
                    cert = fs.readFileSync(path.join(getCertificatesDirectoryPath(), 'certificate.pem'), 'utf8');
                }
                else {
                    const caFile = fs.readFileSync(path.join(getCertificatesDirectoryPath(), fileName), 'utf8');

                    ca.push(caFile);
                }
            });

            if (key === '') {
                throw new Error('private key not found for HTTPS server');
            }
            else if (cert === '') {
                throw new Error('certificate not found for HTTPS server');
            }
            else {
                const sslCredentials = {
                    key: key,
                    cert: cert,
                    ca: ca
                };

                logDebugMessageToConsole('MoarTube Node worker ' + cluster.worker.id + ' is entering secure HTTPS mode', null, null);

                httpServer = https.createServer(sslCredentials, app);
            }
        }
        else {
            throw new Error('certificate directory not found for HTTPS server');
        }
    }
    else {
        logDebugMessageToConsole('MoarTube Node worker ' + cluster.worker.id + ' is entering non-secure HTTP mode', null, null);

        httpServer = http.createServer(app);
    }

    httpServer.requestTimeout = 300000;
    httpServer.keepAliveTimeout = 10000;

    httpServer.listen(nodeSettings.nodeListeningPort, function () {
        logDebugMessageToConsole('MoarTube Node worker ' + cluster.worker.id + ' is listening on port ' + nodeSettings.nodeListeningPort, null, null);

        const websocketServer = new webSocket.Server({
            noServer: true,
            perMessageDeflate: false
        });

        websocketServer.on('connection', function connection(ws, req) {
            logDebugMessageToConsole('MoarTube Client websocket connected', null, null);

            let ip = req.headers['CF-Connecting-IP'];

            if (ip == null) {
                ip = req.socket.remoteAddress;
            }

            ws.on('close', () => {
                logDebugMessageToConsole('MoarTube Client websocket disconnected', null, null);
            });

            ws.on('message', async (message) => {
                const parsedMessage = JSON.parse(message.toString());

                const jwtToken = parsedMessage.jwtToken;

                if (jwtToken != null) {
                    // attempting a websocket message that expects authentication

                    const isAuthenticated = await getAuthenticationStatus(jwtToken);

                    if (isAuthenticated) {
                        if (parsedMessage.eventName === 'ping') {
                            //logDebugMessageToConsole('received ping from client', null, null);

                            if (ws.socketType === 'moartube_client') {
                                //logDebugMessageToConsole('sending pong to client', null, null);

                                ws.send(JSON.stringify({ eventName: 'pong' }));
                            }
                        }
                        else if (parsedMessage.eventName === 'register') {
                            const socketType = parsedMessage.socketType;

                            if (socketType === 'moartube_client') {
                                ws.socketType = socketType;

                                ws.send(JSON.stringify({ eventName: 'registered' }));
                            }
                        }
                        else if (parsedMessage.eventName === 'echo') {
                            if (parsedMessage.data.eventName === 'video_status') {
                                const payload = parsedMessage.data.payload;

                                const type = payload.type;
                                const videoId = payload.videoId;

                                if (isVideoIdValid(videoId, false)) {
                                    if (type === 'importing') {
                                        const progress = payload.progress;

                                        websocketNodeBroadcast(parsedMessage);
                                    }
                                    else if (type === 'imported') {
                                        const lengthTimestamp = payload.lengthTimestamp;

                                        websocketNodeBroadcast(parsedMessage);
                                    }
                                    else if (type === 'publishing') {
                                        const format = payload.format;
                                        const resolution = payload.resolution;
                                        const progress = payload.progress;

                                        websocketNodeBroadcast(parsedMessage);
                                    }
                                    else if (type === 'published') {
                                        const lengthTimestamp = payload.lengthTimestamp;
                                        const lengthSeconds = payload.lengthSeconds;

                                        websocketNodeBroadcast(parsedMessage);
                                    }
                                    else if (type === 'streaming') {
                                        const lengthTimestamp = payload.lengthTimestamp;
                                        const bandwidth = payload.bandwidth;

                                        websocketNodeBroadcast(parsedMessage);
                                    }
                                    else if (type === 'importing_stopping') {
                                        websocketNodeBroadcast(parsedMessage);
                                    }
                                    else if (type === 'importing_stopped') {
                                        websocketNodeBroadcast(parsedMessage);
                                    }
                                    else if (type === 'publishing_stopping') {
                                        stoppingPublishVideoUploading(videoId, parsedMessage);
                                    }
                                    else if (type === 'publishing_stopped') {
                                        stoppedPublishVideoUploading(videoId, parsedMessage)
                                    }
                                    else if (type === 'streaming_stopping') {
                                        websocketNodeBroadcast(parsedMessage);
                                    }
                                    else if (type === 'streaming_stopped') {
                                        websocketNodeBroadcast(parsedMessage);
                                    }
                                    else if (type === 'finalized') {
                                        websocketNodeBroadcast(parsedMessage);
                                    }
                                }
                            }
                            else if (parsedMessage.data.eventName === 'video_data') {
                                websocketNodeBroadcast(parsedMessage);
                            }
                        }
                    }
                }
                else {
                    if (parsedMessage.eventName === 'register') {
                        const socketType = parsedMessage.socketType;

                        if (socketType === 'node_peer') {
                            ws.socketType = socketType;

                            const nodeSettings = getNodeSettings();

                            ws.send(JSON.stringify({ eventName: 'registered' }));
                            ws.send(JSON.stringify({ eventName: 'information', cloudflareTurnstileSiteKey: nodeSettings.cloudflareTurnstileSiteKey }));
                        }
                        else {
                            ws.send(JSON.stringify({ eventName: 'error', errorType: 'register', message: 'invalid socket type' }));
                            ws.close();
                        }
                    }
                    else if (parsedMessage.eventName === 'chat') {
                        if (ws.socketType != null) {
                            if (parsedMessage.type === 'join') {
                                const videoId = parsedMessage.videoId;

                                if (isVideoIdValid(videoId, false)) {
                                    ws.videoId = videoId;

                                    let liveChatUsername = '';

                                    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
                                    for (let i = 0; i < 8; i++) {
                                        liveChatUsername += chars[Math.floor(Math.random() * chars.length)];
                                    }

                                    ws.liveChatUsername = liveChatUsername;
                                    ws.liveChatUsernameColorCode = ('000000' + Math.floor(Math.random() * 16777215).toString(16)).slice(-6);

                                    ws.rateLimiter = {
                                        timestamps: [],
                                        rateLimitTimestamp: 0,
                                        rateLimitLevel: -1,
                                        isRateLimited: false
                                    };

                                    ws.send(JSON.stringify({ eventName: 'joined', liveChatUsername: ws.liveChatUsername, liveChatUsernameColorCode: ws.liveChatUsernameColorCode }));
                                }
                                else {
                                    ws.send(JSON.stringify({ eventName: 'error', errorType: 'join', message: 'invalid join parameters' }));
                                    ws.close();
                                }
                            }
                            else if (parsedMessage.type === 'message') {
                                const videoId = parsedMessage.videoId;
                                const chatMessageContent = sanitizeHtml(parsedMessage.chatMessageContent, { allowedTags: [], allowedAttributes: {} });
                                const cloudflareTurnstileToken = parsedMessage.cloudflareTurnstileToken;
                                const sentTimestamp = parsedMessage.sentTimestamp;

                                if (isVideoIdValid(videoId, false) && isChatMessageContentValid(chatMessageContent) && isTimestampValid(sentTimestamp) && isCloudflareTurnstileTokenValid(cloudflareTurnstileToken, true)) {
                                    let errorMessage;

                                    try {
                                        const nodeSettings = getNodeSettings();

                                        if (!nodeSettings.isLiveChatEnabled) {
                                            errorMessage = 'live chat is currently disabled';
                                        }
                                        else if (nodeSettings.isCloudflareTurnstileEnabled) {
                                            if (cloudflareTurnstileToken.length === 0) {
                                                errorMessage = 'human verification was enabled on this MoarTube Node, please refresh your browser';
                                            }
                                            else {
                                                await cloudflare_validateTurnstileToken(cloudflareTurnstileToken, ip);
                                            }
                                        }
                                        else {
                                            const video = await performDatabaseReadJob_GET('SELECT is_live_chat_enabled FROM videos WHERE video_id = ?', [videoId]);
                            
                                            if(video != null) {
                                                const isLiveChatEnabled = video.is_live_chat_enabled ? true : false;
                            
                                                if(!isLiveChatEnabled) {
                                                    errorMessage = 'live chat is currently disabled';
                                                }
                                            }
                                            else {
                                                errorMessage = 'this video no longer exists';
                                            }
                                        }
                                    }
                                    catch (error) {
                                        throw error;
                                    }

                                    if (errorMessage == null) {
                                        const rateLimiter = ws.rateLimiter;

                                        const timestamp = Date.now();

                                        const BASE_RATE_LIMIT_PENALTY_MILLISECONDS = 5000;
                                        const BASE_RATE_LIMIT_PENALTY_SECONDS = BASE_RATE_LIMIT_PENALTY_MILLISECONDS / 1000;
                                        const RATE_LIMIT_EAGERNESS_PENALTY_MILLISECONDS = 3000;

                                        if (rateLimiter.isRateLimited) {
                                            const rateLimitThreshold = BASE_RATE_LIMIT_PENALTY_MILLISECONDS + (rateLimiter.rateLimitLevel * BASE_RATE_LIMIT_PENALTY_MILLISECONDS);

                                            if ((timestamp - rateLimiter.rateLimitTimestamp) > rateLimitThreshold) {
                                                if ((timestamp - rateLimiter.rateLimitTimestamp) < (rateLimitThreshold + RATE_LIMIT_EAGERNESS_PENALTY_MILLISECONDS)) {
                                                    rateLimiter.rateLimitTimestamp = timestamp;
                                                    rateLimiter.rateLimitLevel++;

                                                    ws.send(JSON.stringify({ eventName: 'limited', rateLimitSeconds: BASE_RATE_LIMIT_PENALTY_SECONDS + (rateLimiter.rateLimitLevel * BASE_RATE_LIMIT_PENALTY_SECONDS) }));
                                                }
                                                else {
                                                    rateLimiter.isRateLimited = false;
                                                    rateLimiter.rateLimitLevel = -1;
                                                }
                                            }
                                            else {
                                                return;
                                            }
                                        }

                                        if (rateLimiter.timestamps.length < 3) {
                                            rateLimiter.timestamps.push(timestamp);
                                        }
                                        else if (rateLimiter.timestamps.length === 3) {
                                            rateLimiter.timestamps.shift();
                                            rateLimiter.timestamps.push(timestamp);
                                        }

                                        if (rateLimiter.timestamps.length === 3) {
                                            const firstTimestamp = rateLimiter.timestamps[0];
                                            const lastTimestamp = rateLimiter.timestamps[rateLimiter.timestamps.length - 1];

                                            const timeEllapsed = lastTimestamp - firstTimestamp;

                                            if (timeEllapsed < BASE_RATE_LIMIT_PENALTY_MILLISECONDS) {
                                                rateLimiter.rateLimitTimestamp = timestamp;
                                                rateLimiter.isRateLimited = true;
                                                rateLimiter.rateLimitLevel++;

                                                ws.send(JSON.stringify({ eventName: 'limited', rateLimitSeconds: BASE_RATE_LIMIT_PENALTY_SECONDS }));
                                            }
                                        }

                                        const liveChatUsername = ws.liveChatUsername;
                                        const liveChatUsernameColorCode = ws.liveChatUsernameColorCode;

                                        ws.rateLimiter = rateLimiter;

                                        websocketChatBroadcast({ eventName: 'message', videoId: videoId, chatMessageContent: chatMessageContent, sentTimestamp: sentTimestamp, liveChatUsername: liveChatUsername, liveChatUsernameColorCode: liveChatUsernameColorCode });

                                        const video = await performDatabaseReadJob_GET('SELECT * FROM videos WHERE video_id = ?', [videoId]);

                                        if (video != null) {
                                            const meta = JSON.parse(video.meta);

                                            const isChatHistoryEnabled = meta.chatSettings.isChatHistoryEnabled;

                                            if (isChatHistoryEnabled) {
                                                const chatHistoryLimit = meta.chatSettings.chatHistoryLimit;

                                                await submitDatabaseWriteJob('INSERT INTO livechatmessages(video_id, username, username_color_hex_code, chat_message, timestamp) VALUES (?, ?, ?, ?, ?)', [videoId, liveChatUsername, liveChatUsernameColorCode, chatMessageContent, timestamp]);

                                                if (chatHistoryLimit !== 0) {
                                                    await submitDatabaseWriteJob('DELETE FROM livechatmessages WHERE chat_message_id NOT IN (SELECT chat_message_id FROM livechatmessages where video_id = ? ORDER BY chat_message_id DESC LIMIT ?)', [videoId, chatHistoryLimit]);
                                                }
                                            }
                                        }
                                    }
                                    else {
                                        const liveChatUsername = ws.liveChatUsername;
                                        const liveChatUsernameColorCode = ws.liveChatUsernameColorCode;

                                        ws.send(JSON.stringify({ eventName: 'error', errorType: 'message', message: errorMessage, sentTimestamp: sentTimestamp, liveChatUsername: liveChatUsername, liveChatUsernameColorCode: liveChatUsernameColorCode }));
                                    }
                                }
                                else {
                                    ws.send(JSON.stringify({ eventName: 'error', errorType: 'message', message: 'invalid message parameters' }));
                                    ws.close();
                                }
                            }
                        }
                    }
                }
            });
        });

        httpServer.on('upgrade', function upgrade(req, socket, head) {
            websocketServer.handleUpgrade(req, socket, head, function done(ws) {
                websocketServer.emit('connection', ws, req);
            });
        });

        httpServerWrapper = {
            httpServer: httpServer,
            websocketServer: websocketServer
        };
    });
}

async function restartHttpServer() {
    //httpServerWrapper.httpServer.closeAllConnections();

    httpServerWrapper.websocketServer.clients.forEach(function each(client) {
        if (client.readyState === webSocket.OPEN) {
            client.close();
        }
    });

    logDebugMessageToConsole('attempting to terminate node', null, null);

    const terminator = httpTerminator.createHttpTerminator({ server: httpServerWrapper.httpServer });

    logDebugMessageToConsole('termination of node in progress', null, null);

    await terminator.terminate();

    logDebugMessageToConsole('terminated node', null, null);

    httpServerWrapper.websocketServer.close(function () {
        logDebugMessageToConsole('node websocketServer closed', null, null);

        httpServerWrapper.httpServer.close(async () => {
            logDebugMessageToConsole('node web server closed', null, null);

            await initializeHttpServer();
        });
    });
}

function getHttpServerWrapper() {
    return httpServerWrapper;
}

module.exports = {
    initializeHttpServer,
    restartHttpServer,
    getHttpServerWrapper
};