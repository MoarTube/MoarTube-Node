const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const webSocket = require('ws');
const httpTerminator = require('http-terminator');
const sanitizeHtml = require('sanitize-html');
const cluster = require('cluster');

const { logDebugMessageToConsole } = require('./logger');
const { getCertificatesDirectoryPath } = require("./paths");
const { getNodeSettings, getAuthenticationStatus, websocketNodeBroadcast, websocketChatBroadcast } = require("./helpers");
const { stoppedPublishVideoUploading, stoppingPublishVideoUploading } = require("./trackers/publish-video-uploading-tracker");
const { isVideoIdValid, isChatMessageContentValid } = require('./validators');
const { performDatabaseReadJob_GET, submitDatabaseWriteJob } = require('./database');

let httpServerWrapper;
let app;

function initializeHttpServer(value) {
    return new Promise(function(resolve, reject) {
        if(app == null) {
            app = value;
        }

        const nodeSettings = getNodeSettings();

        let httpServer;
        
        if(nodeSettings.isSecure) {
            if (fs.existsSync(getCertificatesDirectoryPath())) {
                var key = '';
                var cert = '';
                var ca = [];
                
                fs.readdirSync(getCertificatesDirectoryPath()).forEach(fileName => {
                    if(fileName === 'private_key.pem') {
                        key = fs.readFileSync(path.join(getCertificatesDirectoryPath(), 'private_key.pem'), 'utf8');
                    }
                    else if(fileName === 'certificate.pem') {
                        cert = fs.readFileSync(path.join(getCertificatesDirectoryPath(), 'certificate.pem'), 'utf8');
                    }
                    else {
                        const caFile = fs.readFileSync(path.join(getCertificatesDirectoryPath(), fileName), 'utf8');
                        
                        ca.push(caFile);
                    }
                });
                
                if(key === '') {
                    reject('private key not found for HTTPS server');
                }
                else if(cert === '') {
                    reject('certificate not found for HTTPS server');
                }
                else {
                    const sslCredentials =	{
                        key: key,
                        cert: cert,
                        ca: ca
                    };

                    logDebugMessageToConsole('MoarTube Node worker ' + cluster.worker.id + ' is entering secure HTTPS mode', null, null, true);
                    
                    httpServer = https.createServer(sslCredentials, app);
                }
            }
            else {
                reject('certificate directory not found for HTTPS server');
            }
        }
        else {
            logDebugMessageToConsole('MoarTube Node worker ' + cluster.worker.id + ' is entering non-secure HTTP mode', null, null, true);

            httpServer = http.createServer(app);
        }
        
        httpServer.requestTimeout = 0; // needed for long duration requests (streaming, large uploads)
        httpServer.keepAliveTimeout = 10000;
        
        httpServer.listen(nodeSettings.nodeListeningPort, function() {
            logDebugMessageToConsole('MoarTube Node worker ' + cluster.worker.id + ' is listening on port ' + nodeSettings.nodeListeningPort, null, null, true);
            
            const websocketServer = new webSocket.Server({ 
                noServer: true, 
                perMessageDeflate: false 
            });
            
            websocketServer.on('connection', function connection(ws) {
                logDebugMessageToConsole('MoarTube Client websocket connected', null, null, true);
                
                ws.on('close', () => {
                    logDebugMessageToConsole('MoarTube Client websocket disconnected', null, null, true);
                });
                
                ws.on('message', (message) => {
                    const parsedMessage = JSON.parse(message);
                    
                    const jwtToken = parsedMessage.jwtToken;
                    
                    if(jwtToken != null) {
                        // attempting a websocket message that expects authentication
                        
                        getAuthenticationStatus(jwtToken)
                        .then((isAuthenticated) => {
                            if(isAuthenticated) {
                                if(parsedMessage.eventName === 'ping') {
                                    //logDebugMessageToConsole('received ping from client', null, null, true);

                                    if(ws.socketType === 'moartube_client') {
                                        //logDebugMessageToConsole('sending pong to client', null, null, true);

                                        ws.send(JSON.stringify({eventName: 'pong'}));
                                    }
                                }
                                else if(parsedMessage.eventName === 'register') {
                                    const socketType = parsedMessage.socketType;
                                    
                                    if(socketType === 'moartube_client') {
                                        ws.socketType = socketType;
                                        
                                        ws.send(JSON.stringify({eventName: 'registered'}));
                                    }
                                }
                                else if(parsedMessage.eventName === 'echo') {
                                    if(parsedMessage.data.eventName === 'video_status') {
                                        const payload = parsedMessage.data.payload;
                                        
                                        const type = payload.type;
                                        const videoId = payload.videoId;
                                        
                                        if(isVideoIdValid(videoId)) {
                                            if(type === 'importing') {
                                                const progress = payload.progress;
                                                
                                                websocketNodeBroadcast(parsedMessage);
                                            }
                                            else if(type === 'imported') {
                                                const lengthTimestamp = payload.lengthTimestamp;
                                                
                                                websocketNodeBroadcast(parsedMessage);
                                            }
                                            else if(type === 'publishing') {
                                                const format = payload.format;
                                                const resolution = payload.resolution;
                                                const progress = payload.progress;
                                                
                                                websocketNodeBroadcast(parsedMessage);
                                            }
                                            else if(type === 'published') {
                                                const lengthTimestamp = payload.lengthTimestamp;
                                                const lengthSeconds = payload.lengthSeconds;
                                                
                                                websocketNodeBroadcast(parsedMessage);
                                            }
                                            else if(type === 'streaming') {
                                                const lengthTimestamp = payload.lengthTimestamp;
                                                const bandwidth = payload.bandwidth;
                                                
                                                websocketNodeBroadcast(parsedMessage);
                                            }
                                            else if(type === 'importing_stopping') {
                                                websocketNodeBroadcast(parsedMessage);
                                            }
                                            else if(type === 'importing_stopped') {
                                                websocketNodeBroadcast(parsedMessage);
                                            }
                                            else if(type === 'publishing_stopping') {
                                                stoppingPublishVideoUploading(videoId, parsedMessage);
                                            }
                                            else if(type === 'publishing_stopped') {
                                                stoppedPublishVideoUploading(videoId, parsedMessage)
                                            }
                                            else if(type === 'streaming_stopping') {
                                                websocketNodeBroadcast(parsedMessage);
                                            }
                                            else if(type === 'streaming_stopped') {
                                                websocketNodeBroadcast(parsedMessage);
                                            }
                                            else if(type === 'finalized') {
                                                websocketNodeBroadcast(parsedMessage);
                                            }
                                        }
                                    }
                                    else if(parsedMessage.data.eventName === 'video_data') {
                                        websocketNodeBroadcast(parsedMessage);
                                    }
                                }
                            }
                        })
                        .catch(error => {
                            logDebugMessageToConsole(null, error, new Error().stack, true);
                        });
                    }
                    else {
                        if(parsedMessage.eventName === 'register') {
                            const socketType = parsedMessage.socketType;
                            
                            if(socketType === 'node_peer') {
                                ws.socketType = socketType;
                                
                                ws.send(JSON.stringify({eventName: 'registered'}));
                            }
                        }
                        else if(parsedMessage.eventName === 'chat') {
                            if(ws.socketType != null) {
                                if(parsedMessage.type === 'join') {
                                    const videoId = parsedMessage.videoId;
                                    
                                    if(isVideoIdValid(videoId)) {
                                        ws.videoId = videoId;
                                        
                                        var username = '';
                                        
                                        const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
                                        for (var i = 0; i < 8; i++) {
                                            username += chars[Math.floor(Math.random() * chars.length)];
                                        }
                                        
                                        ws.username = username;
                                        ws.usernameColorCode = ('000000' + Math.floor(Math.random()*16777215).toString(16)).slice(-6);
                                        
                                        ws.rateLimiter = {
                                            timestamps: [],
                                            rateLimitTimestamp: 0,
                                            rateLimitLevel: -1,
                                            isRateLimited: false
                                        };
                                        
                                        ws.send(JSON.stringify({eventName: 'joined'}));
                                    }
                                }
                                else if(parsedMessage.type === 'message') {
                                    const videoId = parsedMessage.videoId;
                                    const chatMessageContent = sanitizeHtml(parsedMessage.chatMessageContent, {allowedTags: [], allowedAttributes: {}});
                                    
                                    if(isVideoIdValid(videoId) && isChatMessageContentValid(chatMessageContent)) {
                                        const rateLimiter = ws.rateLimiter;
                                        
                                        const timestamp = Date.now();
                                        
                                        const BASE_RATE_LIMIT_PENALTY_MILLISECONDS = 5000;
                                        const BASE_RATE_LIMIT_PENALTY_SECONDS = BASE_RATE_LIMIT_PENALTY_MILLISECONDS / 1000;
                                        const RATE_LIMIT_EAGERNESS_PENALTY_MILLISECONDS = 3000;
                                        
                                        if(rateLimiter.isRateLimited) {
                                            const rateLimitThreshold = BASE_RATE_LIMIT_PENALTY_MILLISECONDS + (rateLimiter.rateLimitLevel * BASE_RATE_LIMIT_PENALTY_MILLISECONDS);
                                            
                                            if((timestamp - rateLimiter.rateLimitTimestamp) > rateLimitThreshold) {
                                                if((timestamp - rateLimiter.rateLimitTimestamp) < (rateLimitThreshold + RATE_LIMIT_EAGERNESS_PENALTY_MILLISECONDS)) {
                                                    rateLimiter.rateLimitTimestamp = timestamp;
                                                    rateLimiter.rateLimitLevel++;
                                                    
                                                    ws.send(JSON.stringify({eventName: 'limited', rateLimitSeconds: BASE_RATE_LIMIT_PENALTY_SECONDS + (rateLimiter.rateLimitLevel * BASE_RATE_LIMIT_PENALTY_SECONDS)}));
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
                                        
                                        if(rateLimiter.timestamps.length < 3) {
                                            rateLimiter.timestamps.push(timestamp);
                                        }
                                        else if(rateLimiter.timestamps.length === 3) {
                                            rateLimiter.timestamps.shift();
                                            rateLimiter.timestamps.push(timestamp);
                                        }
                                        
                                        if(rateLimiter.timestamps.length === 3) {
                                            const firstTimestamp = rateLimiter.timestamps[0];
                                            const lastTimestamp = rateLimiter.timestamps[rateLimiter.timestamps.length - 1];
                                            
                                            const timeEllapsed = lastTimestamp - firstTimestamp;
                                            
                                            if(timeEllapsed < BASE_RATE_LIMIT_PENALTY_MILLISECONDS) {
                                                rateLimiter.rateLimitTimestamp = timestamp;
                                                rateLimiter.isRateLimited = true;
                                                rateLimiter.rateLimitLevel++;
                                                
                                                ws.send(JSON.stringify({eventName: 'limited', rateLimitSeconds: BASE_RATE_LIMIT_PENALTY_SECONDS}));
                                            }
                                        }
                                        
                                        const username = ws.username;
                                        const usernameColorCode = ws.usernameColorCode;
                                        
                                        ws.rateLimiter = rateLimiter;
                                        
                                        websocketChatBroadcast({eventName: 'message', videoId: videoId, chatMessageContent: chatMessageContent, username: username, usernameColorCode: usernameColorCode});

                                        performDatabaseReadJob_GET('SELECT * FROM videos WHERE video_id = ?', [videoId])
                                        .then(video => {
                                            if(video != null) {
                                                const meta = JSON.parse(video.meta);
                                                
                                                const isChatHistoryEnabled = meta.chatSettings.isChatHistoryEnabled;
                                                
                                                if(isChatHistoryEnabled) {
                                                    const chatHistoryLimit = meta.chatSettings.chatHistoryLimit;
                                                    
                                                    submitDatabaseWriteJob('INSERT INTO liveChatMessages(video_id, username, username_color_hex_code, chat_message, timestamp) VALUES (?, ?, ?, ?, ?)', [videoId, username, usernameColorCode, chatMessageContent, timestamp], function(isError) {
                                                        if(isError) {
                                                            
                                                        }
                                                        else {
                                                            if(chatHistoryLimit !== 0) {
                                                                submitDatabaseWriteJob('DELETE FROM liveChatMessages WHERE chat_message_id NOT IN (SELECT chat_message_id FROM liveChatMessages where video_id = ? ORDER BY chat_message_id DESC LIMIT ?)', [videoId, chatHistoryLimit], function(isError) {
                                                                    if(isError) {
                                                                        
                                                                    }
                                                                    else {
                                                                        
                                                                    }
                                                                });
                                                            }
                                                        }
                                                    });
                                                }
                                            }
                                        })
                                        .catch(error => {
                                            logDebugMessageToConsole(null, error, new Error().stack, true);
                                        });
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

            resolve();
        });
    });
}

async function restartHttpServer() {
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