
const express = require('express');
const expressSession = require('express-session');
const bodyParser = require('body-parser');
const expressUseragent = require('express-useragent');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const webSocket = require('ws');
const crypto = require('crypto');
const cluster = require('cluster');
const { Mutex } = require('async-mutex');

const {
	logDebugMessageToConsole, getNodeSettings, setNodeSettings, generateVideoId, getPublicDirectoryPath, getDataDirectoryPath, setPublicDirectoryPath, setPagesDirectoryPath,
	setIsDockerEnvironment, getIsDockerEnvironment, setDataDirectoryPath, setNodeSettingsPath, setImagesDirectoryPath, setVideosDirectoryPath, setDatabaseDirectoryPath,
	setDatabaseFilePath, setCertificatesDirectoryPath, setIsDeveloperMode, setMoarTubeIndexerHttpProtocol, setMoarTubeIndexerIp, setMoarTubeIndexerPort,
	setMoarTubeAliaserHttpProtocol, setMoarTubeAliaserIp, setMoarTubeAliaserPort, setJwtSecret, getDatabaseDirectoryPath, getImagesDirectoryPath, getVideosDirectoryPath,
	getCertificatesDirectoryPath, getNodeSettingsPath, getExpressSessionName, getExpressSessionSecret, setExpressSessionName, setExpressSessionSecret, setMoarTubeNodeHttpPort
} = require('./utils/helpers');
const { provisionSqliteDatabase, finishPendingDatabaseWriteJob } = require('./utils/database');
const { initializeHttpServer, restartHttpServer, gethttpServerWrapper } = require('./utils/httpserver');

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
	process.on('uncaughtException', (error) => {
		logDebugMessageToConsole(null, error, error.stackTrace, true);
	});

	process.on('unhandledRejection', (reason, promise) => {
		logDebugMessageToConsole(null, reason, reason.stack, true);
	});

	logDebugMessageToConsole('starting MoarTube Node', null, null, true);

	provisionSqliteDatabase()
	.then(async () => {
		const mutex = new Mutex();
    
		var liveStreamWorkerStats = {};

		const nodeSettings = getNodeSettings();

		if(nodeSettings.nodeId === '') {
			nodeSettings.nodeId = await generateVideoId(database);

			setNodeSettings(nodeSettings);
		}

		const jwtSecret = crypto.randomBytes(32).toString('hex');

		const numCPUs = require('os').cpus().length;

		for (var i = 0; i < numCPUs; i++) {
			const worker = cluster.fork();
			
			worker.on('message', async (msg) => {
				if (msg.cmd && msg.cmd === 'get_jwt_secret') {
					worker.send({ cmd: 'get_jwt_secret_response', jwtSecret: jwtSecret });
				}
				else if (msg.cmd && msg.cmd === 'update_node_name') {
					const nodeName = msg.nodeName;
					
					Object.values(cluster.workers).forEach((worker) => {
						worker.send({ cmd: 'update_node_name_response', nodeName: nodeName });
					});
				}
				else if (msg.cmd && msg.cmd === 'websocket_broadcast') {
					const message = msg.message;
					
					Object.values(cluster.workers).forEach((worker) => {
						worker.send({ cmd: 'websocket_broadcast_response', message: message });
					});
				}
				else if (msg.cmd && msg.cmd === 'websocket_broadcast_chat') {
					const message = msg.message;
					
					Object.values(cluster.workers).forEach((worker) => {
						worker.send({ cmd: 'websocket_broadcast_chat_response', message: message });
					});
				}
				else if (msg.cmd && msg.cmd === 'database_write_job') {
					const release = await mutex.acquire();
					
					const query = msg.query;
					const parameters = msg.parameters;
					const databaseWriteJobId = msg.databaseWriteJobId;
					
					try {
						database.run(query, parameters, function(error) {
							if(error) {
								logDebugMessageToConsole(null, error, new Error().stack, true);

								worker.send({ cmd: 'database_write_job_result', databaseWriteJobId: databaseWriteJobId, isError: true });
							}
							else {
								worker.send({ cmd: 'database_write_job_result', databaseWriteJobId: databaseWriteJobId, isError: false });
							}
						});
					}
					catch(error) {
						logDebugMessageToConsole(null, error, new Error().stack, true);
						
						worker.send({ cmd: 'database_write_job_result', databaseWriteJobId: databaseWriteJobId, isError: true });
					}
					finally {
						release();
					}
				}
				else if (msg.cmd && msg.cmd === 'live_stream_worker_stats_response') {
					const workerId = msg.workerId;
					const liveStreamStats = msg.liveStreamStats;
					
					liveStreamWorkerStats[workerId] = liveStreamStats;
				}
				else if (msg.cmd && msg.cmd === 'restart_server') {
					const httpMode = msg.httpMode;

					const nodeSettings = getNodeSettings();

					var isSecure = httpMode === "HTTPS" ? true : false;
					
					nodeSettings.isSecure = isSecure;

					setNodeSettings(nodeSettings);

					Object.values(cluster.workers).forEach((worker) => {
						worker.send({ cmd: 'restart_server_response', httpMode: httpMode });
					});
				}
			});
		}

		cluster.on('exit', (worker, code, signal) => {
			logDebugMessageToConsole('worker exited with id <' + worker.process.pid + '> code <' + code + '> signal <' + signal + '>', null, null, true);
		});

		setInterval(function() {
			const nodeSettings = getNodeSettings();
			
			if(nodeSettings.isNodeConfigured && !nodeSettings.isNodePrivate) {
				database.all('SELECT * FROM videos WHERE is_indexed = 1 AND is_index_outdated = 1', function(error, rows) {
					if(error) {
						logDebugMessageToConsole(null, error, new Error().stack, true);
					}
					else {
						if(rows.length > 0) {
							performNodeIdentification(false)
							.then(() => {
								const nodeIdentification = getNodeIdentification();
								
								const nodeIdentifier = nodeIdentification.nodeIdentifier;
								const nodeIdentifierProof = nodeIdentification.nodeIdentifierProof;
								
								rows.forEach(function(row) {
									const videoId = row.video_id;
									const title = row.title;
									const tags = row.tags;
									const views = row.views;
									const isStreaming = (row.is_streaming === 1);
									const lengthSeconds = row.length_seconds;
		
									const nodeIconBase64 = getNodeIconBase64();
		
									const videoPreviewImageBase64 = fs.readFileSync(path.join(getVideosDirectoryPath(), videoId + '/images/preview.jpg')).toString('base64');
									
									indexer_doIndexUpdate(nodeIdentifier, nodeIdentifierProof, videoId, title, tags, views, isStreaming, lengthSeconds, nodeIconBase64, videoPreviewImageBase64)
									.then(async indexerResponseData => {
										if(indexerResponseData.isError) {
											logDebugMessageToConsole(indexerResponseData.message, null, new Error().stack, true);
										}
										else {
											submitDatabaseWriteJob('UPDATE videos SET is_index_outdated = 0 WHERE video_id = ?', [videoId], function(isError) {
												if(isError) {
													logDebugMessageToConsole(null, null, new Error().stack, true);
												}
												else {
													logDebugMessageToConsole('updated video id with index successfully: ' + videoId, null, null, true);
												}
											});
										}
									})
									.catch(error => {
										logDebugMessageToConsole(null, error, new Error().stack, true);
									});
								});
							})
							.catch(error => {
								logDebugMessageToConsole(null, error, new Error().stack, true);
							});
						}
					}
				});
			}
		}, 3000);

		setInterval(function() {
			Object.values(cluster.workers).forEach((worker) => {
				worker.send({ cmd: 'live_stream_worker_stats_request' });
			});
		}, 1000);

		setInterval(function() {
			Object.values(cluster.workers).forEach((worker) => {
				worker.send({ cmd: 'live_stream_worker_stats_update', liveStreamWorkerStats: liveStreamWorkerStats });
			});
		}, 1000);
	})
	.catch(error => {
		logDebugMessageToConsole(null, error, new Error().stack, true);
	});
}
else {
	startNode();

	async function startNode() {
		const app = express();
		
		app.enable('trust proxy');
		
		app.use('/javascript',  express.static(path.join(getPublicDirectoryPath(), 'javascript')));
		app.use('/css',  express.static(path.join(getPublicDirectoryPath(), 'css')));
		app.use('/images', (req, res, next) => {
			const imageName = path.basename(req.url).replace('/', '');

			if(imageName === 'icon.png' || imageName === 'avatar.png' || imageName === 'banner.png') {
				const customImageDirectoryPath = path.join(path.join(getDataDirectoryPath(), 'images'), imageName);

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
		app.use('/images',  express.static(path.join(getPublicDirectoryPath(), 'images')));
		app.use('/fonts',  express.static(path.join(getPublicDirectoryPath(), 'fonts')));
		
		app.use(expressUseragent.express());
		
		app.use(expressSession({
			name: getExpressSessionName(),
			secret: getExpressSessionSecret(),
			resave: false,
			saveUninitialized: true
		}));
		
		app.use(cors());
		
		app.use(bodyParser.urlencoded({ extended: false }));
		app.use(bodyParser.json());
		
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

		await initializeHttpServer(app);
		
		process.on('message', async (msg) => {
			if (msg.cmd === 'get_jwt_secret_response') {
				const jwtSecret = msg.jwtSecret;

				setJwtSecret(jwtSecret);
			}
			else if (msg.cmd === 'websocket_broadcast_response') {
				const message = msg.message;
				
				gethttpServerWrapper().websocketServer.clients.forEach(function each(client) {
					if (client.readyState === webSocket.OPEN) {
						client.send(JSON.stringify(message));
					}
				});
			}
			else if (msg.cmd === 'websocket_broadcast_chat_response') {
				const message = msg.message;
				
				gethttpServerWrapper().websocketServer.clients.forEach(function each(client) {
					if (client.readyState === webSocket.OPEN) {
						if(client.socketType === 'node_peer' && client.videoId === message.videoId) {
							client.send(JSON.stringify(message));
						}
					}
				});
			}
			else if (msg.cmd === 'database_write_job_result') {
				const databaseWriteJobId = msg.databaseWriteJobId;
				const isError = msg.isError;

				finishPendingDatabaseWriteJob(databaseWriteJobId, isError);
			}
			else if (msg.cmd === 'live_stream_worker_stats_request') {
				const liveStreamStats = {};
				
				gethttpServerWrapper().websocketServer.clients.forEach(function each(client) {
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
			else if (msg.cmd === 'live_stream_worker_stats_update') {
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
				
				gethttpServerWrapper().websocketServer.clients.forEach(function each(client) {
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
			else if(msg.cmd === 'restart_server_response') {
				restartHttpServer();
			}
		});
		
		process.send({ cmd: 'get_jwt_secret' });
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

	setExpressSessionName(nodeSettings.expressSessionName);
	setExpressSessionSecret(nodeSettings.expressSessionSecret);
}