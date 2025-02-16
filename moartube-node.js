const express = require('express');
const expressSubdomain = require('express-subdomain');
const expressSession = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const webSocket = require('ws');
const crypto = require('crypto');
const cluster = require('cluster');
const { Mutex } = require('async-mutex');
const engine = require('express-dot-engine');

const { 
	logDebugMessageToConsole 
} = require('./utils/logger');
const {
	getNodeSettings, setNodeSettings, generateVideoId,
	setIsDockerEnvironment, getIsDockerEnvironment, setIsDeveloperMode, getIsDeveloperMode, setJwtSecret, getExpressSessionName, 
	getExpressSessionSecret, setExpressSessionName, setExpressSessionSecret, performNodeIdentification, getNodeIdentification, 
	getNodeIconPngBase64, getNodeAvatarPngBase64, getVideoPreviewJpgBase64, setLastCheckedContentTracker, getHostsFilePath
} = require('./utils/helpers');
const { 
	setMoarTubeIndexerHttpProtocol, setMoarTubeIndexerIp, setMoarTubeIndexerPort, setMoarTubeAliaserHttpProtocol, 
	setMoarTubeAliaserIp, setMoarTubeAliaserPort 
} = require('./utils/urls');
const { 
	getPublicDirectoryPath, getDataDirectoryPath, setPublicDirectoryPath, setDataDirectoryPath, setNodeSettingsPath, setImagesDirectoryPath,
	setVideosDirectoryPath, setDatabaseDirectoryPath, setDatabaseFilePath, setCertificatesDirectoryPath, getDatabaseDirectoryPath, 
	getImagesDirectoryPath, getVideosDirectoryPath, getCertificatesDirectoryPath, getNodeSettingsPath, setViewsDirectoryPath, 
	getViewsDirectoryPath, setLastCheckedContentTrackerPath, getLastCheckedContentTrackerPath
} = require('./utils/paths');
const { 
	provisionDatabase, openDatabase, finishPendingDatabaseWriteJob, submitDatabaseWriteJob, performDatabaseWriteJob, performDatabaseReadJob_ALL 
} = require('./utils/database');
const { 
	initializeHttpServer, restartHttpServer, getHttpServerWrapper 
} = require('./utils/httpserver');
const { 
	indexer_doIndexUpdate 
} = require('./utils/indexer-communications');
const { 
	cloudflare_purgeAllWatchPages, cloudflare_purgeNodePage 
} = require('./utils/cloudflare-communications');

loadConfig();

const baseRoutes = require('./routes/base');
const accountRoutes = require('./routes/account');
const commentsRoutes = require('./routes/comments');
const watchRoutes = require('./routes/watch');
const watchEmbedRoutes = require('./routes/watch-embed');
const nodeRoutes = require('./routes/node');
const statusRoutes = require('./routes/status');
const reportsArchiveCommentsRoutes = require('./routes/reports-archive-comments');
const reportsArchiveVideosRoutes = require('./routes/reports-archive-videos');
const reportsCommentsRoutes = require('./routes/reports-comments');
const reportsVideosRoutes = require('./routes/reports-videos');
const reportsRoutes = require('./routes/reports');
const monetizationRoutes = require('./routes/monetization');
const linksRoutes = require('./routes/links');
const settingsRoutes = require('./routes/settings');
const streamsRoutes = require('./routes/streams');
const videosRoutes = require('./routes/videos');
const externalResourcesRoutes = require('./routes/external-resources');
const externalVideosRoutes = require('./routes/external-videos');

if (cluster.isMaster) {
	process.on('uncaughtException', (error) => {
		logDebugMessageToConsole(null, error, new Error().stack);
	});

	process.on('unhandledRejection', (reason, promise) => {
		logDebugMessageToConsole(null, reason, new Error().stack);
	});

	logDebugMessageToConsole('starting MoarTube Node', null, null);

	logDebugMessageToConsole('configured MoarTube Node to use data directory path: ' + getDataDirectoryPath(), null, null);

	provisionDatabase()
		.then(async () => {
			const mutex = new Mutex();

			let liveStreamWatchingCountsTracker = {};

			const nodeSettings = getNodeSettings();

			if (nodeSettings.nodeId === '') {
				nodeSettings.nodeId = await generateVideoId();

				setNodeSettings(nodeSettings);
			}

			const jwtSecret = crypto.randomBytes(32).toString('hex');

			const numCPUs = require('os').cpus().length;

			for (let i = 0; i < numCPUs; i++) {
				const worker = cluster.fork();

				attachWorkerListeners(worker);
			}

			function attachWorkerListeners(worker) {
				worker.on('message', async (msg) => {
					if (msg.cmd === 'get_jwt_secret') {
						worker.send({ cmd: 'get_jwt_secret_response', jwtSecret: jwtSecret });
					}
					else if (msg.cmd === 'update_node_name') {
						const nodeName = msg.nodeName;

						Object.values(cluster.workers).forEach((worker) => {
							worker.send({ cmd: 'update_node_name_response', nodeName: nodeName });
						});
					}
					else if (msg.cmd === 'websocket_broadcast') {
						const message = msg.message;

						Object.values(cluster.workers).forEach((worker) => {
							worker.send({ cmd: 'websocket_broadcast_response', message: message });
						});
					}
					else if (msg.cmd === 'websocket_broadcast_chat') {
						const message = msg.message;

						Object.values(cluster.workers).forEach((worker) => {
							worker.send({ cmd: 'websocket_broadcast_chat_response', message: message });
						});
					}
					else if (msg.cmd === 'database_write_job') {
						const release = await mutex.acquire();

						const query = msg.query;
						const parameters = msg.parameters;
						const databaseWriteJobId = msg.databaseWriteJobId;

						performDatabaseWriteJob(query, parameters)
							.then(() => {
								worker.send({ cmd: 'database_write_job_result', databaseWriteJobId: databaseWriteJobId });
							})
							.catch((error) => {
								worker.send({ cmd: 'database_write_job_result', databaseWriteJobId: databaseWriteJobId, error: error });
							})
							.finally(() => {
								release();
							});
					}
					else if (msg.cmd === 'live_stream_worker_stats_response') {
						const workerId = msg.workerId;
						const liveStreamWatchingCounts = msg.liveStreamWatchingCounts;

						liveStreamWatchingCountsTracker[workerId] = liveStreamWatchingCounts;
					}
					else if (msg.cmd === 'restart_server') {
						Object.values(cluster.workers).forEach((worker) => {
							worker.send({ cmd: 'restart_server_response' });
						});
					}
					else if (msg.cmd === 'restart_database') {
						const databaseDialect = msg.databaseDialect;

						logDebugMessageToConsole('MoarTube Node changing database configuration to dialect: ' + databaseDialect, null, null);

						await openDatabase();

						Object.values(cluster.workers).forEach((worker) => {
							worker.send({ cmd: 'restart_database_response' });
						});
					}
				});
			}

			cluster.on('exit', (worker, code, signal) => {
				logDebugMessageToConsole('MoarTube Node worker exited with id <' + worker.id + '> code <' + code + '> signal <' + signal + '>', null, null);

				delete liveStreamWatchingCountsTracker[worker.id];

				const newWorker = cluster.fork();

				attachWorkerListeners(newWorker);
			});

			setInterval(async function () {
				try {
					const videos = await performDatabaseReadJob_ALL('SELECT * FROM videos WHERE is_indexed = ? AND is_index_outdated = ?', [true, true]);

					if (videos.length > 0) {
						await performNodeIdentification();

						const nodeSettings = getNodeSettings();
						const nodeIdentification = getNodeIdentification();

						const moarTubeTokenProof = nodeIdentification.moarTubeTokenProof;

						for (const video of videos) {
							const videoId = video.video_id;
							const title = video.title;
							const tags = video.tags;
							const views = video.views;
							const isStreaming = video.is_streaming ? true : false;
							const lengthSeconds = video.length_seconds;

							const nodeIconPngBase64 = getNodeIconPngBase64();
							const nodeAvatarPngBase64 = getNodeAvatarPngBase64();

							const videoPreviewJpgBase64 = await getVideoPreviewJpgBase64(nodeSettings, videoId);

							const data = {
								videoId: videoId,
								title: title,
								tags: tags,
								views: views,
								isStreaming: isStreaming,
								lengthSeconds: lengthSeconds,
								nodeIconPngBase64: nodeIconPngBase64,
								nodeAvatarPngBase64: nodeAvatarPngBase64,
								videoPreviewJpgBase64: videoPreviewJpgBase64,
								moarTubeTokenProof: moarTubeTokenProof
							};

							try {
								const indexerResponseData = await indexer_doIndexUpdate(data);

								if (indexerResponseData.isError) {
									throw new Error(indexerResponseData.message);
								}
								else {
									await submitDatabaseWriteJob('UPDATE videos SET is_index_outdated = ? WHERE video_id = ?', [false, videoId]);

									logDebugMessageToConsole('updated video id with MoarTube Index successfully: ' + videoId, null, null);
								}
							}
							catch (error) {
								if (error.isAxiosError && error.response != null && error.response.status === 413) {
									const kilobytes = Math.ceil(error.request._contentLength / 1024);

									throw new Error(`your request size (<b>${kilobytes}kb</b>) exceeds the maximum allowed size (<b>1mb</b>)<br>try using smaller node and video images`);
								}
								else {
									throw new Error('an error occurred while adding to the MoarTube Indexer');
								}
							}
						}
					}
				}
				catch (error) {
					logDebugMessageToConsole(null, error, null);
				}
			}, 3000);

			setInterval(function () {
				cloudflare_purgeAllWatchPages();
				cloudflare_purgeNodePage();
			}, 60000 * 10);

			// gets the live stream watching count for all workers
			setInterval(function () {
				Object.values(cluster.workers).forEach((worker) => {
					worker.send({ cmd: 'live_stream_worker_stats_request' });
				});
			}, 1000);

			// broadcasts the live stream watching count to all viewers
			setInterval(function () {
				Object.values(cluster.workers).forEach((worker) => {
					worker.send({ cmd: 'live_stream_worker_stats_update', liveStreamWatchingCountsTracker: liveStreamWatchingCountsTracker });
				});
			}, 1000);
		})
		.catch(error => {
			logDebugMessageToConsole(null, error, new Error().stack);
		});
}
else {
	startNode();

	async function startNode() {
		await openDatabase();

		const app = express();

		app.enable('trust proxy');

		app.use(expressSession({
			name: getExpressSessionName(),
			secret: getExpressSessionSecret(),
			resave: false,
			saveUninitialized: true
		}));

		app.use(cors());

		app.use(bodyParser.urlencoded({ extended: false }));
		app.use(bodyParser.json());

		app.engine('dot', engine.__express);

		app.set('views', getViewsDirectoryPath());
		app.set('view engine', 'dot');

		if (getIsDeveloperMode()) {
			app.use(expressSubdomain('testingexternalvideos', externalVideosRoutes));
		}
		else {
			app.use(expressSubdomain('externalvideos', externalVideosRoutes));
		}

		app.use('/', baseRoutes);
		app.use('/account', accountRoutes);
		app.use('/comments', commentsRoutes);
		app.use('/watch', watchRoutes);
		app.use('/watch/embed', watchEmbedRoutes);
		app.use('/node', nodeRoutes);
		app.use('/status', statusRoutes);
		app.use('/reports/archive/comments', reportsArchiveCommentsRoutes);
		app.use('/reports/archive/videos', reportsArchiveVideosRoutes);
		app.use('/reports/comments', reportsCommentsRoutes);
		app.use('/reports/videos', reportsVideosRoutes);
		app.use('/reports', reportsRoutes);
		app.use('/monetization', monetizationRoutes);
		app.use('/links', linksRoutes);
		app.use('/settings', settingsRoutes);
		app.use('/streams', streamsRoutes);
		app.use('/videos', videosRoutes);
		app.use('/external/videos', externalVideosRoutes);
		app.use('/external/resources', externalResourcesRoutes);

		await initializeHttpServer(app);

		process.on('message', async (msg) => {
			if (msg.cmd === 'get_jwt_secret_response') {
				const jwtSecret = msg.jwtSecret;

				setJwtSecret(jwtSecret);
			}
			else if (msg.cmd === 'websocket_broadcast_response') {
				const message = msg.message;

				getHttpServerWrapper()?.websocketServer?.clients?.forEach(function each(client) {
					if (client.readyState === webSocket.OPEN) {
						client.send(JSON.stringify(message));
					}
				});
			}
			else if (msg.cmd === 'websocket_broadcast_chat_response') {
				const message = msg.message;

				getHttpServerWrapper()?.websocketServer?.clients?.forEach(function each(client) {
					if (client.readyState === webSocket.OPEN) {
						if (client.socketType === 'node_peer' && (client.videoId === message.videoId || message.videoId === 'all')) {
							client.send(JSON.stringify(message));
						}
					}
				});
			}
			else if (msg.cmd === 'database_write_job_result') {
				const databaseWriteJobId = msg.databaseWriteJobId;
				const error = msg.error;

				finishPendingDatabaseWriteJob(databaseWriteJobId, error);
			}
			else if (msg.cmd === 'live_stream_worker_stats_request') {
				const liveStreamWatchingCounts = {};

				getHttpServerWrapper()?.websocketServer?.clients?.forEach(function each(client) {
					if (client.readyState === webSocket.OPEN) {
						if (client.socketType === 'node_peer') {
							const videoId = client.videoId;

							if (!liveStreamWatchingCounts.hasOwnProperty(videoId)) {
								liveStreamWatchingCounts[videoId] = 0;
							}

							liveStreamWatchingCounts[videoId]++;
						}
					}
				});

				process.send({ cmd: 'live_stream_worker_stats_response', workerId: cluster.worker.id, liveStreamWatchingCounts: liveStreamWatchingCounts });
			}
			else if (msg.cmd === 'live_stream_worker_stats_update') {
				const liveStreamWatchingCountsTracker = msg.liveStreamWatchingCountsTracker;

				const liveStreamWatchingCounts = {};

				for (const worker in liveStreamWatchingCountsTracker) {
					for (const videoId in liveStreamWatchingCountsTracker[worker]) {
						if (liveStreamWatchingCounts.hasOwnProperty(videoId)) {
							liveStreamWatchingCounts[videoId] += liveStreamWatchingCountsTracker[worker][videoId];
						}
						else {
							liveStreamWatchingCounts[videoId] = liveStreamWatchingCountsTracker[worker][videoId];
						}
					}
				}

				getHttpServerWrapper()?.websocketServer?.clients?.forEach(function each(client) {
					if (client.readyState === webSocket.OPEN) {
						if (client.socketType === 'node_peer') {
							const videoId = client.videoId;

							if (liveStreamWatchingCounts.hasOwnProperty(videoId)) {
								client.send(JSON.stringify({ eventName: 'live_stream_stats', watchingCount: liveStreamWatchingCounts[videoId] }));
							}
						}
					}
				});
			}
			else if (msg.cmd === 'restart_server_response') {
				restartHttpServer();
			}
			else if (msg.cmd === 'restart_database_response') {
				openDatabase();
			}
		});

		process.send({ cmd: 'get_jwt_secret' });
	}
}

function discoverDataDirectoryPath() {
	let dataDirectoryPath;

	if (getIsDockerEnvironment()) {
		dataDirectoryPath = '/data';
	}
	else {
		const dataDirectory = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share');

		dataDirectoryPath = path.join(dataDirectory, 'moartube-node');
	}

	return dataDirectoryPath;
}

function loadConfig() {
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

	setIsDockerEnvironment(process.env.IS_DOCKER_ENVIRONMENT === 'true');

	const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

	setIsDeveloperMode(config.isDeveloperMode);

	setMoarTubeIndexerHttpProtocol(config.indexerConfig.httpProtocol);
	setMoarTubeIndexerIp(config.indexerConfig.host);
	setMoarTubeIndexerPort(config.indexerConfig.port);

	setMoarTubeAliaserHttpProtocol(config.aliaserConfig.httpProtocol);
	setMoarTubeAliaserIp(config.aliaserConfig.host);
	setMoarTubeAliaserPort(config.aliaserConfig.port);

	setPublicDirectoryPath(path.join(__dirname, 'public'));
	setViewsDirectoryPath(path.join(getPublicDirectoryPath(), 'views'));

	if (getIsDockerEnvironment()) {
		setDataDirectoryPath(discoverDataDirectoryPath());
	}
	else {
		if (getIsDeveloperMode()) {
			setDataDirectoryPath(path.join(__dirname, 'data'));
		}
		else {
			setDataDirectoryPath(discoverDataDirectoryPath());
		}
	}

	setNodeSettingsPath(path.join(getDataDirectoryPath(), '_node_settings.json'));
	setLastCheckedContentTrackerPath(path.join(getDataDirectoryPath(), '_last_checked_content_tracker.json'));

	setImagesDirectoryPath(path.join(getDataDirectoryPath(), 'images'));
	setVideosDirectoryPath(path.join(getDataDirectoryPath(), 'media/videos'));
	setDatabaseDirectoryPath(path.join(getDataDirectoryPath(), 'db'));
	setCertificatesDirectoryPath(path.join(getDataDirectoryPath(), 'certificates'));

	setDatabaseFilePath(path.join(getDatabaseDirectoryPath(), 'node_db.sqlite'));

	fs.mkdirSync(getImagesDirectoryPath(), { recursive: true });
	fs.mkdirSync(getVideosDirectoryPath(), { recursive: true });
	fs.mkdirSync(getDatabaseDirectoryPath(), { recursive: true });
	fs.mkdirSync(getCertificatesDirectoryPath(), { recursive: true });

	if (!fs.existsSync(getNodeSettingsPath())) {
		const nodeSettings = {
			"nodeListeningPort": 80,
			"isSecure": false,
			"publicNodeProtocol": "",
			"publicNodeAddress": "",
			"publicNodePort": "",
			"nodeName": "moartube node",
			"nodeAbout": "just a MoarTube node",
			"nodeId": "",
			"username": "JDJhJDEwJHVrZUJsbmlvVzNjWEhGUGU0NjJrS09lSVVHc1VxeTJXVlJQbTNoL3hEM2VWTFRad0FiZVZL",  // admin
			"password": "JDJhJDEwJHVkYUxudzNkLjRiYkExcVMwMnRNL09la3Q5Z3ZMQVpEa1JWMEVxd3RjU09wVXNTYXpTbXRX",  // admin
			"expressSessionName": crypto.randomBytes(64).toString('hex'),
			"expressSessionSecret": crypto.randomBytes(64).toString('hex'),
			"isCloudflareCdnEnabled": false,
			"cloudflareEmailAddress": "",
			"cloudflareZoneId": "",
			"cloudflareGlobalApiKey": "",
			"isCloudflareTurnstileEnabled": false,
			"cloudflareTurnstileSiteKey": "",
			"cloudflareTurnstileSecretKey": "",
			"isCommentsEnabled": true,
			"isLikesEnabled": true,
			"isDislikesEnabled": true,
			"isReportsEnabled": true,
			"isLiveChatEnabled": true,
			"databaseConfig": {
				"databaseDialect": "sqlite"
			},
			"storageConfig": {
				"storageMode": "filesystem"
			}
		};

		setNodeSettings(nodeSettings);
	}

	if (!fs.existsSync(getLastCheckedContentTrackerPath())) {
		const lastCheckedContentTracker = {
			"lastCheckedCommentsTimestamp": 0,
			"lastCheckedVideoReportsTimestamp": 0,
			"lastCheckedCommentReportsTimestamp": 0,
		};

		setLastCheckedContentTracker(lastCheckedContentTracker);
	}

	const nodeSettings = getNodeSettings();

	setExpressSessionName(nodeSettings.expressSessionName);
	setExpressSessionSecret(nodeSettings.expressSessionSecret);
}