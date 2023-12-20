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

const { 
	logDebugMessageToConsole, setPublicDirectoryPath, setPagesDirectoryPath, getPublicDirectoryPath, getNodeSettings, setNodeSettings, 
	getPublicDirectoryPath, getImagesDirectoryPath, getVideosDirectoryPath, getDatabaseDirectoryPath, getNodeSettingsPath, getIsDockerEnvironment, 
	getDataDirectoryPath, getCertificatesDirectoryPath, setIsDockerEnvironment,	setDataDirectoryPath, setNodeSettingsPath, setImagesDirectoryPath, 
	setVideosDirectoryPath, setDatabaseDirectoryPath, setCertificatesDirectoryPath, setIsDeveloperMode, setMoarTubeIndexerHttpProtocol, 
	setMoarTubeIndexerIp, setMoarTubeIndexerPort, setMoarTubeAliaserHttpProtocol, setMoarTubeAliaserIp, setMoarTubeAliaserPort, 
	setMoarTubeNodeHttpPort, setExpressSessionname,	setExpressSessionSecret
} = require('./utils/helpers');

const homeRoutes = require('./routes/home');
const accountRoutes = require('./routes/account');
const reportsRoutes = require('./routes/reports');
const reportsVideosRoutes = require('./routes/reports-videos');
const reportsCommentsRoutes = require('./routes/reports-comments');
const reportsArchiveRoutes = require('./routes/reports-archive-videos');
const settingsRoutes = require('./routes/settings');
const videosRoutes = require('./routes/videos');



loadConfig();

if(cluster.isMaster) {
	logDebugMessageToConsole('starting node', null, null, true);

	provisionSqliteDatabase(path.join(DATABASE_DIRECTORY_PATH, 'node_db.sqlite'))
	.then(async (database) => {
		await performDatabaseMaintenance();
		
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
					
					const databaseWriteJob = {
						query: query,
						parameters: parameters
					};
					
					try {
						await performDatabaseWriteJob(databaseWriteJob);
						
						worker.send({ cmd: 'database_write_job_result', databaseWriteJobId: databaseWriteJobId, isError: false });
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
		
		function performDatabaseWriteJob(databaseWriteJob) {
			return new Promise(function(resolve, reject) {
				const query = databaseWriteJob.query;
				const parameters = databaseWriteJob.parameters;
				
				database.run(query, parameters, function(error) {
					if(error) {
						logDebugMessageToConsole(null, error, new Error().stack, true);
						
						reject();
					}
					else {
						resolve();
					}
				});
			});
		}
		
		// if any node data related to indexing is updated, then update the indexer with that data
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

									const videoPreviewImageBase64 = fs.readFileSync(path.join(VIDEOS_DIRECTORY_PATH, videoId + '/images/preview.jpg')).toString('base64');
									
									indexer_doIndexUpdate(nodeIdentifier, nodeIdentifierProof, videoId, title, tags, views, isStreaming, lengthSeconds, nodeIconBase64, videoPreviewImageBase64)
									.then(async indexerResponseData => {
										if(indexerResponseData.isError) {
											logDebugMessageToConsole(indexerResponseData.message, null, new Error().stack, true);
										}
										else {
											const release = await mutex.acquire();
											
											const type = 'update';
											const query = 'UPDATE videos SET is_index_outdated = 0 WHERE video_id = ?';
											const parameters = [videoId];
											
											const databaseWriteJob = {
												type: type, // insert, update, delete
												query: query, // sql query
												parameters: parameters // sql query parameters (if insert or update, otherwise empty array)
											};
											
											try {
												await performDatabaseWriteJob(databaseWriteJob);
												
												logDebugMessageToConsole('updated video id with index successfully: ' + videoId, null, null, true);
											}
											catch(error) {
												logDebugMessageToConsole(null, error, new Error().stack, true);
											}
											finally {
												release();
											}
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
		
		function performDatabaseMaintenance() {
			return new Promise(function(resolve, reject) {
				database.run('DELETE FROM liveChatMessages', function(error) {
					if(error) {
						reject();
					}
					else {
						resolve();
					}
				});
			});
		}
	})
	.catch(error => {
		logDebugMessageToConsole(null, error, new Error().stack, true);
	});
	
	
	
	function provisionSqliteDatabase(databasePath) {
		return new Promise(function(resolve, reject) {
			logDebugMessageToConsole('provisioning SQLite3 database', null, null, true);
			
			const database = new sqlite3.Database(databasePath, function(error) {
				if (error) {
					logDebugMessageToConsole(null, error, new Error().stack, true);
					
					reject();
				}
				else {
					database.run('PRAGMA journal_mode=WAL', function (error) {
						if (error) {
							logDebugMessageToConsole(null, error, new Error().stack, true);
							
							reject();
						} else {
							database.run('CREATE TABLE IF NOT EXISTS videos(id INTEGER PRIMARY KEY, video_id TEXT, source_file_extension TEXT, title TEXT, description TEXT, tags TEXT, length_seconds INTEGER, length_timestamp INTEGER, views INTEGER, comments INTEGER, likes INTEGER, dislikes INTEGER, bandwidth INTEGER, is_importing INTEGER, is_imported INTEGER, is_publishing INTEGER, is_published INTEGER, is_streaming INTEGER, is_streamed INTEGER, is_stream_recorded_remotely INTEGER, is_stream_recorded_locally INTEGER, is_live INTEGER, is_indexed INTEGER, is_index_outdated INTEGER, is_error INTEGER, is_finalized INTEGER, meta TEXT, creation_timestamp INTEGER)', function (error) {
								if (error) {
									logDebugMessageToConsole(null, error, new Error().stack, true);
									
									reject();
								} else {
									database.run('CREATE TABLE IF NOT EXISTS videoIdProofs(id INTEGER PRIMARY KEY, video_id TEXT, video_id_proof TEXT)', function (error) {
										if (error) {
											logDebugMessageToConsole(null, error, new Error().stack, true);
											
											reject();
										} else {
											database.run('CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY, video_id TEXT, comment_plain_text_sanitized TEXT, timestamp INTEGER)', function (error) {
												if (error) {
													logDebugMessageToConsole(null, error, new Error().stack, true);
													
													reject();
												} else {
													database.run('CREATE TABLE IF NOT EXISTS videoReports(report_id INTEGER PRIMARY KEY, timestamp INTEGER, video_timestamp INTEGER, video_id TEXT, email TEXT, type TEXT, message TEXT)', function (error) {
														if (error) {
															logDebugMessageToConsole(null, error, new Error().stack, true);
															
															reject();
														} else {
															database.run('CREATE TABLE IF NOT EXISTS commentReports(report_id INTEGER PRIMARY KEY, timestamp INTEGER, comment_timestamp INTEGER, video_id TEXT, comment_id TEXT, email TEXT, type TEXT, message TEXT)', function (error) {
																if (error) {
																	logDebugMessageToConsole(null, error, new Error().stack, true);
																	
																	reject();
																} else {
																	database.run('CREATE TABLE IF NOT EXISTS videoReportsArchive(archive_id INTEGER PRIMARY KEY, report_id INTEGER, timestamp INTEGER, video_timestamp INTEGER, video_id TEXT, email TEXT, type TEXT, message TEXT)', function (error) {
																		if (error) {
																			logDebugMessageToConsole(null, error, new Error().stack, true);
																			
																			reject();
																		} else {
																			database.run('CREATE TABLE IF NOT EXISTS commentReportsArchive(archive_id INTEGER PRIMARY KEY, report_id INTEGER, timestamp INTEGER, comment_timestamp INTEGER, video_id TEXT, comment_id TEXT, email TEXT, type TEXT, message TEXT)', function (error) {
																				if (error) {
																					logDebugMessageToConsole(null, error, new Error().stack, true);
																					
																					reject();
																				} else {
																					database.run('CREATE TABLE IF NOT EXISTS liveChatMessages(chat_message_id INTEGER PRIMARY KEY, video_id TEXT, username TEXT, username_color_hex_code TEXT, chat_message TEXT, timestamp INTEGER)', function (error) {
																						if (error) {
																							logDebugMessageToConsole(null, error, new Error().stack, true);
																							
																							reject();
																						} else {
																							database.run('UPDATE videos SET is_streamed = ? WHERE is_streaming = ?', [1, 1], function (error) {
																								if (error) {
																									logDebugMessageToConsole(null, error, new Error().stack, true);
																									
																									reject();
																								} else {
																									database.run('UPDATE videos SET is_importing = ?, is_publishing = ?, is_streaming = ?', [0, 0, 0], function (error) {
																										if (error) {
																											logDebugMessageToConsole(null, error, new Error().stack, true);
																											
																											reject();
																										} else {
																											maintainFilesystem(database)
																											.then(function() {
																												setInterval(function() {
																													maintainFilesystem(database)
																													.then(function() {
																														// do nothing
																													})
																													.catch(function(error) {
																														logDebugMessageToConsole(null, error, new Error().stack, true);
																													});
																												}, 5000);
																												
																												resolve(database);
																											})
																											.catch(function(error) {
																												logDebugMessageToConsole(null, error, new Error().stack, true);
																												
																												reject();
																											});
																										}
																									});
																								}
																							});
																						}
																					});
																				}
																			});
																		}
																	});
																}
															});
														}
													});
												}
											});
										}
									});
								}
							});
						}
					});
				}
			});
		});
	}

	function maintainFilesystem(database) {
		return new Promise(async function(resolve, reject) {
			await updateManifestFiles(database);
			await removeUnusedMasterManifests(database);
			
			resolve();
		});
	}
	
	function updateManifestFiles(database) {
		return new Promise(async function(resolve, reject) {
			database.all('SELECT video_id, is_stream_recorded_remotely FROM videos WHERE is_streamed = 1', function(error, rows) {
				if(error) {
					logDebugMessageToConsole(null, error, new Error().stack, true);
					
					reject();
				}
				else {
					for(var i = 0; i < rows.length; i++) {
						const row = rows[i];
						
						if(row.is_stream_recorded_remotely) {
							const videoId = row.video_id;
							
							const m3u8Directory = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/m3u8');
							
							const manifest2160pFilePath = path.join(m3u8Directory, '/manifest-2160p.m3u8');
							const manifest1440pFilePath = path.join(m3u8Directory, '/manifest-1440p.m3u8');
							const manifest1080pFilePath = path.join(m3u8Directory, '/manifest-1080p.m3u8');
							const manifest720pFilePath = path.join(m3u8Directory, '/manifest-720p.m3u8');
							const manifest480pFilePath = path.join(m3u8Directory, '/manifest-480p.m3u8');
							const manifest360pFilePath = path.join(m3u8Directory, '/manifest-360p.m3u8');
							const manifest240pFilePath = path.join(m3u8Directory, '/manifest-240p.m3u8');
							
							const manifestFilePaths = [
								manifest2160pFilePath,
								manifest1440pFilePath,
								manifest1080pFilePath,
								manifest720pFilePath,
								manifest480pFilePath,
								manifest360pFilePath,
								manifest240pFilePath
							];
							
							const HLS_END_LIST_TAG = '#EXT-X-ENDLIST';
							
							for(var j = 0; j < manifestFilePaths.length; j++) {
								const manifestFilePath = manifestFilePaths[j];
								if (fs.existsSync(manifestFilePath)) {
									const manifestFileText = fs.readFileSync(manifestFilePath, 'utf8')
									if(!manifestFileText.includes(HLS_END_LIST_TAG)) {
										const manifestFileTextModified = manifestFileText.trim() + '\n' + HLS_END_LIST_TAG + '\n';
										fs.writeFileSync(manifestFilePath, manifestFileTextModified);
									}
								}
							}
						}
					}
					
					resolve();
				}
			});
		});
	}
	
	function removeUnusedMasterManifests(database) {
		return new Promise(async function(resolve, reject) {
			database.all('SELECT video_id FROM videos', function(error, rows) {
				if(error) {
					logDebugMessageToConsole(null, error, new Error().stack, true);
					
					reject();
				}
				else {
					for(var i = 0; i < rows.length; i++) {
						const row = rows[i];
						
						const videoId = row.video_id;
						
						const m3u8Directory = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/m3u8');
						
						if (fs.existsSync(m3u8Directory)) {
							fs.readdir(m3u8Directory, (error, files) => {
								if(error) {
									logDebugMessageToConsole(null, error, new Error().stack, true);
								}
								else {
									if(files.length === 1 && files[0] === 'manifest-master.m3u8') {
										const filePath = path.join(m3u8Directory, files[0]);
										
										fs.unlinkSync(filePath);
									}
								}
							});
						}
					}
					
					resolve();
				}
			});
		});
	}
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
		
		const database = await getDatabase();

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
		
		httpServerWrapper = await initializeHttpServer();
		
		function initializeHttpServer() {
			return new Promise(function(resolve, reject) {
				const nodeSettings = getNodeSettings();
				
				if(nodeSettings.isSecure) {
					if (fs.existsSync(CERTIFICATES_DIRECTORY_PATH)) {
						var key = '';
						var cert = '';
						var ca = [];
						
						fs.readdirSync(CERTIFICATES_DIRECTORY_PATH).forEach(fileName => {
							if(fileName === 'private_key.pem') {
								key = fs.readFileSync(path.join(CERTIFICATES_DIRECTORY_PATH, 'private_key.pem'), 'utf8');
							}
							else if(fileName === 'certificate.pem') {
								cert = fs.readFileSync(path.join(CERTIFICATES_DIRECTORY_PATH, 'certificate.pem'), 'utf8');
							}
							else {
								const caFile = fs.readFileSync(path.join(CERTIFICATES_DIRECTORY_PATH, fileName), 'utf8');
								
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
							const SSL_CREDENTIALS =	{
								key: key,
								cert: cert,
								ca: ca
							};

							logDebugMessageToConsole('MoarTube Node is entering secure HTTPS mode', null, null, true);
							
							httpServer = https.createServer(SSL_CREDENTIALS, app);
						}
					}
					else {
						reject('certificate directory not found for HTTPS server');
					}
				}
				else {
					logDebugMessageToConsole('MoarTube Node is entering non-secure HTTP mode', null, null, true);

					httpServer = http.createServer(app);
				}
				
				httpServer.requestTimeout = 0; // needed for long duration requests (streaming, large uploads)
				httpServer.keepAliveTimeout = 10000;
				
				httpServer.listen(MOARTUBE_NODE_HTTP_PORT, function() {
					logDebugMessageToConsole('MoarTube Node is listening on port ' + MOARTUBE_NODE_HTTP_PORT, null, null, true);
					
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
														if(publishVideoUploadingTracker.hasOwnProperty(videoId)) {
															publishVideoUploadingTracker[videoId].stopping = true;
														}
														
														websocketNodeBroadcast(parsedMessage);
													}
													else if(type === 'publishing_stopped') {
														if(publishVideoUploadingTracker.hasOwnProperty(videoId)) {
															const uploadRequests = publishVideoUploadingTracker[videoId].uploadRequests;
															
															uploadRequests.forEach(function(uploadRequest) {
																uploadRequest.destroy();
															});
															
															delete publishVideoUploadingTracker[videoId];
														}
														
														websocketNodeBroadcast(parsedMessage);
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
												
												database.get('SELECT * FROM videos WHERE video_id = ?', videoId, function(error, videoData) {
													if(error) {
														logDebugMessageToConsole(null, error, new Error().stack, true);
														
														res.send({isError: true, message: 'error retrieving video data'});
													}
													else {
														if(videoData != null) {
															const meta = JSON.parse(videoData.meta);
															
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
													}
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
					
					const serverWrapper = {
						httpServer: httpServer,
						websocketServer: websocketServer
					};
					
					resolve(serverWrapper);
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

					httpServerWrapper = await initializeHttpServer();
				});
			});
		}
		
		app.use(function(req, res, next) {
			next();
		});

		app.use('/', homeRoutes);
		app.use('/account', accountRoutes);
		app.use('/reports', reportsRoutes);
		app.use('/reports/videos', reportsVideosRoutes);
		app.use('/reports/comments', reportsCommentsRoutes);
		app.use('/reports/archive', reportsArchiveRoutes);
		app.use('/settings', settingsRoutes)
		app.use('/videos', videosRoutes)
		
		
		
		
		
		
		
		
		
		
		
		
		
		
		// Import a video
		app.post('/videos/import', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then(async (isAuthenticated) => {
				if(isAuthenticated) {
					const title = req.body.title;
					const description = req.body.description;
					const tags = req.body.tags;
					
					if(!isTitleValid(title)) {
						res.send({isError: true, message: 'title is not valid'});
					}
					else if(!isDescriptionValid(description)) {
						res.send({isError: true, message: 'description is not valid'});
					}
					else if(!isTagsValid(tags)) {
						res.send({isError: true, message: 'tags are not valid'});
					}
					else {
						const videoId = await generateVideoId(database);
						const creationTimestamp = Date.now();
						
						const meta = JSON.stringify({});

						logDebugMessageToConsole('importing video with id <' + videoId + '>', null, null, true);
						
						const tagsSanitized = sanitizeTagsSpaces(tags);
						
						fs.mkdirSync(path.join(VIDEOS_DIRECTORY_PATH, videoId + '/images'), { recursive: true });
						fs.mkdirSync(path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive'), { recursive: true });
						fs.mkdirSync(path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive'), { recursive: true });
						
						const query = 'INSERT INTO videos(video_id, source_file_extension, title, description, tags, length_seconds, length_timestamp, views, comments, likes, dislikes, bandwidth, is_importing, is_imported, is_publishing, is_published, is_streaming, is_streamed, is_stream_recorded_remotely, is_stream_recorded_locally, is_live, is_indexed, is_index_outdated, is_error, is_finalized, meta, creation_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
						const parameters = [videoId, '', title, description, tags, 0, '', 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, meta, creationTimestamp];
						
						submitDatabaseWriteJob(query, parameters, function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								websocketNodeBroadcast({
									eventName: 'echo', 
									data: {
										eventName: 'video_data', 
										payload: {
											videoId: videoId, 
											thumbnail: '', 
											title: title, 
											description: description, 
											tags: tagsSanitized, 
											lengthSeconds: 0, 
											lengthTimestamp: '', 
											views: 0, 
											comments: 0, 
											likes: 0, 
											dislikes: 0, 
											bandwidth: 0, 
											isImporting: 1, 
											isImported: 0,
											isPublishing: 0,
											isPublished: 0,
											isLive: 0,
											isStreaming: 0,
											isStreamed: 0,
											isStreamRecordedRemotely: 0,
											isStreamRecordedLocally: 0,
											isIndexed: 0,
											isIndexOutdated: 0,
											isError: 0,
											isFinalized: 0,
											meta: meta,
											creationTimestamp: creationTimestamp
										}
									}
								});
								
								res.send({isError: false, videoId: videoId});
							}
						});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/videos/imported', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.body.videoId;
					
					if(isVideoIdValid(videoId)) {
						submitDatabaseWriteJob('UPDATE videos SET is_importing = ?, is_imported = ? WHERE video_id = ?', [0, 1, videoId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: false});
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/videos/:videoId/importing/stop', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;
					
					if(isVideoIdValid(videoId)) {
						submitDatabaseWriteJob('UPDATE videos SET is_importing = 0 WHERE video_id = ?', [videoId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: false});
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/videos/publishing', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.body.videoId;
					
					if(isVideoIdValid(videoId)) {
						submitDatabaseWriteJob('UPDATE videos SET is_publishing = ? WHERE video_id = ?', [1, videoId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: false});
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/videos/published', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.body.videoId;
					
					if(isVideoIdValid(videoId)) {
						submitDatabaseWriteJob('UPDATE videos SET is_publishing = ?, is_published = ? WHERE video_id = ?', [0, 1, videoId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: false});
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/videos/:videoId/publishing/stop', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;
					
					if(isVideoIdValid(videoId)) {
						submitDatabaseWriteJob('UPDATE videos SET is_publishing = 0 WHERE video_id = ?', [videoId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: false});
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/videos/:videoId/upload', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;
					const format = req.query.format;
					const resolution = req.query.resolution;
					
					if(isVideoIdValid(videoId) && isFormatValid(format) && isResolutionValid(resolution)) {
						logDebugMessageToConsole('uploading video with id <' + videoId + '> format <' + format + '> resolution <' + resolution + '>', null, null, true);

						const totalFileSize = parseInt(req.headers['content-length']);
						
						if(totalFileSize > 0) {
							if(!publishVideoUploadingTracker.hasOwnProperty(videoId)) {
								publishVideoUploadingTracker[videoId] = {uploadRequests: [], stopping: false};
							}
							
							publishVideoUploadingTracker[videoId].uploadRequests.push(req);
							
							var lastPublishTimestamp = 0;
							var receivedFileSize = 0;
							req.on('data', function(chunk) {
								if(!publishVideoUploadingTracker[videoId].stopping) {
									
									receivedFileSize += chunk.length;
									
									const uploadProgress = Math.floor(((receivedFileSize / totalFileSize) * 100) / 2) + 50;
									
									// rate limit due to flooding
									const currentPublishTimestamp = Date.now();
									if((currentPublishTimestamp - lastPublishTimestamp > 1000) || uploadProgress === 100) {
										lastPublishTimestamp = currentPublishTimestamp;
										
										websocketNodeBroadcast({eventName: 'echo', data: {eventName: 'video_status', payload: { type: 'publishing', videoId: videoId, format: format, resolution: resolution, progress: uploadProgress }}});
									}
								}
							});
							
							multer(
							{
								fileFilter: function (req, file, cb) {
									const mimeType = file.mimetype;
									
									if(mimeType === 'application/vnd.apple.mpegurl' || mimeType === 'video/mp2t' || mimeType === 'video/mp4' || mimeType === 'video/webm' || mimeType === 'video/ogg') {
										cb(null, true);
									}
									else {
										cb(new Error('unsupported upload file type'));
									}
								},
								storage: multer.diskStorage({
									destination: function (req, file, cb) {
										var directoryPath = '';
										
										if(format === 'm3u8') {
											const fileName = file.originalname;
											const manifestFileName = 'manifest-' + resolution + '.m3u8';
											
											if(fileName === manifestFileName) {
												directoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/m3u8');
											}
											else if(isSegmentNameValid(fileName)) {
												directoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/m3u8/' + resolution);
											}
										}
										else if(format === 'mp4') {
											directoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/mp4/' + resolution);
										}
										else if(format === 'webm') {
											directoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/webm/' + resolution);
										}
										else if(format === 'ogv') {
											directoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/ogv/' + resolution);
										}
										
										if(directoryPath !== '') {
											logDebugMessageToConsole('storing video with id <' + videoId + '> format <' + format + '> resolution <' + resolution + '> to directory <' + directoryPath + '>', null, null, true);
											
											fs.mkdirSync(directoryPath, { recursive: true });
											
											fs.access(directoryPath, fs.F_OK, function(error) {
												if(error) {
													cb(new Error('directory creation error'));
												}
												else {
													cb(null, directoryPath);
												}
											});
										}
										else {
											cb(new Error('invalid directory path'));
										}
									},
									filename: function (req, file, cb) {
										cb(null, file.originalname);
									}
								})
							}).fields([{ name: 'video_files' }])
							(req, res, async function(error)
							{
								if(error) {
									logDebugMessageToConsole(null, error, new Error().stack, true);
									
									submitDatabaseWriteJob('UPDATE videos SET is_publishing = ?, is_error = ? WHERE video_id = ?', [0, 1, videoId], function(isError) {
										if(isError) {
											res.send({isError: true, message: 'error communicating with the MoarTube node'});
										}
										else {
											res.send({isError: true, message: 'video upload error'});
										}
									});
								}
								else {
									if(format === 'm3u8') {
										updateHlsVideoMasterManifestFile(videoId);
									}
									
									res.send({isError: false});
								}
							});
						}
						else {
							submitDatabaseWriteJob('UPDATE videos SET is_publishing = ?, is_error = ? WHERE video_id = ?', [0, 1, videoId], function(isError) {
								if(isError) {
									res.send({isError: true, message: 'error communicating with the MoarTube node'});
								}
								else {
									res.send({isError: true, message: 'invalid content-length'});
								}
							});
						}
					}
					else {
						submitDatabaseWriteJob('UPDATE videos SET is_publishing = ?, is_error = ? WHERE video_id = ?', [0, 1, videoId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: true, message: 'invalid parameters'});
							}
						});
					}
				}
				else {
					submitDatabaseWriteJob('UPDATE videos SET is_publishing = ?, is_error = ? WHERE video_id = ?', [0, 1, videoId], function(isError) {
						if(isError) {
							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						}
						else {
							logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);
							
							res.send({isError: true, message: 'you are not logged in'});
						}
					});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		
		app.post('/videos/:videoId/stream', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;
					const format = req.query.format;
					const resolution = req.query.resolution;
					
					if(isVideoIdValid(videoId) && isFormatValid(format) && isResolutionValid(resolution)) {
						multer(
						{
							fileFilter: function (req, file, cb) {
								const mimeType = file.mimetype;
								
								if(mimeType === 'application/vnd.apple.mpegurl' || mimeType === 'video/mp2t') {
									cb(null, true);
								}
								else {
									cb(new error('only application/vnd.apple.mpegurl and video/mp2t files are supported'));
								}
							},
							storage: multer.diskStorage({
								destination: function (req, file, cb) {
									var directoryPath = '';
									
									if(format === 'm3u8') {
										const fileName = file.originalname;
										const manifestFileName = 'manifest-' + resolution + '.m3u8';
										
										if(fileName === manifestFileName) {
											directoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/m3u8');
										}
										else if(isSegmentNameValid(fileName)) {
											directoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/m3u8/' + resolution);
										}
									}
									else if(format === 'mp4') {
										directoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/mp4/' + resolution);
									}
									else if(format === 'webm') {
										directoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/webm/' + resolution);
									}
									else if(format === 'ogv') {
										directoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/ogv/' + resolution);
									}
									
									if(directoryPath !== '') {
										logDebugMessageToConsole('storing stream with id <' + videoId + '> format <' + format + '> resolution <' + resolution + '> to directory <' + directoryPath + '>', null, null, true);
										
										fs.mkdirSync(directoryPath, { recursive: true });
										
										fs.access(directoryPath, fs.F_OK, function(error) {
											if(error) {
												cb(new Error('directory creation error'));
											}
											else {
												cb(null, directoryPath);
											}
										});
									}
									else {
										cb(new Error('invalid directory path'));
									}
								},
								filename: function (req, file, cb) {
									cb(null, file.originalname);
								}
							})
						}).fields([{ name: 'video_files' }])
						(req, res, async function(error)
						{
							if(error) {
								submitDatabaseWriteJob('UPDATE videos SET is_error = ? WHERE video_id = ?', [1, videoId], function(isError) {
									if(isError) {
										res.send({isError: true, message: 'error communicating with the MoarTube node'});
									}
									else {
										res.send({isError: true, message: 'video upload error'});
									}
								});
							}
							else {
								if(format === 'm3u8') {
									updateHlsVideoMasterManifestFile(videoId);
								}
								
								res.send({isError: false});
							}
						});
					}
					else {
						submitDatabaseWriteJob('UPDATE videos SET is_error = ? WHERE video_id = ?', [1, videoId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: true, message: 'invalid parameters'});
							}
						});
					}
				}
				else {
					submitDatabaseWriteJob('UPDATE videos SET is_error = ? WHERE video_id = ?', [1, videoId], function(isError) {
						if(isError) {
							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						}
						else {
							logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

							res.send({isError: true, message: 'you are not logged in'});
						}
					});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		
		app.post('/videos/error', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.body.videoId;
					
					if(isVideoIdValid(videoId)) {
						submitDatabaseWriteJob('UPDATE videos SET is_error = ? WHERE video_id = ?', [1, videoId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: false});
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/videos/ready', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.body.videoId;
					
					if(isVideoIdValid(videoId)) {
						submitDatabaseWriteJob('UPDATE videos SET is_ready = ? WHERE video_id = ?', [1, videoId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: false});
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/videos/:videoId/sourceFileExtension', async (req, res) => {
			
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;
					const sourceFileExtension = req.body.sourceFileExtension;
					
					if(isVideoIdValid(videoId) && isSourceFileExtensionValid(sourceFileExtension)) {
						submitDatabaseWriteJob('UPDATE videos SET source_file_extension = ? WHERE video_id = ?', [sourceFileExtension, videoId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: false});
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.get('/videos/:videoId/sourceFileExtension', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;
					
					if(isVideoIdValid(videoId)) {
						database.get('SELECT source_file_extension FROM videos WHERE video_id = ?', videoId, function(error, row) {
							if(error) {
								logDebugMessageToConsole(null, error, new Error().stack, true);

								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								if(row != null) {
									const sourceFileExtension = row.source_file_extension;
									
									res.send({isError: false, sourceFileExtension: sourceFileExtension});
								}
								else {
									res.send({isError: true, message: 'that video does not exist'});
								}
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/streams/start', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then(async (isAuthenticated) => {
				if(isAuthenticated) {
					const title = req.body.title;
					const description = req.body.description;
					const tags = req.body.tags;
					const rtmpPort = req.body.rtmpPort;
					const uuid = req.body.uuid;
					var isRecordingStreamRemotely = req.body.isRecordingStreamRemotely;
					var isRecordingStreamLocally = req.body.isRecordingStreamLocally;
					const networkAddress = req.body.networkAddress;

					if(!isTitleValid(title)) {
						res.send({isError: true, message: 'title is not valid'});
					}
					else if(!isDescriptionValid(description)) {
						res.send({isError: true, message: 'description is not valid'});
					}
					else if(!isTagsValid(tags)) {
						res.send({isError: true, message: 'tags are not valid'});
					}
					else if(!isPortValid(rtmpPort)) {
						res.send({isError: true, message: 'rtmp port not valid'});
					}
					else if(uuid !== 'moartube') {
						res.send({isError: true, message: 'uuid not valid'});
					}
					else if(!isBooleanValid(isRecordingStreamRemotely)) {
						res.send({isError: true, message: 'isRecordingStreamRemotely not valid'});
					}
					else if(!isBooleanValid(isRecordingStreamLocally)) {
						res.send({isError: true, message: 'isRecordingStreamLocally not valid'});
					}
					else if(!isNetworkAddressValid(networkAddress)) {
						res.send({isError: true, message: 'networkAddress not valid'});
					}
					else {
						const videoId = await generateVideoId(database);
						const creationTimestamp = Date.now();
						
						isRecordingStreamRemotely = isRecordingStreamRemotely ? 1 : 0;
						isRecordingStreamLocally = isRecordingStreamLocally ? 1 : 0;
						
						const meta = JSON.stringify({chatSettings: {isChatHistoryEnabled: true, chatHistoryLimit: 0}, rtmpPort: rtmpPort, uuid: uuid, networkAddress: networkAddress});
						
						const tagsSanitized = sanitizeTagsSpaces(tags);
						
						fs.mkdirSync(path.join(VIDEOS_DIRECTORY_PATH, videoId + '/images'), { recursive: true });
						fs.mkdirSync(path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive'), { recursive: true });
						fs.mkdirSync(path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive'), { recursive: true });
						
						const query = 'INSERT INTO videos(video_id, source_file_extension, title, description, tags, length_seconds, length_timestamp, views, comments, likes, dislikes, bandwidth, is_importing, is_imported, is_publishing, is_published, is_streaming, is_streamed, is_stream_recorded_remotely, is_stream_recorded_locally, is_live, is_indexed, is_index_outdated, is_error, is_finalized, meta, creation_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
						const parameters = [videoId, '', title, description, tags, 0, '', 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, isRecordingStreamRemotely, isRecordingStreamLocally, 1, 0, 0, 0, 0, meta, creationTimestamp];
						
						submitDatabaseWriteJob(query, parameters, function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								websocketNodeBroadcast({eventName: 'echo', data: {eventName: 'video_data', payload: { 
										videoId: videoId, 
										thumbnail: '', 
										title: title, 
										description: description, 
										tags: tagsSanitized, 
										lengthSeconds: 0, 
										lengthTimestamp: '', 
										views: 0, 
										comments: 0, 
										likes: 0, 
										dislikes: 0, 
										bandwidth: 0, 
										isImporting: 0, 
										isImported: 0,
										isPublishing: 0,
										isPublished: 0,
										isLive: 1,
										isStreaming: 1,
										isStreamed: 0,
										isStreamRecordedRemotely: isRecordingStreamRemotely,
										isStreamRecordedLocally: isRecordingStreamLocally,
										isIndexed: 0,
										isIndexOutdated: 0,
										isError: 0,
										isFinalized: 0,
										meta: meta,
										creationTimestamp: creationTimestamp
									}
								}});
								
								res.send({isError: false, videoId: videoId});
							}
						});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/streams/:videoId/stop', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;
					
					if(isVideoIdValid(videoId)) {
						submitDatabaseWriteJob('UPDATE videos SET is_streaming = 0, is_streamed = 1, is_index_outdated = CASE WHEN is_indexed = 1 THEN 1 ELSE is_index_outdated END WHERE video_id = ?', [videoId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								database.get('SELECT is_stream_recorded_remotely FROM videos WHERE video_id = ?', videoId, function(error, video) {
									if(error) {
										logDebugMessageToConsole(null, error, new Error().stack, true);
		
										res.send({isError: true, message: 'error communicating with the MoarTube node'});
									}
									else {
										if(video != null) {
											if(!video.is_stream_recorded_remotely) {
												const m3u8DirectoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/m3u8');
												
												deleteDirectoryRecursive(m3u8DirectoryPath);
											}
										}

										submitDatabaseWriteJob('DELETE FROM liveChatMessages WHERE video_id = ?', [videoId], function(isError) {
											if(isError) {
												
											}
											else {
												
											}
										});
										
										res.send({isError: false});
									}
								});
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});

		// Serve a video manifest file

		var manifestBandwidthCounter = 0;
		var manifestBandwidthIncrementTimer;
		app.get('/:videoId/adaptive/:format/manifests/:manifestName', (req, res) => {
			const videoId = req.params.videoId;
			const format = req.params.format;
			const manifestName = req.params.manifestName;
			
			if(isVideoIdValid(videoId) && isAdaptiveFormatValid(format) && isManifestNameValid(manifestName)) {
				const manifestPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/' + format + '/' + manifestName);
				
				if(fs.existsSync(manifestPath)) {
					fs.stat(manifestPath, function(error, stats) {
						if (error) {
							logDebugMessageToConsole(null, error, new Error().stack, true);
						} else {
							manifestBandwidthCounter += stats.size;
				
							clearTimeout(manifestBandwidthIncrementTimer);

							manifestBandwidthIncrementTimer = setTimeout(function() {
								const manifestBandwidthCounterTemp = manifestBandwidthCounter;
								
								manifestBandwidthCounter = 0;
								
								submitDatabaseWriteJob('UPDATE videos SET bandwidth = bandwidth + ? WHERE video_id = ?', [manifestBandwidthCounterTemp, videoId], function(isError) {
									if(isError) {
										// do nothing
									}
									else {
										// do nothing
									}
								});
							}, 100);
						}
					});
					
					res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
					
					const fileStream = fs.createReadStream(manifestPath);
					
					fileStream.pipe(res);
				}
				else {
					res.status(404).send('video not found');
				}
			}
			else {
				res.status(404).send('video not found');
			}
		});
		
		// Serve the video segments corresponding to the videoId

		var segmentBandwidthCounter = 0;
		var segmentBandwidthIncrementTimer;
		app.get('/:videoId/adaptive/:format/:resolution/segments/:segmentName', (req, res) => {
			const videoId = req.params.videoId;
			const format = req.params.format;
			const resolution = req.params.resolution;
			const segmentName = req.params.segmentName;
			
			if(isVideoIdValid(videoId) && isAdaptiveFormatValid(format) && isResolutionValid(resolution) && isSegmentNameValid(segmentName)) {
				const segmentPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/' + format + '/' + resolution + '/' + segmentName);
				
				if(fs.existsSync(segmentPath)) {
					fs.stat(segmentPath, function(error, stats) {
						if (error) {
							logDebugMessageToConsole(null, error, new Error().stack, true);
						} else {
							segmentBandwidthCounter += stats.size;
				
							clearTimeout(segmentBandwidthIncrementTimer);

							segmentBandwidthIncrementTimer = setTimeout(function() {
								const segmentBandwidthCounterTemp = segmentBandwidthCounter;
								
								segmentBandwidthCounter = 0;

								submitDatabaseWriteJob('UPDATE videos SET bandwidth = bandwidth + ? WHERE video_id = ?', [segmentBandwidthCounterTemp, videoId], function(isError) {
									if(isError) {
										// do nothing
									}
									else {
										// do nothing
									}
								});
							}, 100);
						}
					});
					
					res.setHeader('Content-Type', 'video/MP2T');
					
					const fileStream = fs.createReadStream(segmentPath);
					
					fileStream.pipe(res);
				}
				else {
					res.status(404).send('video not found');
				}
			}
			else {
				res.status(404).send('video not found');
			}
		});
		
		app.get('/streams/:videoId/adaptive/:format/:resolution/segments/nextExpectedSegmentIndex', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;
					const format = req.params.format;
					const resolution = req.params.resolution;
					
					if(isVideoIdValid(videoId) && isAdaptiveFormatValid(format) && isResolutionValid(resolution)) {
						var nextExpectedSegmentIndex = -1;
						
						const segmentsDirectoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/' + format + '/' + resolution);
						
						if (fs.existsSync(segmentsDirectoryPath) && fs.statSync(segmentsDirectoryPath).isDirectory()) {
							fs.readdirSync(segmentsDirectoryPath).forEach(segmentFileName => {
								const segmentFileNameArray = segmentFileName.split('-');
								const nextExpectedSegmentIndexTemp = Number(segmentFileNameArray[2].split('.')[0]);

								if(nextExpectedSegmentIndexTemp > nextExpectedSegmentIndex) {
									nextExpectedSegmentIndex = nextExpectedSegmentIndexTemp;
								}
							});
						}
						
						nextExpectedSegmentIndex++;
						
						res.send({isError: false, nextExpectedSegmentIndex: nextExpectedSegmentIndex});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/streams/:videoId/adaptive/:format/:resolution/segments/remove', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;
					const format = req.params.format;
					const resolution = req.params.resolution;
					const segmentName = req.body.segmentName;
					
					if(isVideoIdValid(videoId) && isAdaptiveFormatValid(format) && isResolutionValid(resolution) && isSegmentNameValid(segmentName)) {
						const segmentPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/' + format + '/' + resolution + '/' + segmentName);
						
						fs.unlinkSync(segmentPath);
						
						res.send({isError: false});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		var progressiveBandwidthCounter = 0;
		var progressiveBandwidthIncrementTimer;
		app.get('/:videoId/progressive/:format/:resolution', (req, res) => {
			const videoId = req.params.videoId;
			const format = req.params.format;
			const resolution = req.params.resolution;
			
			if(isVideoIdValid(videoId) && isProgressiveFormatValid(format) && isResolutionValid(resolution)) {
				const filePath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/' + format + '/' + resolution + '/' + resolution + '.' + format);
				
				if(fs.existsSync(filePath)) {
					const stat = fs.statSync(filePath);
					const fileSize = stat.size;
					const range = req.headers.range;
					
					if (range) {
						const parts = range.replace(/bytes=/, '').split('-');
						const start = parseInt(parts[0], 10);
						const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
						const chunkSize = (end - start) + 1;
						const file = fs.createReadStream(filePath, { start, end });
						
						progressiveBandwidthCounter += chunkSize;
				
						clearTimeout(progressiveBandwidthIncrementTimer);

						progressiveBandwidthIncrementTimer = setTimeout(function() {
							const progressiveBandwidthCounterTemp = progressiveBandwidthCounter;
								
							progressiveBandwidthCounter = 0;

							submitDatabaseWriteJob('UPDATE videos SET bandwidth = bandwidth + ? WHERE video_id = ?', [progressiveBandwidthCounterTemp, videoId], function(isError) {
								if(isError) {
									// do nothing
								}
								else {
									// do nothing
								}
							});
						}, 100);
						
						res.writeHead(206, {
							'Content-Range': `bytes ${start}-${end}/${fileSize}`,
							'Accept-Ranges': 'bytes',
							'Content-Length': chunkSize,
							'Content-Type': 'video/' + format
						});
						
						file.pipe(res);
					}
					else {
						res.writeHead(200, {
							'Content-Length': fileSize,
							'Content-Type': 'video/' + format
						});
						
						fs.createReadStream(filePath).pipe(res);
					}
				}
				else {
					res.status(404).send('video not found');
				}
			}
			else {
				res.status(404).send('video not found');
			}
		});
		
		app.get('/:videoId/progressive/:format/:resolution/download', (req, res) => {
			const videoId = req.params.videoId;
			const format = req.params.format;
			const resolution = req.params.resolution;
			
			if(isVideoIdValid(videoId) && isProgressiveFormatValid(format) && isResolutionValid(resolution)) {
				const filePath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/' + format + '/' + resolution + '/' + resolution + '.' + format);
				const fileName = videoId + '-' + resolution + '.' + format;
				
				if(fs.existsSync(filePath)) {
					res.download(filePath, fileName, (error) => {
						if (error) {
							res.status(404).send('video not found');
						}
					});
				}
				else {
					res.status(404).send('video not found');
				}
			}
			else {
				res.status(404).send('video not found');
			}
		});
		
		app.get('/videos/:videoId/publishes', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;
					
					if(isVideoIdValid(videoId)) {
						database.get('SELECT * FROM videos WHERE video_id = ?', videoId, function(error, row) {
							if(error) {
								logDebugMessageToConsole(null, error, new Error().stack, true);
								
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								if(row != null) {
									const publishes = [
										{ format: 'm3u8', resolution: '2160p', isPublished: false },
										{ format: 'm3u8', resolution: '1440p', isPublished: false },
										{ format: 'm3u8', resolution: '1080p', isPublished: false },
										{ format: 'm3u8', resolution: '720p', isPublished: false },
										{ format: 'm3u8', resolution: '480p', isPublished: false },
										{ format: 'm3u8', resolution: '360p', isPublished: false },
										{ format: 'm3u8', resolution: '240p', isPublished: false },
										
										{ format: 'mp4', resolution: '2160p', isPublished: false },
										{ format: 'mp4', resolution: '1440p', isPublished: false },
										{ format: 'mp4', resolution: '1080p', isPublished: false },
										{ format: 'mp4', resolution: '720p', isPublished: false },
										{ format: 'mp4', resolution: '480p', isPublished: false },
										{ format: 'mp4', resolution: '360p', isPublished: false },
										{ format: 'mp4', resolution: '240p', isPublished: false },
										
										{ format: 'webm', resolution: '2160p', isPublished: false },
										{ format: 'webm', resolution: '1440p', isPublished: false },
										{ format: 'webm', resolution: '1080p', isPublished: false },
										{ format: 'webm', resolution: '720p', isPublished: false },
										{ format: 'webm', resolution: '480p', isPublished: false },
										{ format: 'webm', resolution: '360p', isPublished: false },
										{ format: 'webm', resolution: '240p', isPublished: false },
										
										{ format: 'ogv', resolution: '2160p', isPublished: false },
										{ format: 'ogv', resolution: '1440p', isPublished: false },
										{ format: 'ogv', resolution: '1080p', isPublished: false },
										{ format: 'ogv', resolution: '720p', isPublished: false },
										{ format: 'ogv', resolution: '480p', isPublished: false },
										{ format: 'ogv', resolution: '360p', isPublished: false },
										{ format: 'ogv', resolution: '240p', isPublished: false },
									];
									
									if(row.is_published) {
										const videosDirectoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId);
										const m3u8DirectoryPath = path.join(videosDirectoryPath, 'adaptive/m3u8');
										const mp4DirectoryPath = path.join(videosDirectoryPath, 'progressive/mp4');
										const webmDirectoryPath = path.join(videosDirectoryPath, 'progressive/webm');
										const ogvDirectoryPath = path.join(videosDirectoryPath, 'progressive/ogv');
										
										if (fs.existsSync(m3u8DirectoryPath)) {
											fs.readdirSync(m3u8DirectoryPath).forEach(fileName => {
												const filePath = path.join(m3u8DirectoryPath, fileName);
												if (fs.lstatSync(filePath).isDirectory()) {
													modifyPublishMatrix('m3u8', fileName);
												}
											});
										}
										
										if (fs.existsSync(mp4DirectoryPath)) {
											fs.readdirSync(mp4DirectoryPath).forEach(fileName => {
												const filePath = path.join(mp4DirectoryPath, fileName);
												if (fs.lstatSync(filePath).isDirectory()) {
													modifyPublishMatrix('mp4', fileName);
												}
											});
										}
										
										if (fs.existsSync(webmDirectoryPath)) {
											fs.readdirSync(webmDirectoryPath).forEach(fileName => {
												const filePath = path.join(webmDirectoryPath, fileName);
												if (fs.lstatSync(filePath).isDirectory()) {
													modifyPublishMatrix('webm', fileName);
												}
											});
										}
										
										if (fs.existsSync(ogvDirectoryPath)) {
											fs.readdirSync(ogvDirectoryPath).forEach(fileName => {
												const filePath = path.join(ogvDirectoryPath, fileName);
												if (fs.lstatSync(filePath).isDirectory()) {
													modifyPublishMatrix('ogv', fileName);
												}
											});
										}
										
										function modifyPublishMatrix(format, resolution) {
											for(publish of publishes) {
												if(publish.format === format && publish.resolution === resolution) {
													publish.isPublished = true;
													break;
												}
											}
										}
									}
									
									res.send({isError: false, publishes: publishes});
								}
								else {
									res.send({isError: true, message: 'that video does not exist'});
								}
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/videos/:videoId/unpublish', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;
					const format = req.body.format;
					const resolution = req.body.resolution;
					
					if(isVideoIdValid(videoId) && isFormatValid(format) && isResolutionValid(resolution)) {
						logDebugMessageToConsole('unpublishing video with id <' + videoId + '> format <' + format + '> resolution <' + resolution + '>', null, null, true);
						
						var videoDirectoryPath = '';
						var manifestFilePath = '';
						
						if(format === 'm3u8') {
							manifestFilePath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/' + format + '/manifest-' + resolution + '.m3u8');
							videoDirectoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/' + format + '/' + resolution);
						}
						else if(format === 'mp4') {
							videoDirectoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/' + format + '/' + resolution);
						}
						else if(format === 'webm') {
							videoDirectoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/' + format + '/' + resolution);
						}
						else if(format === 'ogv') {
							videoDirectoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive/' + format + '/' + resolution);
						}
						
						if(fs.existsSync(videoDirectoryPath)) {
							deleteDirectoryRecursive(videoDirectoryPath);
						}
						
						if(fs.existsSync(manifestFilePath)) {
							fs.unlinkSync(manifestFilePath);
						}
						
						if(format === 'm3u8') {
							updateHlsVideoMasterManifestFile(videoId);
						}
						
						res.send({isError: false});
					}
					else {
						res.send({isError: true, message: 'incorrect parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.get('/videos/:videoId/information', (req, res) => {
			const videoId = req.params.videoId;
			
			if(isVideoIdValid(videoId)) {
				database.get('SELECT * FROM videos WHERE video_id = ?', videoId, function(error, row) {
					if(error) {
						logDebugMessageToConsole(null, error, new Error().stack, true);
						
						res.send({isError: true, message: 'error communicating with the MoarTube node'});
					}
					else {
						if(row != null) {
							const nodeSettings = getNodeSettings();
							
							const information = {
								videoId: row.video_id,
								title: row.title,
								description: row.description,
								tags: row.tags,
								views: row.views,
								isLive: row.is_live,
								isStreaming: row.is_streaming,
								isFinalized: row.is_finalized,
								timestamp: row.creation_timestamp,
								tags: row.tags,
								nodeName: nodeSettings.nodeName
							};
							
							res.send({isError: false, information: information});
						}
						else {
							res.send({isError: true, message: 'that video does not exist'});
						}
					}
				});
			}
			else {
				res.send({isError: true, message: 'invalid parameters'});
			}
		});
		
		// Saves information about a video (title, description, tags)
		app.post('/videos/:videoId/information', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					var videoId = req.params.videoId;
					var title = req.body.title;
					var description = req.body.description;
					var tags = req.body.tags;
					
					if(!isVideoIdValid(videoId)) {
						res.send({isError: true, message: 'video id is not valid'});
					}
					else if(!isTitleValid(title)) {
						res.send({isError: true, message: 'title is not valid'});
					}
					else if(!isDescriptionValid(description)) {
						res.send({isError: true, message: 'description is not valid'});
					}
					else if(!isTagsValid(tags)) {
						res.send({isError: true, message: 'tags are not valid'});
					}
					else {
						const tagsSanitized = sanitizeTagsSpaces(tags);
						
						submitDatabaseWriteJob('UPDATE videos SET title = ?, description = ?, tags = ?, is_index_outdated = CASE WHEN is_indexed = 1 THEN 1 ELSE is_index_outdated END WHERE video_id = ?', [title, description, tagsSanitized, videoId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: false, information: {title: title, tags: tags}});
							}
						});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/videos/:videoId/index/add', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;
					const captchaResponse = req.body.captchaResponse;
					const containsAdultContent = req.body.containsAdultContent;
					const termsOfServiceAgreed = req.body.termsOfServiceAgreed;

					if(isVideoIdValid(videoId) && isBooleanValid(containsAdultContent) && isBooleanValid(termsOfServiceAgreed)) {
						if(termsOfServiceAgreed) {
							const nodeSettings = getNodeSettings();
							
							if(nodeSettings.isNodePrivate) {
								res.send({isError: true, message: "MoarTube Indexer unavailable; node is private"});
							}
							else if(!nodeSettings.isNodeConfigured) {
								res.send({isError: true, message: "MoarTube Indexer unavailable; this node has not performed initial configuration"});
							}
							else {
								const nodeId = nodeSettings.nodeId;
								const nodeName = nodeSettings.nodeName;
								const nodeAbout = nodeSettings.nodeAbout;
								const publicNodeProtocol = nodeSettings.publicNodeProtocol;
								const publicNodeAddress = nodeSettings.publicNodeAddress;
								const publicNodePort = nodeSettings.publicNodePort;
								
								database.get('SELECT * FROM videos WHERE video_id = ?', videoId, function(error, video) {
									if(error) {
										logDebugMessageToConsole(null, error, new Error().stack, true);
										
										res.send({isError: true, message: 'error retrieving video data'});
									}
									else {
										if(video != null) {
											if(video.is_published || video.is_live) {
												performNodeIdentification(false)
												.then(() => {
													const nodeIdentification = getNodeIdentification();
													
													const nodeIdentifier = nodeIdentification.nodeIdentifier;
													const nodeIdentifierProof = nodeIdentification.nodeIdentifierProof;
													
													const title = video.title;
													const tags = video.tags;
													const views = video.views;
													const isLive = (video.is_live === 1);
													const isStreaming = (video.is_streaming === 1);
													const lengthSeconds = video.length_seconds;
													const creationTimestamp = video.creation_timestamp;

													var nodeIconBase64 = getNodeIconBase64();

													const videoPreviewImageBase64 = fs.readFileSync(path.join(VIDEOS_DIRECTORY_PATH, videoId + '/images/preview.jpg')).toString('base64');
													
													const data = {
														videoId: videoId,
														nodeId: nodeId,
														nodeIdentifier: nodeIdentifier,
														nodeIdentifierProof: nodeIdentifierProof,
														nodeName: nodeName,
														nodeAbout: nodeAbout,
														publicNodeProtocol: publicNodeProtocol,
														publicNodeAddress: publicNodeAddress,
														publicNodePort: publicNodePort,
														title: title,
														tags: tags,
														views: views,
														isLive: isLive,
														isStreaming: isStreaming,
														lengthSeconds: lengthSeconds,
														creationTimestamp: creationTimestamp,
														captchaResponse: captchaResponse,
														containsAdultContent: containsAdultContent,
														nodeIconBase64: nodeIconBase64,
														videoPreviewImageBase64: videoPreviewImageBase64
													};
													
													indexer_addVideoToIndex(data)
													.then(indexerResponseData => {
														if(indexerResponseData.isError) {
															res.send({isError: true, message: indexerResponseData.message});
														}
														else {
															submitDatabaseWriteJob('UPDATE videos SET is_indexed = 1 WHERE video_id = ?', [videoId], function(isError) {
																if(isError) {
																	res.send({isError: true, message: 'error communicating with the MoarTube node'});
																}
																else {
																	res.send({isError: false});
																}
															});
														}
													})
													.catch(error => {
														res.send('error communicating with the MoarTube indexer');
													});
												})
												.catch(error => {
													res.send({isError: true, message: 'an error occurred while attempting to index, please try again later'});
												});
											}
											else {
												res.send({isError: true, message: 'videos have to be published before they can be indexed'});
											}
										}
										else {
											res.send({isError: true, message: 'that video does not exist'});
										}
									}
								});
							}
						}
						else {
							res.send({isError: true, message: 'you must agree to the terms of service'});
						}
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/videos/:videoId/index/remove', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;

					if(isVideoIdValid(videoId)) {
						const nodeSettings = getNodeSettings();

						if(nodeSettings.isNodePrivate) {
							res.send({isError: true, message: "MoarTube Indexer unavailable; node is private"});
						}
						else if(!nodeSettings.isNodeConfigured) {
							res.send({isError: true, message: "MoarTube Indexer; this node has not performed initial configuration"});
						}
						else {
							database.get('SELECT * FROM videos WHERE video_id = ?', videoId, function(error, video) {
								if(error) {
									logDebugMessageToConsole(null, error, new Error().stack, true);
									
									res.send({isError: true, message: 'error retrieving video data'});
								}
								else {
									if(video != null) {
										performNodeIdentification(false)
										.then(() => {
											const nodeIdentification = getNodeIdentification();
											
											const nodeIdentifier = nodeIdentification.nodeIdentifier;
											const nodeIdentifierProof = nodeIdentification.nodeIdentifierProof;
											
											const data = {
												videoId: videoId,
												nodeIdentifier: nodeIdentifier,
												nodeIdentifierProof: nodeIdentifierProof
											};
											
											indexer_removeVideoFromIndex(data)
											.then(indexerResponseData => {
												if(indexerResponseData.isError) {
													res.send({isError: true, message: indexerResponseData.message});
												}
												else {
													submitDatabaseWriteJob('UPDATE videos SET is_indexed = 0 WHERE video_id = ?', [videoId], function(isError) {
														if(isError) {
															res.send({isError: true, message: 'error communicating with the MoarTube node'});
														}
														else {
															res.send({isError: false});
														}
													});
												}
											})
											.catch(error => {
												res.send('error communicating with the MoarTube indexer');
											});
										})
										.catch(error => {
											res.send({isError: true, message: 'an error occurred while attempting to index, please try again later'});
										});
									}
									else {
										res.send({isError: true, message: 'that video does not exist'});
									}
								}
							});
						}
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/videos/:videoId/alias', (req, res) => {
			const videoId = req.params.videoId;
			const captchaResponse = req.body.captchaResponse;

			if(isVideoIdValid(videoId)) {
				const nodeSettings = getNodeSettings();

				if(nodeSettings.isNodePrivate) {
					res.send({isError: true, message: "aliasing unavailable; this node currently running privately"});
				}
				else if(!nodeSettings.isNodeConfigured) {
					res.send({isError: true, message: "aliasing unavailable; this node has not performed initial configuration"});
				}
				else {
					performNodeIdentification(false)
					.then(() => {
						const nodeIdentification = getNodeIdentification();
						
						const data = {
							videoId: videoId,
							nodeId: nodeSettings.nodeId,
							nodeName: nodeSettings.nodeName,
							nodeAbout: nodeSettings.nodeAbout,
							publicNodeProtocol: nodeSettings.publicNodeProtocol,
							publicNodeAddress: nodeSettings.publicNodeAddress,
							publicNodePort: nodeSettings.publicNodePort,
							nodeIdentifier: nodeIdentification.nodeIdentifier,
							nodeIdentifierProof: nodeIdentification.nodeIdentifierProof,
							captchaResponse: captchaResponse
						};
						
						aliaser_doAliasVideo(data)
						.then(aliaserResponseData => {
							if(aliaserResponseData.isError) {
								logDebugMessageToConsole(aliaserResponseData.message, null, new Error().stack, true);
								
								res.send({isError: true, message: aliaserResponseData.message});
							}
							else {
								res.send({isError: false, videoAliasUrl: aliaserResponseData.videoAliasUrl});
							}
						})
						.catch(error => {
							logDebugMessageToConsole(null, error, new Error().stack, true);
							
							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						});
					})
					.catch(error => {
						res.send({isError: true, message: 'an error occurred while attempting to index, please try again later'});
					});
				}
			}
			else {
				res.send({isError: true, message: 'invalid parameters'});
			}
		});
		
		app.get('/videos/:videoId/alias', (req, res) => {
			const videoId = req.params.videoId;
			
			if(isVideoIdValid(videoId)) {
				const nodeSettings = getNodeSettings();

				database.get('SELECT is_indexed FROM videos WHERE video_id = ?', [videoId], function(error, video) {
					if(error) {
						logDebugMessageToConsole(null, error, new Error().stack, true);
						
						res.send({isError: true, message: 'error communicating with the MoarTube node'});
					}
					else {
						if(video != null) {
							const isIndexed = video.is_indexed;

							if(isIndexed) {
								var videoAliasUrl;

								if(IS_DEVELOPER_MODE) {
									videoAliasUrl = 'http://localhost:' + MOARTUBE_ALIASER_PORT + '/nodes/' + nodeId + '/videos/' + videoId;
								}
								else {
									videoAliasUrl = 'https://moartu.be/nodes/' + nodeSettings.nodeId + '/videos/' + videoId;
								}

								res.send({isError: false, videoAliasUrl: videoAliasUrl});
							}
							else {
								if(!nodeSettings.isNodePrivate) {
									performNodeIdentification(false)
									.then(() => {
										const nodeIdentification = getNodeIdentification();
										
										aliaser_getVideoAlias(videoId, nodeIdentification.nodeIdentifier, nodeIdentification.nodeIdentifierProof)
										.then(aliaserResponseData => {
											if(aliaserResponseData.isError) {
												logDebugMessageToConsole(aliaserResponseData.message, null, new Error().stack, true);
												
												res.send({isError: true, message: aliaserResponseData.message});
											}
											else {
												res.send({isError: false, videoAliasUrl: aliaserResponseData.videoAliasUrl});
											}
										})
										.catch(error => {
											logDebugMessageToConsole(null, error, new Error().stack, true);
											
											res.send({isError: true, message: 'error communicating with the MoarTube node'});
										});
									})
									.catch(error => {
										res.send({isError: true, message: 'an error occurred while retrieving the video alias, please try again later'});
									});
								}
								else {
									res.send({isError: true, message: 'MoarTube Aliaser unavailable; node is private'});
								}
							}
						}
						else {
							res.send({isError: true, message: 'MoarTube Aliaser link unavailable'});
						}
					}
				});
			}
			else {
				res.send({isError: true, message: 'invalid parameters'});
			}
		});
		
		// Retrieve videos from the database
		app.get('/channel/search', (req, res) => {
			const searchTerm = req.query.searchTerm;
			const sortTerm = req.query.sortTerm;
			const tagTerm = req.query.tagTerm;
			
			if(isSearchTermValid(searchTerm) && isSortTermValid(sortTerm) && isTagTermValid(tagTerm, true)) {
				var query;
				var params;

				if(searchTerm.length === 0) {
					query = 'SELECT * FROM videos WHERE (is_published = 1 OR is_live = 1)';
					params = [];
				}
				else {
					query = 'SELECT * FROM videos WHERE (is_published = 1 OR is_live = 1) AND title LIKE ?';
					params = ['%' + searchTerm + '%'];
				}

				database.all(query, params, function(error, rows) {
					if(error) {
						logDebugMessageToConsole(null, error, new Error().stack, true);
						
						res.send({isError: true});
					}
					else {
						if(sortTerm === 'latest') {
							rows.sort(function compareByTimestampDescending(a, b) {
								return b.creation_timestamp - a.creation_timestamp;
							});
						}
						else if(sortTerm === 'popular') {
							rows.sort(function compareByTimestampDescending(a, b) {
								return b.views - a.views;
							});
						}
						else if(sortTerm === 'oldest') {
							rows.sort(function compareByTimestampDescending(a, b) {
								return a.creation_timestamp - b.creation_timestamp;
							});
						}
						
						const tagLimitCounter = {};
						var rowsToSend = [];
						
						if(tagTerm.length === 0) {
							const tagLimit = 4;

							rows.forEach(function(row) {
								const tagsArray = row.tags.split(',');
								
								var addRow = false;
								
								for (var tag of tagsArray) {
									if(!tagLimitCounter.hasOwnProperty(tag)) {
										tagLimitCounter[tag] = 0;
									}
									
									if(tagLimitCounter[tag] < tagLimit) {
										tagLimitCounter[tag]++;
										addRow = true;
										break;
									}
								}
								
								if(addRow) {
									rowsToSend.push(row);
								}
							});
						}
						else {
							rows.forEach(function(row) {
								const tagsArray = row.tags.split(',');

								if(tagsArray.includes(tagTerm) && !rowsToSend.includes(row)) {
									rowsToSend.push(row);
								}
							});
						}
						
						res.send({isError: false, searchResults: rowsToSend});
					}
				});
			}
			else {
				res.send({isError: true});
			}
		});
		
		// Retrieve videos from the database, uses timestamp for pagination
		app.get('/videos/search', (req, res) => {
			const searchTerm = req.query.searchTerm;
			const sortTerm = req.query.sortTerm;
			const tagTerm = req.query.tagTerm;
			var tagLimit = req.query.tagLimit;
			const timestamp = req.query.timestamp;
			
			if(isSearchTermValid(searchTerm) && isSortTermValid(sortTerm) && isTagTermValid(tagTerm, true) && isTagLimitValid(tagLimit) && isTimestampValid(timestamp)) {
				tagLimit = Number(tagLimit);

				var query;
				var params;

				if(searchTerm.length === 0) {
					query = 'SELECT * FROM videos WHERE creation_timestamp < ?';
					params = [timestamp];
				}
				else {
					query = 'SELECT * FROM videos WHERE creation_timestamp < ? AND title LIKE ?';
					params = [timestamp, '%' + searchTerm + '%'];
				}
				
				database.all(query, params, function(error, rows) {
					if(error) {
						logDebugMessageToConsole(null, error, new Error().stack, true);
						
						res.send({isError: true, message: 'error communicating with the MoarTube node'});
					}
					else {
						if(sortTerm === 'latest') {
							rows.sort(function compareByTimestampDescending(a, b) {
								return b.creation_timestamp - a.creation_timestamp;
							});
						}
						else if(sortTerm === 'popular') {
							rows.sort(function compareByTimestampDescending(a, b) {
								return b.views - a.views;
							});
						}
						else if(sortTerm === 'oldest') {
							rows.sort(function compareByTimestampDescending(a, b) {
								return a.creation_timestamp - b.creation_timestamp;
							});
						}

						var rowsToSend = [];
						
						if(tagTerm.length === 0) {
							if(tagLimit === 0) {
								rowsToSend = rows;
							}
							else {
								rowsToSend = rows.slice(0, tagLimit);
							}
						}
						else {
							for(const row of rows) {
								const tagsArray = row.tags.split(',');

								if (tagsArray.includes(tagTerm) && !rowsToSend.includes(row)) {
									rowsToSend.push(row);
								}

								if(tagLimit !== 0 && rowsToSend.length === tagLimit) {
									break;
								}
							}
						}
						
						res.send({isError: false, searchResults: rowsToSend});
					}
				});
			}
			else {
				res.send({isError: true, message: 'invalid parameters'});
			}
		});
		
		
		
		// Retrieve thumbnail for video
		app.get('/videos/:videoId/thumbnail', (req, res) => {
			const videoId = req.params.videoId;
			
			if(isVideoIdValid(videoId)) {
				const thumbnailFilePath = path.join(path.join(VIDEOS_DIRECTORY_PATH, videoId + '/images'), 'thumbnail.jpg');
				
				if (fs.existsSync(thumbnailFilePath)) {
					const fileStream = fs.createReadStream(thumbnailFilePath);
					
					res.setHeader('Content-Type', 'image/jpeg');
					
					fileStream.pipe(res);
				}
				else {
					res.status(404).send('thumbnail not found');
				}
			}
			else {
				res.status(404).send('thumbnail not found');
			}
		});
		
		// Upload thumbnail for video
		app.post('/videos/:videoId/thumbnail', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;
					
					if(isVideoIdValid(videoId)) {
						logDebugMessageToConsole('uploading thumbnail for video id: ' + videoId, null, null, true);

						multer(
						{
							fileFilter: function (req, file, cb) {
								const mimeType = file.mimetype;
								
								if(mimeType === 'image/jpeg') {
									cb(null, true);
								}
								else {
									cb(new Error('unsupported upload file type'));
								}
							},
							storage: multer.diskStorage({
								destination: function (req, file, cb) {
									const filePath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/images');
									
									fs.access(filePath, fs.F_OK, function(error) {
										if(error) {
											cb(new Error('file upload error'));
										}
										else {
											cb(null, filePath);
										}
									});
								},
								filename: function (req, file, cb) {
									const mimeType = file.mimetype;
									
									if(mimeType === 'image/jpeg')
									{
										var extension;
										
										if(mimeType === 'image/jpeg')
										{
											extension = '.jpg';
										}
										
										const fileName = 'thumbnail' + extension;
										
										cb(null, fileName);
									}
									else
									{
										cb(new Error('Invalid Media Detected'));
									}
								}
							})
						}).fields([{ name: 'thumbnailFile', minCount: 1, maxCount: 1 }])
						(req, res, async function(error)
						{
							if(error) {
								logDebugMessageToConsole(null, error, new Error().stack, true);
								
								res.send({isError: true, message: error.message});
							}
							else {
								logDebugMessageToConsole('uploaded thumbnail for video id <' + videoId + '>', null, null, true);
								
								res.send({isError: false});
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		// Retrieve preview for video
		app.get('/videos/:videoId/preview', (req, res) => {
			const videoId = req.params.videoId;
			
			if(isVideoIdValid(videoId)) {
				const previewFilePath = path.join(path.join(VIDEOS_DIRECTORY_PATH, videoId + '/images'), 'preview.jpg');
				
				if (fs.existsSync(previewFilePath)) {
					const fileStream = fs.createReadStream(previewFilePath);
					
					res.setHeader('Content-Type', 'image/jpeg');
					
					fileStream.pipe(res);
				}
				else {
					res.status(404).send('preview not found');
				}
			}
			else {
				res.status(404).send('preview not found');
			}
		});
		
		// Retrieve poster for video
		app.get('/videos/:videoId/poster', (req, res) => {
			const videoId = req.params.videoId;
			
			if(isVideoIdValid(videoId)) {
				const previewFilePath = path.join(path.join(VIDEOS_DIRECTORY_PATH, videoId + '/images'), 'poster.jpg');
				
				if (fs.existsSync(previewFilePath)) {
					const fileStream = fs.createReadStream(previewFilePath);
					
					res.setHeader('Content-Type', 'image/jpeg');
					
					fileStream.pipe(res);
				}
				else {
					res.status(404).send('poster not found');
				}
			}
			else {
				res.status(404).send('poster not found');
			}
		});
		
		// Upload preview for video
		app.post('/videos/:videoId/preview', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;
					
					if(isVideoIdValid(videoId)) {
						multer(
						{
							fileFilter: function (req, file, cb) {
								const mimeType = file.mimetype;
								
								if(mimeType === 'image/jpeg') {
									cb(null, true);
								}
								else {
									cb(new Error('unsupported upload file type'));
								}
							},
							storage: multer.diskStorage({
								destination: function (req, file, cb) {
									const filePath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/images');
									
									fs.access(filePath, fs.F_OK, function(error)
									{
										if(error)
										{
											cb(new Error('file upload error'));
										}
										else
										{
											cb(null, filePath);
										}
									});
								},
								filename: function (req, file, cb) {
									const mimeType = file.mimetype;
									
									if(mimeType === 'image/jpeg')
									{
										var extension;
										
										if(mimeType === 'image/jpeg')
										{
											extension = '.jpg';
										}
										
										const fileName = 'preview' + extension;
										
										cb(null, fileName);
									}
									else
									{
										cb(new Error('Invalid Media Detected'));
									}
								}
							})
						}).fields([{ name: 'previewFile', minCount: 1, maxCount: 1 }])
						(req, res, async function(error)
						{
							if(error) {
								logDebugMessageToConsole(null, error, new Error().stack, true);
								
								res.send({isError: true, message: error.message});
							}
							else {
								logDebugMessageToConsole('uploaded preview for video id <' + videoId + '>', null, null, true);

								submitDatabaseWriteJob('UPDATE videos SET is_index_outdated = CASE WHEN is_indexed = 1 THEN 1 ELSE is_index_outdated END WHERE video_id = ?', [videoId], function(isError) {
									if(isError) {
										res.send({isError: true, message: 'error communicating with the MoarTube node'});
									}
									else {
										res.send({isError: false});
									}
								});
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		// Upload poster for video
		app.post('/videos/:videoId/poster', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;
					
					if(isVideoIdValid(videoId)) {
						multer(
						{
							fileFilter: function (req, file, cb) {
								const mimeType = file.mimetype;
								
								if(mimeType === 'image/jpeg') {
									cb(null, true);
								}
								else {
									cb(new Error('unsupported upload file type'));
								}
							},
							storage: multer.diskStorage({
								destination: function (req, file, cb) {
									const filePath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/images');
									
									fs.access(filePath, fs.F_OK, function(error)
									{
										if(error)
										{
											cb(new Error('file upload error'));
										}
										else
										{
											cb(null, filePath);
										}
									});
								},
								filename: function (req, file, cb) {
									const mimeType = file.mimetype;
									
									if(mimeType === 'image/jpeg')
									{
										var extension;
										
										if(mimeType === 'image/jpeg')
										{
											extension = '.jpg';
										}
										
										const fileName = 'poster' + extension;
										
										cb(null, fileName);
									}
									else
									{
										cb(new Error('Invalid Media Detected'));
									}
								}
							})
						}).fields([{ name: 'posterFile', minCount: 1, maxCount: 1 }])
						(req, res, async function(error)
						{
							if(error) {
								logDebugMessageToConsole(null, error, new Error().stack, true);
								
								res.send({isError: true, message: error.message});
							}
							else {
								logDebugMessageToConsole('uploaded poster for video id <' + videoId + '>', null, null, true);
								
								res.send({isError: false});
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.get('/streams/:videoId/bandwidth', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;
					
					if(isVideoIdValid(videoId)) {
						database.get('SELECT bandwidth FROM videos WHERE video_id = ?', [videoId], function(error, row) {
							if(error) {
								logDebugMessageToConsole(null, error, new Error().stack, true);
								
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								if(row != null) {
									const bandwidth = row.bandwidth;
									
									res.send({isError: false, bandwidth: bandwidth});
								}
								else {
									res.send({isError: true, message: 'that video does not exist'});
								}
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/videos/:videoId/lengths', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;
					const lengthSeconds = req.body.lengthSeconds;
					const lengthTimestamp = req.body.lengthTimestamp;
					
					if(isVideoIdValid(videoId)) {
						submitDatabaseWriteJob('UPDATE videos SET length_seconds = ?, length_timestamp = ?, is_index_outdated = CASE WHEN is_indexed = 1 THEN 1 ELSE is_index_outdated END WHERE video_id = ?', [lengthSeconds, lengthTimestamp, videoId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: false});
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		/*
		app.get('/streams/:videoId/isStreaming', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;
					
					if(isVideoIdValid(videoId)) {
						database.get('SELECT is_streaming FROM videos WHERE video_id = ?', videoId, function(error, row) {
							if(error) {
								res.send({isError: true, message: 'error retrieving stream status'});
							}
							else {
								if(row != null) {
									var result = false;
									
									if(row.is_streaming === 1) {
										result = true;
									}
									
									res.send({isError: false, isStreaming: result});
								}
								else {
									res.send({isError: true, message: 'that video does not exist'});
								}
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		*/
		
		app.get('/videos/:videoId/data', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;
					
					if(isVideoIdValid(videoId)) {
						database.get('SELECT * FROM videos WHERE video_id = ?', videoId, function(error, videoData) {
							if(error) {
								logDebugMessageToConsole(null, error, new Error().stack, true);
								
								res.send({isError: true, message: 'error retrieving video data'});
							}
							else {
								if(videoData != null) {
									res.send({isError: false, videoData: videoData});
								}
								else {
									res.send({isError: true, message: 'that video does not exist'});
								}
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/videos/delete', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoIdsJson = req.body.videoIdsJson;
					const videoIds = JSON.parse(videoIdsJson);
					
					if(isVideoIdsValid(videoIds)) {
						submitDatabaseWriteJob('DELETE FROM videos WHERE (is_importing = 0 AND is_publishing = 0 AND is_streaming = 0 AND is_indexed = 0) AND video_id IN (' + videoIds.map(() => '?').join(',') + ')', videoIds, function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								database.all('SELECT * FROM videos WHERE (is_importing = 1 OR is_publishing = 1 OR is_streaming = 1 OR is_indexed = 1) AND video_id IN (' + videoIds.map(() => '?').join(',') + ')', videoIds, (error, videos) => {
									if (error) {
										logDebugMessageToConsole(null, error, new Error().stack, true);
										
										res.send({isError: true, message: error.message});
									} else {
										const deletedVideoIds = [];
										const nonDeletedVideoIds = [];
										
										videos.forEach(function(video) {
											const videoId = video.video_id;
											
											nonDeletedVideoIds.push(videoId);
										});
										
										videoIds.forEach(function(videoId) {
											if(!nonDeletedVideoIds.includes(videoId)) {
												const videoDirectoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId);
							
												deleteDirectoryRecursive(videoDirectoryPath);
												
												deletedVideoIds.push(videoId);
											}
										});

										submitDatabaseWriteJob('DELETE FROM comments WHERE video_id IN (' + deletedVideoIds.map(() => '?').join(',') + ')', deletedVideoIds, function(isError) {
											if(isError) {
												res.send({isError: true, message: 'error communicating with the MoarTube node'});
											}
											else {
												res.send({isError: false, deletedVideoIds: deletedVideoIds, nonDeletedVideoIds: nonDeletedVideoIds});
											}
										});
									}
								});
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/videos/finalize', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoIdsJson = req.body.videoIdsJson;
					const videoIds = JSON.parse(videoIdsJson);
					
					if(isVideoIdsValid(videoIds)) {
						submitDatabaseWriteJob('UPDATE videos SET is_finalized = 1 WHERE (is_importing = 0 AND is_publishing = 0 AND is_streaming = 0) AND video_id IN (' + videoIds.map(() => '?').join(',') + ')', videoIds, function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								database.all('SELECT * FROM videos WHERE (is_importing = 1 OR is_publishing = 1 OR is_streaming = 1) AND video_id IN (' + videoIds.map(() => '?').join(',') + ')', videoIds, (error, videos) => {
									if (error) {
										logDebugMessageToConsole(null, error, new Error().stack, true);
										
										res.send({isError: true, message: error.message});
									} else {
										const finalizedVideoIds = [];
										const nonFinalizedVideoIds = [];
										
										videos.forEach(function(video) {
											const videoId = video.video_id;
											
											nonFinalizedVideoIds.push(videoId);
										});
										
										videoIds.forEach(function(videoId) {
											if(!nonFinalizedVideoIds.includes(videoId)) {
												finalizedVideoIds.push(videoId);
											}
										});
										
										res.send({isError: false, finalizedVideoIds: finalizedVideoIds, nonFinalizedVideoIds: nonFinalizedVideoIds});
									}
								});
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.get('/videos/:videoId/discussion', (req, res) => {
			const videoId = req.params.videoId;
			const timestamp = req.query.timestamp;
			const type = req.query.type;
			const minimumCommentId = req.query.minimumCommentId;
			const maximumCommentId = req.query.maximumCommentId;
			
			if(isVideoIdValid(videoId) && isTimestampValid(timestamp) && isDiscussionTypeValid(type) && isCommentIdValid(minimumCommentId) && isCommentIdValid(maximumCommentId)) {
				if(type === 'before') {
					database.all('SELECT * FROM comments WHERE video_id = ? AND timestamp > ? ORDER BY timestamp ASC', [videoId, timestamp], function(error, rows) {
						if (error) {
							logDebugMessageToConsole(null, error, new Error().stack, true);
							
							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						}
						else {
							res.send({isError: false, comments: rows});
						}
					});
				}
				else if(type === 'after') {
					if(minimumCommentId == 0 && maximumCommentId == 0) {
						database.all('SELECT * FROM comments WHERE video_id = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT 20', [videoId, timestamp], function(error, rows) {
							if (error) {
								logDebugMessageToConsole(null, error, new Error().stack, true);
								
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: false, comments: rows});
							}
						});
					}
					else if(minimumCommentId >= 0 && maximumCommentId > 0) {
						database.all('SELECT * FROM comments WHERE video_id = ? AND timestamp < ? AND id >= ? AND id < ? ORDER BY timestamp DESC', [videoId, timestamp, minimumCommentId, maximumCommentId], function(error, rows) {
							if (error) {
								logDebugMessageToConsole(null, error, new Error().stack, true);
								
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: false, comments: rows});
							}
						});
					}
					else if(minimumCommentId > 0 && maximumCommentId == 0) {
						database.all('SELECT * FROM comments WHERE video_id = ? AND timestamp < ? AND id >= ? ORDER BY timestamp DESC', [videoId, timestamp, minimumCommentId], function(error, rows) {
							if (error) {
								logDebugMessageToConsole(null, error, new Error().stack, true);
								
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: false, comments: rows});
							}
						});
					}
				}
			}
			else {
				res.send({isError: true, message: 'invalid parameters'});
			}
		});
		
		app.get('/videos/:videoId/discussion/:commentId', (req, res) => {
			const videoId = req.params.videoId;
			const commentId = req.params.commentId;
			
			if(isVideoIdValid(videoId) && isCommentIdValid(commentId)) {
				database.get('SELECT * FROM comments WHERE video_id = ? AND id = ?', [videoId, commentId], function(error, comment) {
					if (error) {
						logDebugMessageToConsole(null, error, new Error().stack, true);
						
						res.send({isError: true, message: 'error communicating with the MoarTube node'});
					}
					else {
						if(comment != null) {
							res.send({isError: false, comment: comment});
						}
						else {
							res.send({isError: true, message: 'that comment does not exist'});
						}
					}
				});
			}
			else {
				res.send({isError: true, message: 'invalid parameters'});
			}
		});
		
		app.get('/discussion/captcha', async (req, res) => {
			const captchaType = req.query.captchaType;
			
			if(isCaptchaTypeValid(captchaType)) {
				const captcha = await generateCaptcha();
				
				if(captchaType === 'static') {
					req.session.staticDiscussionCaptcha = captcha.text;
				}
				else if(captchaType === 'dynamic') {
					req.session.dynamicDiscussionCaptcha = captcha.text;
				}
				
				res.setHeader('Content-Type', 'image/png');
				
				res.send(captcha.data);
			}
			else {
				res.end();
			}
		});
		
		app.post('/videos/:videoId/discussion/comment', (req, res) => {
			const videoId = req.params.videoId;
			const commentPlainText = req.body.commentPlainText;
			const captchaResponse = req.body.captchaResponse;
			const captchaType = req.body.captchaType;
			const timestamp = req.body.timestamp;
			
			if(isVideoIdValid(videoId) && isVideoCommentValid(commentPlainText) && isCaptchaTypeValid(captchaType) && isTimestampValid(timestamp)) {
				var captchaAnswer = '';
				
				if(captchaType === 'static') {
					captchaAnswer = req.session.staticDiscussionCaptcha;
				}
				else if(captchaType === 'dynamic') {
					captchaAnswer = req.session.dynamicDiscussionCaptcha;
				}
				
				if(isCaptchaResponseValid(captchaResponse, captchaAnswer)) {
					const commentPlainTextSanitized = sanitizeHtml(commentPlainText, {allowedTags: [], allowedAttributes: {}});
					const commentTimestamp = Date.now();
					
					submitDatabaseWriteJob('INSERT INTO comments(video_id, comment_plain_text_sanitized, timestamp) VALUES (?, ?, ?)', [videoId, commentPlainTextSanitized, commentTimestamp], function(isError) {
						if(isError) {
							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						}
						else {
							submitDatabaseWriteJob('UPDATE videos SET comments = comments + 1 WHERE video_id = ?', [videoId], function(isError) {
								if(isError) {
									res.send({isError: true, message: 'error communicating with the MoarTube node'});
								}
								else {
									database.all('SELECT * FROM comments WHERE video_id = ? AND timestamp > ? ORDER BY timestamp ASC', [videoId, timestamp], function(error, comments) {
										if (error) {
											logDebugMessageToConsole(null, error, new Error().stack, true);
											
											res.send({isError: true, message: 'error communicating with the MoarTube node'});
										}
										else {
											var commentId = 0;
											
											for (let i = comments.length - 1; i >= 0; i--) {
												if(commentTimestamp === comments[i].timestamp) {
													commentId = comments[i].id;
													break;
												}
											}
											
											res.send({isError: false, commentId: commentId, comments: comments});
										}
									});
								}
							});
						}
					});
				}
				else {
					if(captchaType === 'static') {
						delete req.session.staticDiscussionCaptcha;
					}
					else if(captchaType === 'dynamic') {
						delete req.session.dynamicDiscussionCaptcha;
					}
					
					res.send({isError: true, message: 'the captcha was not correct'});
				}
			}
			else {
				res.send({isError: true, message: 'invalid parameters'});
			}
		});
		
		app.delete('/videos/:videoId/comments/:commentId/delete', (req, res) => {
			const videoId = req.params.videoId;
			const commentId = req.params.commentId;
			const timestamp = req.query.timestamp;
			
			if(isVideoIdValid(videoId) && isCommentIdValid(commentId) && isTimestampValid(timestamp)) {
				submitDatabaseWriteJob('DELETE FROM comments WHERE id = ? AND video_id = ? AND timestamp = ?', [commentId, videoId, timestamp], function(isError) {
					if(isError) {
						res.send({isError: true, message: 'error communicating with the MoarTube node'});
					}
					else {
						submitDatabaseWriteJob('UPDATE videos SET comments = comments - 1 WHERE video_id = ?', [videoId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: false});
							}
						});
					}
				});
			}
			else {
				res.send({isError: true, message: 'invalid parameters'});
			}
		});
		
		app.get('/likedislike/captcha', async (req, res) => {
			const captcha = await generateCaptcha();
			
			req.session.likeDislikeCaptcha = captcha.text;
			
			res.setHeader('Content-Type', 'image/png');
			
			res.send(captcha.data);
		});

		app.post('/videos/:videoId/like', (req, res) => {
			const videoId = req.params.videoId;
			const isLiking = req.body.isLiking;
			const isUnDisliking = req.body.isUnDisliking;
			const captchaResponse = req.body.captchaResponse;
			
			if(isVideoIdValid(videoId) && isBooleanValid(isLiking) && isBooleanValid(isUnDisliking)) {
				const captchaAnswer = req.session.likeDislikeCaptcha;
				
				if(isCaptchaResponseValid(captchaResponse, captchaAnswer)) {
					if(isLiking) {
						submitDatabaseWriteJob('UPDATE videos SET likes = likes + 1 WHERE video_id = ?', [videoId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								if(isUnDisliking) {
									submitDatabaseWriteJob('UPDATE videos SET dislikes = dislikes - 1 WHERE video_id = ?', [videoId], function(isError) {
										if(isError) {
											res.send({isError: true, message: 'error communicating with the MoarTube node'});
										}
										else {
											res.send({isError: false});
										}
									});
								}
								else {
									res.send({isError: false});
								}
							}
						});
					}
					else {
						submitDatabaseWriteJob('UPDATE videos SET likes = likes - 1 WHERE video_id = ?', [videoId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: false});
							}
						});
					}
				}
				else {
					delete req.session.likeDislikeCaptcha;
					
					res.send({isError: true, message: 'the captcha was not correct'});
				}
			}
			else {
				res.send({isError: true, message: 'invalid parameters'});
			}
		});
		
		app.post('/videos/:videoId/dislike', (req, res) => {
			const videoId = req.params.videoId;
			const isDisliking = req.body.isDisliking;
			const isUnliking = req.body.isUnliking;
			const captchaResponse = req.body.captchaResponse;
			
			if(isVideoIdValid(videoId) && isBooleanValid(isDisliking) && isBooleanValid(isUnliking)) {
				const captchaAnswer = req.session.likeDislikeCaptcha;
				
				if(isCaptchaResponseValid(captchaResponse, captchaAnswer)) {
					if(isDisliking) {
						submitDatabaseWriteJob('UPDATE videos SET dislikes = dislikes + 1 WHERE video_id = ?', [videoId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								if(isUnliking) {
									submitDatabaseWriteJob('UPDATE videos SET likes = likes - 1 WHERE video_id = ?', [videoId], function(isError) {
										if(isError) {
											res.send({isError: true, message: 'error communicating with the MoarTube node'});
										}
										else {
											res.send({isError: false});
										}
									});
								}
							}
						});
					}
					else {
						submitDatabaseWriteJob('UPDATE videos SET dislikes = dislikes - 1 WHERE video_id = ?', [videoId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: false});
							}
						});
					}
				}
				else {
					delete req.session.likeDislikeCaptcha;
					
					res.send({isError: true, message: 'the captcha was not correct'});
				}
			}
			else {
				res.send({isError: true, message: 'invalid parameters'});
			}
		});
		
		app.get('/videos/recommendations', (req, res) => {
			const tagTerm = req.query.tagTerm;
			const timestamp = req.query.timestamp;
			
			if(isTagTermValid(tagTerm, true) && isTimestampValid(timestamp)) {
				if(tagTerm.length === 0) {
					database.all('SELECT * FROM videos WHERE (is_published = 1 OR is_live = 1) AND creation_timestamp < ? ORDER BY creation_timestamp DESC LIMIT 20', [timestamp], function(error, recommendations) {
						if (error) {
							logDebugMessageToConsole(null, error, new Error().stack, true);
							
							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						}
						else {
							res.send({isError: false, recommendations: recommendations});
						}
					});
				}
				else {
					database.all('SELECT * FROM videos WHERE (is_published = 1 OR is_live = 1) AND tags LIKE ? AND creation_timestamp < ? ORDER BY creation_timestamp DESC LIMIT 20', ['%' + tagTerm + '%', timestamp], (error, rows) => {
						if (error) {
							logDebugMessageToConsole(null, error, new Error().stack, true);
							
							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						}
						else {
							const recommendations = [];
							
							rows.forEach(function(row) {
								const tagsArray = row.tags.split(',');
								if (tagsArray.includes(tagTerm)) {
									recommendations.push(row);
								}
							});
							
							res.send({isError: false, recommendations: recommendations});
						}
					});
				}
			}
			else {
				res.send({isError: true, message: 'invalid parameters'});
			}
		});
		
		// Get all tags for all videos
		app.get('/videos/tags', (req, res) => {
			const tags = [];
			
			database.all('SELECT * FROM videos WHERE (is_published = 1 OR is_live = 1) ORDER BY creation_timestamp DESC', function(error, rows) {
				if(error) {
					logDebugMessageToConsole(null, error, new Error().stack, true);
					
					res.send({isError: true, message: 'error communicating with the MoarTube node'});
				}
				else {
					rows.forEach(function(row) {
						const tagsArray = row.tags.split(',');
						
						tagsArray.forEach(function(tag) {
							if (!tags.includes(tag)) {
								tags.push(tag);
							}
						});
					});
					
					res.send({isError: false, tags: tags});
				}
			});
		});
		
		// Get all tags for all videos
		app.get('/videos/tags/all', (req, res) => {
			const tags = [];
			
			database.all('SELECT * FROM videos ORDER BY creation_timestamp DESC', function(error, rows) {
				if(error) {
					logDebugMessageToConsole(null, error, new Error().stack, true);
					
					res.send({isError: true, message: 'error communicating with the MoarTube node'});
				}
				else {
					rows.forEach(function(row) {
						const tagsArray = row.tags.split(',');
						
						tagsArray.forEach(function(tag) {
							if (!tags.includes(tag)) {
								tags.push(tag);
							}
						});
					});
					
					res.send({isError: false, tags: tags});
				}
			});
		});
		
		
		
		
		
		
		
		
		
		
		
		

		
		
		
		
		
		
		// Serve a page that will play the video
		app.get('/watch', async (req, res) => {
			const videoId = req.query.v;
			
			if(isVideoIdValid(videoId)) {
				const pagePath = path.join(PAGES_DIRECTORY_PATH, 'watch.html');
				
				const fileStream = fs.createReadStream(pagePath);
				
				res.setHeader('Content-Type', 'text/html');
				
				fileStream.pipe(res);
			}
			else {
				res.send({isError: true, message: 'invalid parameters'});
			}
		});
		
		var viewCounter = 0;
		var viewCounterIncrementTimer;
		app.get('/videos/:videoId/watch', async (req, res) => {
			const videoId = req.params.videoId;
			
			if(isVideoIdValid(videoId)) {
				viewCounter++;
				
				clearTimeout(viewCounterIncrementTimer);
				
				viewCounterIncrementTimer = setTimeout(function() {
					const viewCounterTemp = viewCounter;
					
					viewCounter = 0;
					
					submitDatabaseWriteJob('UPDATE videos SET views = views + ?, is_index_outdated = CASE WHEN is_indexed = 1 THEN 1 ELSE is_index_outdated END WHERE video_id = ?', [viewCounterTemp, videoId], function(isError) {
						if(isError) {
							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						}
						else {
							// do nothing
						}
					});
				}, 500);
				
				database.get('SELECT * FROM videos WHERE video_id = ?', [videoId], function(error, video) {
					if(error) {
						res.send({isError: true, message: 'database communication error'});
					}
					else {
						if(video != null) {
							const nodeSettings = getNodeSettings();
							
							const nodeName = nodeSettings.nodeName;
							
							const adaptiveVideosDirectoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive');
							const progressiveVideosDirectoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/progressive');
							
							const adaptiveFormats = [{format: 'm3u8', type: 'application/vnd.apple.mpegurl'}];
							const progressiveFormats = [{format: 'mp4', type: 'video/mp4'}, {format: 'webm', type: 'video/webm'}, {format: 'ogv', type: 'video/ogg'}];
							const resolutions = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p'];
							
							const adaptiveSources = [];
							const progressiveSources = [];
							const sourcesFormatsAndResolutions = {m3u8: [], mp4: [], webm: [], ogv: []};
							
							var isHlsAvailable = false;
							var isMp4Available = false;
							var isWebmAvailable = false;
							var isOgvAvailable = false;
							
							adaptiveFormats.forEach(function(adaptiveFormat) {
								const format = adaptiveFormat.format;
								const type = adaptiveFormat.type;

								const adaptiveVideoFormatPath = path.join(adaptiveVideosDirectoryPath, format);
								const adaptiveVideoMasterManifestPath = path.join(adaptiveVideoFormatPath, 'manifest-master.' + format);
								
								if(fs.existsSync(adaptiveVideoMasterManifestPath)) {
									if(format === 'm3u8') {
										isHlsAvailable = true;
									}
									
									const src = '/' + videoId + '/adaptive/' + format + '/manifests/manifest-master.' + format;
									
									const source = {src: src, type: type};
									
									adaptiveSources.push(source);
								}

								resolutions.forEach(function(resolution) {
									const adaptiveVideoFilePath = path.join(adaptiveVideosDirectoryPath, format + '/manifest-' + resolution + '.' + format);
									
									if(fs.existsSync(adaptiveVideoFilePath)) {
										sourcesFormatsAndResolutions[format].push(resolution);

										const src = '/' + videoId + '/adaptive/' + format + '/manifests/manifest-' + resolution + '.' + format;
										
										const source = {src: src, type: type};
										
										adaptiveSources.push(source);
									}
								});
							});
							
							progressiveFormats.forEach(function(progressiveFormat) {
								const format = progressiveFormat.format;
								const type = progressiveFormat.type;
								
								resolutions.forEach(function(resolution) {
									const progressiveVideoFilePath = path.join(progressiveVideosDirectoryPath, format + '/' + resolution + '/' + resolution + '.' + format);
									
									if(fs.existsSync(progressiveVideoFilePath)) {
										if(format === 'mp4') {
											isMp4Available = true;
										}
										else if(format === 'webm') {
											isWebmAvailable = true;
										}
										else if(format === 'ogv') {
											isOgvAvailable = true;
										}

										sourcesFormatsAndResolutions[format].push(resolution);
										
										const src = '/' + videoId + '/progressive/' + format + '/' + resolution;
										
										const source = {src: src, type: type};
										
										progressiveSources.push(source);
									}
								});
							});
							
							const videoData = {
								nodeName: nodeName,
								title: video.title,
								description: video.description,
								views: video.views,
								likes: video.likes,
								dislikes: video.dislikes,
								isPublished: video.is_published,
								isPublishing: video.is_publishing,
								isLive: video.is_live,
								isStreaming: video.is_streaming,
								isStreamed: video.is_streamed,
								comments: video.comments,
								creationTimestamp: video.creation_timestamp,
								isHlsAvailable: isHlsAvailable,
								isMp4Available: isMp4Available,
								isWebmAvailable: isWebmAvailable,
								isOgvAvailable: isOgvAvailable,
								adaptiveSources: adaptiveSources,
								progressiveSources: progressiveSources,
								sourcesFormatsAndResolutions: sourcesFormatsAndResolutions
							};
							
							res.send({isError: false, videoData: videoData});
						}
						else {
							res.send({isError: true, message: 'that video does not exist'});
						}
					}
				});
			}
			else {
				res.send({isError: true, message: 'invalid parameters'});
			}
		});
		
		
		
		

		
		
		
		app.post('/videos/:videoId/report', async (req, res) => {
			const videoId = req.params.videoId;
			var email = req.body.email;
			const reportType = req.body.reportType;
			var message = req.body.message;
			const captchaResponse = req.body.captchaResponse;
			
			if(isVideoIdValid(videoId) && isReportEmailValid(email) && isReportTypeValid(reportType) && isReportMessageValid(message)) {
				email = sanitizeHtml(email, {allowedTags: [], allowedAttributes: {}});
				message = sanitizeHtml(message, {allowedTags: [], allowedAttributes: {}});
				
				const captchaAnswer = req.session.videoReportCaptcha;
				
				if(isCaptchaResponseValid(captchaResponse, captchaAnswer)) {
					database.get('SELECT * FROM videos WHERE video_id = ?', [videoId], function(error, result) {
						if(error) {
							logDebugMessageToConsole(null, error, new Error().stack, true);
							
							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						}
						else {
							if(result != null) {
								const creationTimestamp = result.creation_timestamp;
								
								submitDatabaseWriteJob('INSERT INTO videoReports(timestamp, video_timestamp, video_id, email, type, message) VALUES (?, ?, ?, ?, ?, ?)', [Date.now(), creationTimestamp, videoId, email, reportType, message], function(isError) {
									if(isError) {
										res.send({isError: true, message: 'error communicating with the MoarTube node'});
									}
									else {
										res.send({isError: false});
									}
								});
							}
							else {
								res.send({isError: true, message: 'that video does not exist'});
							}
						}
					});
				}
				else {
					delete req.session.videoReportCaptcha;
					
					res.send({isError: true, message: 'the captcha was not correct'});
				}
			}
			else {
				res.send({isError: true, message: 'invalid parameters'});
			}
		});
		
		app.post('/comments/:commentId/report', async (req, res) => {
			const commentId = req.params.commentId;
			var email = req.body.email;
			const reportType = req.body.reportType;
			var message = req.body.message;
			const captchaResponse = req.body.captchaResponse;
			
			if(isCommentIdValid(commentId) && isReportEmailValid(email) && isReportTypeValid(reportType) && isReportMessageValid(message)) {
				email = sanitizeHtml(email, {allowedTags: [], allowedAttributes: {}});
				message = sanitizeHtml(message, {allowedTags: [], allowedAttributes: {}});
				
				const captchaAnswer = req.session.commentReportCaptcha;
				
				if(isCaptchaResponseValid(captchaResponse, captchaAnswer)) {
					database.get('SELECT * FROM comments WHERE id = ?', [commentId], function(error, result) {
						if(error) {
							logDebugMessageToConsole(null, error, new Error().stack, true);
							
							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						}
						else {
							if(result != null) {
								const videoId = result.video_id;
								const commentTimestamp = result.timestamp;
								
								submitDatabaseWriteJob('INSERT INTO commentReports(timestamp, comment_timestamp, video_id, comment_id, email, type, message) VALUES (?, ?, ?, ?, ?, ?, ?)', [Date.now(), commentTimestamp, videoId, commentId, email, reportType, message], function(isError) {
									if(isError) {
										res.send({isError: true, message: 'error communicating with the MoarTube node'});
									}
									else {
										res.send({isError: false});
									}
								});
							}
							else {
								res.send({isError: true, message: 'that comment does not exist'});
							}
						}
					});
				}
				else {
					delete req.session.commentReportCaptcha;
					
					res.send({isError: true, message: 'the captcha was not correct'});
				}
			}
			else {
				res.send({isError: true, message: 'invalid parameters'});
			}
		});
		
		
		
		
		
		
		
		app.post('/stream/:videoId/chat/settings', async (req, res) => {
			const videoId = req.params.videoId;
			const isChatHistoryEnabled = req.body.isChatHistoryEnabled;
			const chatHistoryLimit = req.body.chatHistoryLimit;
			
			if(isVideoIdValid(videoId) && isBooleanValid(isChatHistoryEnabled) && isChatHistoryLimitValid(chatHistoryLimit)) {
				database.get('SELECT * FROM videos WHERE video_id = ?', videoId, function(error, videoData) {
					if(error) {
						logDebugMessageToConsole(null, error, new Error().stack, true);
						
						res.send({isError: true, message: 'error retrieving video data'});
					}
					else {
						if(videoData != null) {
							const meta = JSON.parse(videoData.meta);
							
							meta.chatSettings.isChatHistoryEnabled = isChatHistoryEnabled;
							meta.chatSettings.chatHistoryLimit = chatHistoryLimit;
							
							submitDatabaseWriteJob('UPDATE videos SET meta = ? WHERE video_id = ?', [JSON.stringify(meta), videoId], function(isError) {
								if(isError) {
									res.send({isError: true, message: 'error communicating with the MoarTube node'});
								}
								else {
									if(!isChatHistoryEnabled) {
										submitDatabaseWriteJob('DELETE FROM liveChatMessages WHERE video_id = ?', [videoId], function(isError) {
											if(isError) {
												
											}
											else {
												
											}
										});
									}
									else if(chatHistoryLimit !== 0) {
										submitDatabaseWriteJob('DELETE FROM liveChatMessages WHERE chat_message_id NOT IN (SELECT chat_message_id FROM liveChatMessages where video_id = ? ORDER BY chat_message_id DESC LIMIT ?)', [videoId, chatHistoryLimit], function(isError) {
											if(isError) {
												
											}
											else {
												
											}
										});
									}
									
									res.send({isError: false});
								}
							});
						}
						else {
							res.send({isError: true, message: 'that video does not exist'});
						}
					}
				});
			}
			else {
				res.send({isError: true, message: 'invalid parameters'});
			}
		});
		
		app.get('/stream/:videoId/chat/history', async (req, res) => {
			const videoId = req.params.videoId;
			
			if(isVideoIdValid(videoId)) {
				database.all('SELECT * FROM liveChatMessages WHERE video_id = ?', videoId, function(error, chatHistory) {
					if(error) {
						logDebugMessageToConsole(null, error, new Error().stack, true);
						
						res.send({isError: true, message: 'error retrieving chat history'});
					}
					else {
						
						
						res.send({isError: false, chatHistory: chatHistory});
					}
				});
			}
			else {
				res.send({isError: true, message: 'invalid parameters'});
			}
		});
		
		app.get('/videos/comments/all', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					database.all('SELECT timestamp,video_id,id,comment_plain_text_sanitized FROM comments ORDER BY timestamp DESC', function(error, comments) {
						if(error) {
							logDebugMessageToConsole(null, error, new Error().stack, true);
							
							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						}
						else {
							res.send({isError: false, comments: comments});
						}
					});
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		
		
		
		
		
		
		
		
		// Retrieve and serve a captcha
		app.get('/index/captcha', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const nodeSettings = getNodeSettings();

					if(nodeSettings.isNodePrivate) {
						res.send({isError: true, message: "MoarTube Indexer unavailable; node is private"});
					}
					else if(!nodeSettings.isNodeConfigured) {
						res.send({isError: true, message: "MoarTube Indexer unavailable; this node has not performed initial configuration"});
					}
					else {
						performNodeIdentification(false)
						.then(() => {
							const nodeIdentification = getNodeIdentification();
							
							if(nodeIdentification != null) {
								const nodeIdentifier = nodeIdentification.nodeIdentifier;
								const nodeIdentifierProof = nodeIdentification.nodeIdentifierProof;
								
								indexer_getCaptcha(nodeIdentifier, nodeIdentifierProof)
								.then(async indexerResponseData => {
									res.setHeader('Content-Type', 'image/png');
									indexerResponseData.pipe(res);
								})
								.catch(error => {
									logDebugMessageToConsole(null, error, new Error().stack, true);

									res.send({isError: true, message: 'error communicating with the MoarTube node'});
								});
							}
							else {
								logDebugMessageToConsole('/index/captcha attempted retrieving node identification but was null', null, new Error().stack, true);
							}
						})
						.catch(error => {
							res.send({isError: true, message: 'an error occurred while retrieving the captcha'});
						});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole(null, error, new Error().stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		// Retrieve and serve a captcha
		app.get('/alias/captcha', async (req, res) => {
			const nodeSettings = getNodeSettings();

			if(nodeSettings.isNodePrivate) {
				res.send({isError: true, message: "aliasing unavailable; this node currently running privately"});
			}
			else if(!nodeSettings.isNodeConfigured) {
				res.send({isError: true, message: "aliasing unavailable; this node has not performed initial configuration"});
			}
			else {
				performNodeIdentification(false)
				.then(() => {
					const nodeIdentification = getNodeIdentification();
					
					if(nodeIdentification != null) {
						const nodeIdentifier = nodeIdentification.nodeIdentifier;
						const nodeIdentifierProof = nodeIdentification.nodeIdentifierProof;
						
						aliaser_getCaptcha(nodeIdentifier, nodeIdentifierProof)
						.then(aliaserResponseData => {
							res.setHeader('Content-Type', 'image/png');
							aliaserResponseData.pipe(res);
						})
						.catch(error => {
							logDebugMessageToConsole(null, error, new Error().stack, true);

							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						});
					}
					else {
						logDebugMessageToConsole('/alias/captcha attempted retrieving node identification but was null', null, new Error().stack, true);

						res.send({isError: true, message: 'an error occurred while attempting to alias, please try again later'});
					}
				})
				.catch(error => {
					logDebugMessageToConsole(null, error, new Error().stack, true);

					res.send({isError: true, message: 'an error occurred while attempting to alias, please try again later'});
				});
			}
		});
		
		
		
		
		
		
		
		
		
		
		app.get('/embed/video/:videoId', async (req, res) => {
			const videoId = req.params.videoId;
			
			if(isVideoIdValid(videoId)) {
				const pagePath = path.join(PAGES_DIRECTORY_PATH, 'embed-video.html');
				
				const fileStream = fs.createReadStream(pagePath);
				
				res.setHeader('Content-Type', 'text/html');
				
				fileStream.pipe(res);
			}
			else {
				res.status(404).send('embed video not found');
			}
		});
		
		app.get('/embed/chat/:videoId', async (req, res) => {
			const videoId = req.params.videoId;
			
			if(isVideoIdValid(videoId)) {
				const pagePath = path.join(PAGES_DIRECTORY_PATH, 'embed-chat.html');
				
				const fileStream = fs.createReadStream(pagePath);
				
				res.setHeader('Content-Type', 'text/html');
				
				fileStream.pipe(res);
			}
			else {
				res.status(404).send('embed chat not found');
			}
		});
		
		
		
		
		
		
		
		
		
		
		
		
		function submitDatabaseWriteJob(query, parameters, callback) {
			const databaseWriteJobId = uuidv1() + '-' + uuidv4();
			
			PENDING_DATABASE_WRITE_JOBS[databaseWriteJobId] = {
				callback: callback
			};
			
			process.send({ cmd: 'database_write_job', query: query, parameters: parameters, databaseWriteJobId: databaseWriteJobId });
		}
		
		
		
		
		
		
		
		
		
		
		
		
		
		
		function websocketNodeBroadcast(message) {
			process.send({ cmd: 'websocket_broadcast', message: message });
		}
		
		function websocketChatBroadcast(message) {
			process.send({ cmd: 'websocket_broadcast_chat', message: message });
		}
		
		function updateHlsVideoMasterManifestFile(videoId) {
			const hlsVideoDirectoryPath = path.join(VIDEOS_DIRECTORY_PATH, videoId + '/adaptive/m3u8');
			const masterManifestFilePath = path.join(hlsVideoDirectoryPath, '/manifest-master.m3u8');
			
			var manifestFileString = '#EXTM3U\n#EXT-X-VERSION:3\n';

			fs.readdirSync(hlsVideoDirectoryPath).forEach(fileName => {
				const filePath = path.join(hlsVideoDirectoryPath, fileName);
				if (!fs.lstatSync(filePath).isDirectory()) {
					if(fileName === 'manifest-240p.m3u8') {
						manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=250000,RESOLUTION=426x240\n';
						manifestFileString += '/' + videoId + '/adaptive/m3u8/manifests/manifest-240p.m3u8\n';
					}
					else if(fileName === 'manifest-360p.m3u8') {
						manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360\n';
						manifestFileString += '/' + videoId + '/adaptive/m3u8/manifests/manifest-360p.m3u8\n';
					}
					else if(fileName === 'manifest-480p.m3u8') {
						manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480\n';
						manifestFileString += '/' + videoId + '/adaptive/m3u8/manifests/manifest-480p.m3u8\n';
					}
					else if(fileName === 'manifest-720p.m3u8') {
						manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720\n';
						manifestFileString += '/' + videoId + '/adaptive/m3u8/manifests/manifest-720p.m3u8\n';
					}
					else if(fileName === 'manifest-1080p.m3u8') {
						manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080\n';
						manifestFileString += '/' + videoId + '/adaptive/m3u8/manifests/manifest-1080p.m3u8\n';
					}
					else if(fileName === 'manifest-1440p.m3u8') {
						manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=2560x1440\n';
						manifestFileString += '/' + videoId + '/adaptive/m3u8/manifests/manifest-1440p.m3u8\n';
					}
					else if(fileName === 'manifest-2160p.m3u8') {
						manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=16000000,RESOLUTION=3840x2160\n'
						manifestFileString += '/' + videoId + '/adaptive/m3u8/manifests/manifest-2160p.m3u8\n';
					}
				}
			});
			
			fs.writeFileSync(masterManifestFilePath, manifestFileString);
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

		















		
		
		
		
		
		
		
		
		
		
		
		
		
		
		
		
		
		
		
		function getDatabase() {
			return new Promise(function(resolve, reject) {
				const database = new sqlite3.Database(path.join(DATABASE_DIRECTORY_PATH, 'node_db.sqlite'), function(error) {
					if (error) {
						logDebugMessageToConsole(null, error, new Error().stack, true);
						
						reject();
					}
					else {
						database.run('PRAGMA journal_mode=WAL', function (error) {
							if (error) {
								logDebugMessageToConsole(null, error, new Error().stack, true);
								
								reject();
							} else {
								resolve(database);
							}
						});
					}
				});
			});
		}
	}
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