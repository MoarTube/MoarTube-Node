const http = require('http');
const https = require('https');
const express = require('express');
const expressSession = require('express-session');
const bodyParser = require('body-parser');
const expressUseragent = require('express-useragent');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const webSocket = require('ws');
const bcryptjs = require('bcryptjs');
const crypto = require('crypto');
const sanitizeHtml = require('sanitize-html');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { v1: uuidv1, v4: uuidv4 } = require('uuid');
const httpTerminator = require('http-terminator');
const cluster = require('cluster');
const { Mutex } = require('async-mutex');

const { logDebugMessageToConsole, getDatabaseFilePath, getNodeSettings, loadConfig } = require('./utils/helpers');
const { provisionSqliteDatabase, getDatabase } = require('./utils/database');

const accountRoutes = require('./routes/account');
const captchaRoutes = require('./routes/captcha');
const channelRoutes = require('./routes/channel');
const commentsRoutes = require('./routes/comments');
const embedRoutes = require('./routes/embed');
const homeRoutes = require('./routes/home');
const reportsArchiveCommentsRoutes = require('./routes/reports-archive-comments');
const reportsArchiveVideosRoutes = require('./routes/reports-archive-videos');
const reportsCommentsRoutes = require('./routes/reports-comments');
const reportsVideosRoutes = require('./routes/reports-videos');
const reportsRoutes = require('./routes/reports');
const settingsRoutes = require('./routes/settings');
const streamsRoutes = require('./routes/streams');
const videosRoutes = require('./routes/videos');

loadConfig();

if(cluster.isMaster) {
	logDebugMessageToConsole('starting MoarTube node', null, null, true);

	provisionSqliteDatabase()
	.then(async () => {
		// do nothing
	})
	.catch(error => {
		logDebugMessageToConsole(null, error, new Error().stack, true);
	});
}
else {
	startNode();

	async function startNode() {
		process.on('uncaughtException', (error) => {
			logDebugMessageToConsole(null, error, error.stackTrace, true);
		});

		process.on('unhandledRejection', (reason, promise) => {
			logDebugMessageToConsole(null, reason, reason.stack, true);
		});
		
		var JWT_SECRET;
		var PENDING_DATABASE_WRITE_JOBS = [];

		var httpServerWrapper;
		
		process.on('message', async (msg) => {
			if (msg.cmd === 'websocket_broadcast_response') {
				if(httpServerWrapper != null) {
					const message = msg.message;
					
					httpServerWrapper.websocketServer.clients.forEach(function each(client) {
						if (client.readyState === webSocket.OPEN) {
							client.send(JSON.stringify(message));
						}
					});
				}
			}
			else if (msg.cmd === 'websocket_broadcast_chat_response') {
				if(httpServerWrapper != null) {
					const message = msg.message;
					
					httpServerWrapper.websocketServer.clients.forEach(function each(client) {
						if (client.readyState === webSocket.OPEN) {
							if(client.socketType === 'node_peer' && client.videoId === message.videoId) {
								client.send(JSON.stringify(message));
							}
						}
					});
				}
			}
			else if (msg.cmd === 'get_jwt_secret_response') {
				JWT_SECRET = msg.jwtSecret;
			}
			else if (msg.cmd === 'database_write_job_result') {
				const databaseWriteJobId = msg.databaseWriteJobId;
				const isError = msg.isError;
				
				if(PENDING_DATABASE_WRITE_JOBS.hasOwnProperty(databaseWriteJobId)) {
					const pendingDatabaseWriteJob = PENDING_DATABASE_WRITE_JOBS[databaseWriteJobId];
					
					const callback = pendingDatabaseWriteJob.callback;
					
					delete PENDING_DATABASE_WRITE_JOBS[databaseWriteJobId];
					
					callback(isError);
				}
			}
			else if (msg.cmd === 'live_stream_worker_stats_request') {
				if(httpServerWrapper != null) {
					const liveStreamStats = {};
					
					httpServerWrapper.websocketServer.clients.forEach(function each(client) {
						if (client.readyState === webSocket.OPEN) {
							if(client.socketType === 'node_peer') {
								const videoId = client.videoId;
								
								if(!liveStreamStats.hasOwnProperty(videoId)) {
									liveStreamStats[videoId] = 0;
								}
								
								liveStreamStats[videoId]++;
							}
						}
					});
					
					process.send({ cmd: 'live_stream_worker_stats_response', workerId: cluster.worker.id, liveStreamStats: liveStreamStats });
				}
			}
			else if (msg.cmd === 'live_stream_worker_stats_update') {
				if(httpServerWrapper != null) {
					const liveStreamWorkerStats = msg.liveStreamWorkerStats;
					
					const liveStreamStats = {};
					
					for (const worker in liveStreamWorkerStats) {
						for (const videoId in liveStreamWorkerStats[worker]) {
							if (liveStreamStats.hasOwnProperty(videoId)) {
								liveStreamStats[videoId] += liveStreamWorkerStats[worker][videoId];
							}
							else {
								liveStreamStats[videoId] = liveStreamWorkerStats[worker][videoId];
							}
						}
					}
					
					httpServerWrapper.websocketServer.clients.forEach(function each(client) {
						if (client.readyState === webSocket.OPEN) {
							if(client.socketType === 'node_peer') {
								const videoId = client.videoId;
								
								if(liveStreamStats.hasOwnProperty(videoId)) {
									client.send(JSON.stringify({eventName: 'stats', watchingCount: liveStreamStats[videoId]}));
								}
							}
						}
					});
				}
			}
			else if(msg.cmd === 'restart_server_response') {
				if(httpServerWrapper != null) {
					restartHttpServer();
				}
			}
		});
		
		process.send({ cmd: 'get_jwt_secret' });
		
		const publishVideoUploadingTracker = {};

		const app = express();
		
		app.enable('trust proxy');
		
		app.use('/javascript',  express.static(path.join(PUBLIC_DIRECTORY_PATH, 'javascript')));
		app.use('/css',  express.static(path.join(PUBLIC_DIRECTORY_PATH, 'css')));
		app.use('/images', (req, res, next) => {
			const imageName = path.basename(req.url).replace('/', '');

			if(imageName === 'icon.png' || imageName === 'avatar.png' || imageName === 'banner.png') {
				const customImageDirectoryPath = path.join(path.join(DATA_DIRECTORY_PATH, 'images'), imageName);

				if(fs.existsSync(customImageDirectoryPath)) {
					const fileStream = fs.createReadStream(customImageDirectoryPath);
					res.setHeader('Content-Type', 'image/png');
					fileStream.pipe(res);
				}
				else {
					next();
				}
			}
			else {
				next();
			}
		});
		app.use('/images',  express.static(path.join(PUBLIC_DIRECTORY_PATH, 'images')));
		app.use('/fonts',  express.static(path.join(PUBLIC_DIRECTORY_PATH, 'fonts')));
		
		app.use(expressUseragent.express());
		
		app.use(expressSession({
			name: EXPRESS_SESSION_NAME,
			secret: EXPRESS_SESSION_SECRET,
			resave: false,
			saveUninitialized: true
		}));
		
		app.use(cors());
		
		app.use(bodyParser.urlencoded({ extended: false }));
		app.use(bodyParser.json());
		
		await initializeHttpServer();
		
		app.use(function(req, res, next) {
			next();
		});

		app.use('/account', accountRoutes);
		app.use('/captcha', captchaRoutes);
		app.use('/channel', channelRoutes);
		app.use('/comments', commentsRoutes);
		app.use('/embed', embedRoutes);
		app.use('/', homeRoutes);
		app.use('/reports/archive/comments', reportsArchiveCommentsRoutes);
		app.use('/reports/archive/videos', reportsArchiveVideosRoutes);
		app.use('/reports/comments', reportsCommentsRoutes);
		app.use('/reports/videos', reportsVideosRoutes);
		app.use('/reports', reportsRoutes);
		app.use('/settings', settingsRoutes);
		app.use('/streams', streamsRoutes);
		app.use('/videos', videosRoutes);
	}
}