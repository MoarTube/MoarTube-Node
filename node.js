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
	logDebugMessageToConsole, getNodeSettings, setNodeSettings, loadConfig
} = require('./utils/helpers');

const homeRoutes = require('./routes/home');
const accountRoutes = require('./routes/account');
const reportsRoutes = require('./routes/reports');
const reportsVideosRoutes = require('./routes/reports-videos');
const reportsCommentsRoutes = require('./routes/reports-comments');
const reportsArchiveRoutes = require('./routes/reports-archive-videos');
const settingsRoutes = require('./routes/settings');
const videosRoutes = require('./routes/videos');
const streamsRoutes = require('./routes/streams');
const captchaRoutes = require('./routes/captcha');
const embedRoutes = require('./routes/embed');
const channelRoutes = require('./routes/channel');
const commentsRoutes = require('./routes/comments');

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
		app.use('/settings', settingsRoutes);
		app.use('/videos', videosRoutes);
		app.use('/streams', streamsRoutes);
		app.use('/captcha', captchaRoutes);
		app.use('/embed', embedRoutes);
		app.use('/channel', channelRoutes);
		app.use('/comments', commentsRoutes);
		
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
						manifestFileString += '/videos/' + videoId + '/adaptive/m3u8/manifests/manifest-240p.m3u8\n';
					}
					else if(fileName === 'manifest-360p.m3u8') {
						manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360\n';
						manifestFileString += '/videos/' + videoId + '/adaptive/m3u8/manifests/manifest-360p.m3u8\n';
					}
					else if(fileName === 'manifest-480p.m3u8') {
						manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480\n';
						manifestFileString += '/videos/' + videoId + '/adaptive/m3u8/manifests/manifest-480p.m3u8\n';
					}
					else if(fileName === 'manifest-720p.m3u8') {
						manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720\n';
						manifestFileString += '/videos/' + videoId + '/adaptive/m3u8/manifests/manifest-720p.m3u8\n';
					}
					else if(fileName === 'manifest-1080p.m3u8') {
						manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080\n';
						manifestFileString += '/videos/' + videoId + '/adaptive/m3u8/manifests/manifest-1080p.m3u8\n';
					}
					else if(fileName === 'manifest-1440p.m3u8') {
						manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=2560x1440\n';
						manifestFileString += '/videos/' + videoId + '/adaptive/m3u8/manifests/manifest-1440p.m3u8\n';
					}
					else if(fileName === 'manifest-2160p.m3u8') {
						manifestFileString += '#EXT-X-STREAM-INF:BANDWIDTH=16000000,RESOLUTION=3840x2160\n'
						manifestFileString += '/videos/' + videoId + '/adaptive/m3u8/manifests/manifest-2160p.m3u8\n';
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