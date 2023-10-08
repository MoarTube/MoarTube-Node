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
const { v4: uuidv4 } = require('uuid');
const httpTerminator = require('http-terminator');
const cluster = require('cluster');
const { Mutex } = require('async-mutex');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

var MOARTUBE_NODE_HTTP_PORT;

var MOARTUBE_INDEXER_IP;
var MOARTUBE_INDEXER_PORT;
var MOARTUBE_INDEXER_HTTP_PROTOCOL;

var MOARTUBE_ALIASER_IP;
var MOARTUBE_ALIASER_PORT;
var MOARTUBE_ALIASER_HTTP_PROTOCOL;

var EXPRESS_SESSION_NAME;
var EXPRESS_SESSION_SECRET;

var CONFIG_FILE_NAME;

loadConfig();

if(cluster.isMaster) {
	// create required directories
	fs.mkdirSync(path.join(__dirname, '/public/javascript'), { recursive: true });
	fs.mkdirSync(path.join(__dirname, '/public/css'), { recursive: true });
	fs.mkdirSync(path.join(__dirname, '/public/media/videos'), { recursive: true });
	fs.mkdirSync(path.join(__dirname, '/public/db'), { recursive: true });
	fs.mkdirSync(path.join(__dirname, '/public/pages'), { recursive: true });
	fs.mkdirSync(path.join(__dirname, '/public/fonts'), { recursive: true });
	fs.mkdirSync(path.join(__dirname, '/public/certificates'), { recursive: true });
	
	logDebugMessageToConsole('starting node', '', true);

	provisionSqliteDatabase(path.join(__dirname, '/public/db/node_db.sqlite'))
	.then((database) => {
		const mutex = new Mutex();
		
		const nodeSettings = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_settings.json'), 'utf8'));
		
		if(nodeSettings.nodeId === '') {
			nodeSettings.nodeId = generateVideoId();
			
			fs.writeFileSync(path.join(__dirname, '/_node_settings.json'), JSON.stringify(nodeSettings));
		}
		
		const jwtSecret = crypto.randomBytes(32).toString('hex');
		
		const numCPUs = require('os').cpus().length;
		
		for (var i = 0; i < numCPUs; i++) {
			const worker = cluster.fork();
			
			worker.on('message', async (msg) => {
				if (msg.cmd && msg.cmd === 'get_jwt_secret') {
					worker.send({ cmd: 'get_jwt_secret_response', jwtSecret: jwtSecret });
				}
				else if (msg.cmd && msg.cmd === 'message_log') {
					const message = msg.message;
					const stackTrace = msg.stackTrace;
					const isLoggingToFile = msg.isLoggingToFile;
					
					logDebugMessageToConsole(message, stackTrace, isLoggingToFile);
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
				else if (msg.cmd && msg.cmd === 'database_write_job') {
					const release = await mutex.acquire();
					
					const query = msg.query;
					const parameters = msg.parameters;
					const timestamp = msg.timestamp;
					
					const databaseWriteJob = {
						query: query,
						parameters: parameters
					};
					
					try {
						await performDatabaseWriteJob(databaseWriteJob);
						
						worker.send({ cmd: 'database_write_job_result', timestamp: timestamp, isError: false });
					}
					catch(error) {
						logDebugMessageToConsole('', new Error(error).stack, true);
						
						worker.send({ cmd: 'database_write_job_result', timestamp: timestamp, isError: true });
					}
					finally {
						release();
					}
				}
			});
		}

		cluster.on('exit', (worker, code, signal) => {
			logDebugMessageToConsole('worker exited with id <' + worker.process.pid + '> code <' + code + '> signal <' + signal + '>', '', true);
		});
		
		function performDatabaseWriteJob(databaseWriteJob) {
			return new Promise(function(resolve, reject) {
				const query = databaseWriteJob.query;
				const parameters = databaseWriteJob.parameters;
				
				database.run(query, parameters, function(error) {
					if(error) {
						logDebugMessageToConsole('', new Error(error).stack, true);
						
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
			database.all('SELECT * FROM videos WHERE is_indexed = 1 AND is_index_outdated = 1', function(error, rows) {
				if(error) {
					logDebugMessageToConsole('', new Error(error).stack, true);
				}
				else {
					if(rows.length > 0) {
						indexer_performNodeIdentification()
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
								
								indexer_doIndexUpdate(nodeIdentifier, nodeIdentifierProof, videoId, title, tags, views, isStreaming, lengthSeconds)
								.then(async indexerResponseData => {
									if(indexerResponseData.isError) {
										logDebugMessageToConsole(indexerResponseData.message, new Error().stack, true);
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
											
											logDebugMessageToConsole('updated video id with index successfully: ' + videoId, '', true);
										}
										catch(error) {
											logDebugMessageToConsole('', new Error(error).stack, true);
										}
										finally {
											release();
										}
									}
								})
								.catch(error => {
									logDebugMessageToConsole('', new Error(error).stack, true);
								});
							});
						})
						.catch(error => {
							logDebugMessageToConsole('', new Error(error).stack, true);
						});
					}
				}
			});
		}, 3000);
	})
	.catch(error => {
		logDebugMessageToConsole('', new Error(error).stack, true);
	});
	
	function logDebugMessageToConsole(message, stackTrace, isLoggingToFile) {
		const date = new Date(Date.now());
		const year = date.getFullYear();
		const month = ('0' + (date.getMonth() + 1)).slice(-2);
		const day = ('0' + date.getDate()).slice(-2);
		const hours = ('0' + date.getHours()).slice(-2);
		const minutes = ('0' + date.getMinutes()).slice(-2);
		const seconds = ('0' + date.getSeconds()).slice(-2);
		const humanReadableTimestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
		
		var errorMessage = '<message: ' + message + ', date: ' + humanReadableTimestamp + '>';

		if(stackTrace != '') {
			errorMessage += '\n' + stackTrace + '\n';
		}
		
		console.log(errorMessage);
		
		errorMessage += '\n';
		
		if(isLoggingToFile) {
			const logFilePath = path.join(__dirname, '/_node_log.txt');
			
			fs.appendFileSync(logFilePath, errorMessage);
		}
	}
	
	function provisionSqliteDatabase(databasePath) {
		return new Promise(function(resolve, reject) {
			logDebugMessageToConsole('provisioning SQLite3 database', '', true);
			
			const database = new sqlite3.Database(databasePath, function(error) {
				if (error) {
					logDebugMessageToConsole('', new Error(error).stack, true);
					
					reject();
				}
				else {
					database.run('PRAGMA journal_mode=WAL', function (error) {
						if (error) {
							logDebugMessageToConsole('', new Error(error).stack, true);
							
							reject();
						} else {
							database.run('CREATE TABLE IF NOT EXISTS videos(id INTEGER PRIMARY KEY, video_id TEXT, source_file_extension TEXT, title TEXT, description TEXT, tags TEXT, length_seconds INTEGER, length_timestamp INTEGER, views INTEGER, comments INTEGER, likes INTEGER, dislikes INTEGER, bandwidth INTEGER, is_importing INTEGER, is_imported INTEGER, is_publishing INTEGER, is_published INTEGER, is_streaming INTEGER, is_streamed INTEGER, is_stream_recorded_remotely INTEGER, is_stream_recorded_locally INTEGER, is_live INTEGER, is_indexed INTEGER, is_index_outdated INTEGER, is_error INTEGER, is_finalized INTEGER, meta TEXT, creation_timestamp INTEGER)', function (error) {
								if (error) {
									logDebugMessageToConsole('', new Error(error).stack, true);
									
									reject();
								} else {
									database.run('CREATE TABLE IF NOT EXISTS videoIdProofs(id INTEGER PRIMARY KEY, video_id TEXT, video_id_proof TEXT)', function (error) {
										if (error) {
											logDebugMessageToConsole('', new Error(error).stack, true);
											
											reject();
										} else {
											database.run('CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY, video_id TEXT, comment_plain_text_sanitized TEXT, timestamp INTEGER)', function (error) {
												if (error) {
													logDebugMessageToConsole('', new Error(error).stack, true);
													
													reject();
												} else {
													database.run('CREATE TABLE IF NOT EXISTS videoReports(report_id INTEGER PRIMARY KEY, timestamp INTEGER, video_timestamp INTEGER, video_id TEXT, email TEXT, type TEXT, message TEXT)', function (error) {
														if (error) {
															logDebugMessageToConsole('', new Error(error).stack, true);
															
															reject();
														} else {
															database.run('CREATE TABLE IF NOT EXISTS commentReports(report_id INTEGER PRIMARY KEY, timestamp INTEGER, comment_timestamp INTEGER, video_id TEXT, comment_id TEXT, email TEXT, type TEXT, message TEXT)', function (error) {
																if (error) {
																	logDebugMessageToConsole('', new Error(error).stack, true);
																	
																	reject();
																} else {
																	database.run('CREATE TABLE IF NOT EXISTS videoReportsArchive(archive_id INTEGER PRIMARY KEY, report_id INTEGER, timestamp INTEGER, video_timestamp INTEGER, video_id TEXT, email TEXT, type TEXT, message TEXT)', function (error) {
																		if (error) {
																			logDebugMessageToConsole('', new Error(error).stack, true);
																			
																			reject();
																		} else {
																			database.run('CREATE TABLE IF NOT EXISTS commentReportsArchive(archive_id INTEGER PRIMARY KEY, report_id INTEGER, timestamp INTEGER, comment_timestamp INTEGER, video_id TEXT, comment_id TEXT, email TEXT, type TEXT, message TEXT)', function (error) {
																				if (error) {
																					logDebugMessageToConsole('', new Error(error).stack, true);
																					
																					reject();
																				} else {
																					database.run('UPDATE videos SET is_streamed = ? WHERE is_streaming = ?', [1, 1], function (error) {
																						if (error) {
																							logDebugMessageToConsole('', new Error(error).stack, true);
																							
																							reject();
																						} else {
																							database.run('UPDATE videos SET is_importing = ?, is_publishing = ?, is_streaming = ?', [0, 0, 0], function (error) {
																								if (error) {
																									logDebugMessageToConsole('', new Error(error).stack, true);
																									
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
																												logDebugMessageToConsole('', new Error(error).stack, true);
																											});
																										}, 5000);
																										
																										resolve(database);
																									})
																									.catch(function(error) {
																										logDebugMessageToConsole('', new Error(error).stack, true);
																										
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
			database.all('SELECT video_id FROM videos WHERE is_streamed = 1', function(error, rows) {
				if(error) {
					logDebugMessageToConsole('', new Error(error).stack, true);
					
					reject();
				}
				else {
					for(var i = 0; i < rows.length; i++) {
						const row = rows[i];
						
						if(row.is_stream_recorded_remotely) {
							const videoId = row.video_id;
							
							const m3u8Directory = path.join(__dirname, '/public/media/videos/' + videoId + '/adaptive/m3u8');
							
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
					logDebugMessageToConsole('', new Error(error).stack, true);
					
					reject();
				}
				else {
					for(var i = 0; i < rows.length; i++) {
						const row = rows[i];
						
						const videoId = row.video_id;
						
						const m3u8Directory = path.join(__dirname, '/public/media/videos/' + videoId + '/adaptive/m3u8');
						
						if (fs.existsSync(m3u8Directory)) {
							fs.readdir(m3u8Directory, (error, files) => {
								if(error) {
									logDebugMessageToConsole('', new Error(error).stack, true);
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
			logDebugMessageToConsole('', new Error(error).stack, true);
		});

		process.on('unhandledRejection', (reason, promise) => {
			logDebugMessageToConsole('', new Error(reason).stack, true);
		});
		
		var JWT_SECRET;
		var PENDING_DATABASE_WRITE_JOBS = [];
		
		process.on('message', (msg) => {
			if (msg.cmd === 'websocket_broadcast_response') {
				const message = msg.message;
				
				httpServerWrapper.websocketServer.clients.forEach(function each(client) {
					if (client.readyState === webSocket.OPEN) {
						client.send(JSON.stringify(message));
					}
				});
			}
			else if (msg.cmd === 'get_jwt_secret_response') {
				JWT_SECRET = msg.jwtSecret;
			}
			else if (msg.cmd === 'database_write_job_result') {
				const timestamp = msg.timestamp;
				const isError = msg.isError;
				
				const pendingDatabaseWriteJob = PENDING_DATABASE_WRITE_JOBS[timestamp];
				
				const callback = pendingDatabaseWriteJob.callback;
				
				delete PENDING_DATABASE_WRITE_JOBS[timestamp];
				
				callback(isError);
			}
		});
		
		process.send({ cmd: 'get_jwt_secret' });
		
		const publishVideoUploadingTracker = {};
		
		const database = await getDatabase();

		const app = express();
		
		app.enable('trust proxy');
		
		app.use('/javascript',  express.static(path.join(__dirname, '/public/javascript')));
		app.use('/css',  express.static(path.join(__dirname, '/public/css')));
		app.use('/images',  express.static(path.join(__dirname, '/public/images')));
		app.use('/fonts',  express.static(path.join(__dirname, '/public/fonts')));
		
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
		
		var httpServerWrapper = await initializeHttpServer();
		
		function initializeHttpServer() {
			return new Promise(function(resolve, reject) {
				const nodeSettings = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_settings.json'), 'utf8'));
				
				if(nodeSettings.isSecure) {
					const certificatesDirectory = path.join(__dirname, '/public/certificates');
					
					if (fs.existsSync(certificatesDirectory)) {
						var key = '';
						var cert = '';
						var ca = [];
						
						fs.readdirSync(certificatesDirectory).forEach(fileName => {
							if(fileName === 'private_key.pem') {
								key = fs.readFileSync(path.join(certificatesDirectory, 'private_key.pem'), 'utf8');
							}
							else if(fileName === 'certificate.pem') {
								cert = fs.readFileSync(path.join(certificatesDirectory, 'certificate.pem'), 'utf8');
							}
							else {
								const caFile = fs.readFileSync(path.join(certificatesDirectory, fileName), 'utf8');
								
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
							
							httpServer = https.createServer(SSL_CREDENTIALS, app);
						}
					}
					else {
						reject('certificate directory not found for HTTPS server');
					}
				}
				else {
					httpServer = http.createServer(app);
				}

				httpServer.requestTimeout = 0; // needed for long duration requests (streaming, large uploads)
				
				httpServer.listen(MOARTUBE_NODE_HTTP_PORT, function() {
					logDebugMessageToConsole('MoarTube Node is listening on port ' + MOARTUBE_NODE_HTTP_PORT, '', true);
					
					const websocketServer = new webSocket.Server({ 
						noServer: true, 
						perMessageDeflate: false 
					});
					
					websocketServer.on('connection', function connection(ws) {
						logDebugMessageToConsole('websocket client connected', '', true);
						
						ws.on('close', () => {
							logDebugMessageToConsole('websocket client disconnected', '', true);
						});
						
						ws.on('message', (message) => {
							const parsedMessage = JSON.parse(message);
							
							const jwtToken = parsedMessage.jwtToken;
							
							if(jwtToken != null) {
								// attempting a websocket message that expects authentication
								
								getAuthenticationStatus(jwtToken)
								.then((isAuthenticated) => {
									if(isAuthenticated) {
										if(parsedMessage.eventName === 'echo') {
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
									logDebugMessageToConsole('', new Error(error).stack, true);
								});
							}
							else {
								// attempting a websocket message that does not expect authentication (chat)
								// rate limit
								
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
		
		app.use(function(req, res, next) {
			next();
		});
		
		app.get('/', (req, res) => {
			const pagePath = path.join(__dirname, '/public/pages/channel.html');
			const fileStream = fs.createReadStream(pagePath);
			res.setHeader('Content-Type', 'text/html');
			fileStream.pipe(res);
		});
		
		app.get('/api/information', (req, res) => {
			if (fs.existsSync(path.join(__dirname, '/_node_settings.json'))) {
				database.get('SELECT COUNT(*) AS videoCount FROM videos WHERE (is_published = 1 OR is_live = 1)', function(error, result) {
					if(error) {
						logDebugMessageToConsole('', new Error(error).stack, true);
						
						res.send({isError: true, message: 'error communicating with the MoarTube node'});
					}
					else {
						if(result != null) {
							const nodeSettings = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_settings.json'), 'utf8'));
							
							const nodeId = nodeSettings.nodeId;
							const publicNodeProtocol = nodeSettings.publicNodeProtocol;
							const publicNodeAddress = nodeSettings.publicNodeAddress;
							const publicNodePort = nodeSettings.publicNodePort;
							const nodeName = nodeSettings.nodeName;
							const nodeAbout = nodeSettings.nodeAbout;
							const nodeVideoCount = result.videoCount;
							
							res.send({isError: false, nodeId: nodeId, publicNodeProtocol: publicNodeProtocol, publicNodeAddress: publicNodeAddress, publicNodePort: publicNodePort, nodeName: nodeName, nodeVideoCount: nodeVideoCount, nodeAbout: nodeAbout});
						}
						else {
							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						}
					}
				});
			}
			else {
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			}
		});
		
		app.post('/account/signin', function(req, res, next) {
			var username = req.body.username;
			var password = req.body.password;
			var rememberMe = req.body.rememberMe;
			
			if(!isUsernameValid(username)) {
				logDebugMessageToConsole('attempted to sign in with invalid username: ' + username, new Error().stack, true);

				res.send({isError: true, message: 'usernames can contain letters aA-zZ, digits, symbols !@#$%^&*()-_=+[], and can be up to 100 characters long'});
			}
			else if(!isPasswordValid(password)) {
				logDebugMessageToConsole('attempted to sign in with invalid password: ' + password, new Error().stack, true);

				res.send({isError: true, message: 'passwords can contain letters aA-zZ, digits, symbols !@#$%^&*()-_=+[], and can be up to 100 characters long'});
			}
			else if(!isBooleanValid(rememberMe)) {
				logDebugMessageToConsole('attempted to sign in with invalid rememberMe: ' + rememberMe, new Error().stack, true);

				res.send({isError: true, message: 'invalid parameter: rememberMe value was ' + rememberMe + ', expected "on" or "off"'});
			}
			else {
				var expiresIn;
				
				if(rememberMe) {
					expiresIn = '30d'; // 30 days
				}
				else {
					expiresIn = '1d'; // 1 day
				}
				
				if (fs.existsSync(path.join(__dirname, '/_node_settings.json'))) {
					const nodeSettings = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_settings.json'), 'utf8'));
					
					const usernameHash = Buffer.from(decodeURIComponent(nodeSettings.username), 'base64').toString('utf8');
					const passwordHash = Buffer.from(decodeURIComponent(nodeSettings.password), 'base64').toString('utf8');
					
					const isUsernameValid = bcryptjs.compareSync(username, usernameHash);
					const isPasswordValid = bcryptjs.compareSync(password, passwordHash);
					
					if(isUsernameValid && isPasswordValid) {
						logDebugMessageToConsole('user logged in: ' + username, '', true);
						
						const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: expiresIn });
						
						res.send({isError: false, isAuthenticated: true, token: token});
					}
					else {
						res.send({isError: false, isAuthenticated: false});
					}
				}
				else {
					res.send({isError: true});
				}
			}
		});
		
		app.get('/account/signout', (req, res, next) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					req.logout(function(error) {
						res.send({isError: false, wasAuthenticated: true});
					});
				}
				else {
					res.send({isError: false, wasAuthenticated: false});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.get('/account/authenticated', (req, res, next) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				res.send({isError: false, isAuthenticated: isAuthenticated});
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		
		
		
		
		
		
		
		
		
		app.get('/node/settings', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const config = JSON.parse(fs.readFileSync(path.join(__dirname, CONFIG_FILE_NAME), 'utf8'));
					const nodeSettings = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_settings.json'), 'utf8'));
					
					nodeSettings.nodeListeningPort = config.nodeConfig.httpPort;
					
					res.send({isError: false, nodeSettings: nodeSettings});
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		// Import a video
		app.post('/video/import', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
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
						const videoId = generateVideoId();
						const creationTimestamp = Date.now();
						
						const meta = JSON.stringify({});

						logDebugMessageToConsole('importing video with id <' + videoId + '>', '', true);
						
						const tagsSanitized = sanitizeTagsSpaces(tags);
						
						fs.mkdirSync(path.join(__dirname, '/public/media/videos/' + videoId + '/images'), { recursive: true });
						fs.mkdirSync(path.join(__dirname, '/public/media/videos/' + videoId + '/adaptive'), { recursive: true });
						fs.mkdirSync(path.join(__dirname, '/public/media/videos/' + videoId + '/progressive'), { recursive: true });
						
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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/video/imported', async (req, res) => {
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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/video/publishing', async (req, res) => {
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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/video/published', async (req, res) => {
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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
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
						logDebugMessageToConsole('uploading video with id <' + videoId + '> format <' + format + '> resolution <' + resolution + '>', '', true);

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
												directoryPath = path.join(__dirname, '/public/media/videos/' + videoId + '/adaptive/m3u8');
											}
											else if(isSegmentNameValid(fileName)) {
												directoryPath = path.join(__dirname, '/public/media/videos/' + videoId + '/adaptive/m3u8/' + resolution);
											}
										}
										else if(format === 'mp4') {
											directoryPath = path.join(__dirname, '/public/media/videos/' + videoId + '/progressive/mp4/' + resolution);
										}
										else if(format === 'webm') {
											directoryPath = path.join(__dirname, '/public/media/videos/' + videoId + '/progressive/webm/' + resolution);
										}
										else if(format === 'ogv') {
											directoryPath = path.join(__dirname, '/public/media/videos/' + videoId + '/progressive/ogv/' + resolution);
										}
										
										if(directoryPath !== '') {
											logDebugMessageToConsole('storing video with id <' + videoId + '> format <' + format + '> resolution <' + resolution + '> to directory <' + directoryPath + '>', '', true);
											
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
									logDebugMessageToConsole('', new Error(error).stack, true);
									
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
							logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);
							
							res.send({isError: true, message: 'you are not logged in'});
						}
					});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
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
											directoryPath = path.join(__dirname, '/public/media/videos/' + videoId + '/adaptive/m3u8');
										}
										else if(isSegmentNameValid(fileName)) {
											directoryPath = path.join(__dirname, '/public/media/videos/' + videoId + '/adaptive/m3u8/' + resolution);
										}
									}
									else if(format === 'mp4') {
										directoryPath = path.join(__dirname, '/public/media/videos/' + videoId + '/progressive/mp4/' + resolution);
									}
									else if(format === 'webm') {
										directoryPath = path.join(__dirname, '/public/media/videos/' + videoId + '/progressive/webm/' + resolution);
									}
									else if(format === 'ogv') {
										directoryPath = path.join(__dirname, '/public/media/videos/' + videoId + '/progressive/ogv/' + resolution);
									}
									
									if(directoryPath !== '') {
										logDebugMessageToConsole('storing stream with id <' + videoId + '> format <' + format + '> resolution <' + resolution + '> to directory <' + directoryPath + '>', '', true);
										
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
							logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

							res.send({isError: true, message: 'you are not logged in'});
						}
					});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		
		app.post('/video/error', async (req, res) => {
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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/video/ready', async (req, res) => {
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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
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
								logDebugMessageToConsole('', new Error(error).stack, true);

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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/stream/start', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const title = req.body.title;
					const description = req.body.description;
					const tags = req.body.tags;
					const rtmpPort = req.body.rtmpPort;
					const uuid = req.body.uuid;
					var isRecordingStreamRemotely = req.body.isRecordingStreamRemotely;
					var isRecordingStreamLocally = req.body.isRecordingStreamLocally;

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
					else if(!isUuidv4Valid(uuid)) {
						res.send({isError: true, message: 'uuid not valid'});
					}
					else if(!isBooleanValid(isRecordingStreamRemotely)) {
						res.send({isError: true, message: 'isRecordingStreamRemotely not valid'});
					}
					else if(!isBooleanValid(isRecordingStreamLocally)) {
						res.send({isError: true, message: 'isRecordingStreamLocally not valid'});
					}
					else {
						const videoId = generateVideoId();
						const creationTimestamp = Date.now();
						
						isRecordingStreamRemotely = isRecordingStreamRemotely ? 1 : 0;
						isRecordingStreamLocally = isRecordingStreamLocally ? 1 : 0;
						
						const meta = JSON.stringify({rtmpPort: rtmpPort, uuid: uuid});
						
						const tagsSanitized = sanitizeTagsSpaces(tags);
						
						fs.mkdirSync(path.join(__dirname, '/public/media/videos/' + videoId + '/images'), { recursive: true });
						fs.mkdirSync(path.join(__dirname, '/public/media/videos/' + videoId + '/adaptive'), { recursive: true });
						fs.mkdirSync(path.join(__dirname, '/public/media/videos/' + videoId + '/progressive'), { recursive: true });
						
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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/videos/:videoId/streaming/stop', (req, res) => {
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
								const m3u8DirectoryPath = path.join(__dirname, '/public/media/videos/' + videoId + '/adaptive/m3u8');
								
								deleteDirectoryRecursive(m3u8DirectoryPath);
								
								res.send({isError: false});
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});

		// Serve a video manifest file
		app.get('/:videoId/adaptive/:format/manifests/:manifestName', (req, res) => {
			const videoId = req.params.videoId;
			const format = req.params.format;
			const manifestName = req.params.manifestName;
			
			if(isVideoIdValid(videoId) && isAdaptiveFormatValid(format) && isManifestNameValid(manifestName)) {
				const manifestPath = path.join(__dirname, 'public/media/videos/' + videoId + '/adaptive/' + format + '/' + manifestName);
				
				if(fs.existsSync(manifestPath)) {
					fs.stat(manifestPath, function(error, stats) {
						if (error) {
							logDebugMessageToConsole('', new Error(error).stack, true);
						} else {
							submitDatabaseWriteJob('UPDATE videos SET bandwidth = bandwidth + ? WHERE video_id = ?', [stats.size, videoId], function(isError) {
								if(isError) {
									// do nothing
								}
								else {
									// do nothing
								}
							});
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
		app.get('/:videoId/adaptive/:format/:resolution/segments/:segmentName', (req, res) => {
			const videoId = req.params.videoId;
			const format = req.params.format;
			const resolution = req.params.resolution;
			const segmentName = req.params.segmentName;
			
			if(isVideoIdValid(videoId) && isAdaptiveFormatValid(format) && isResolutionValid(resolution) && isSegmentNameValid(segmentName)) {
				const segmentPath = path.join(__dirname, 'public/media/videos/' + videoId + '/adaptive/' + format + '/' + resolution + '/' + segmentName);
				
				if(fs.existsSync(segmentPath)) {
					fs.stat(segmentPath, function(error, stats) {
						if (error) {
							logDebugMessageToConsole('', new Error(error).stack, true);
						} else {
							submitDatabaseWriteJob('UPDATE videos SET bandwidth = bandwidth + ? WHERE video_id = ?', [stats.size, videoId], function(isError) {
								if(isError) {
									// do nothing
								}
								else {
									// do nothing
								}
							});
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
						var nextExpectedSegmentIndex = 0;
						
						const segmentsDirectoryPath = path.join(__dirname, 'public/media/videos/' + videoId + '/adaptive/' + format + '/' + resolution);
						
						if (fs.existsSync(segmentsDirectoryPath) && fs.statSync(segmentsDirectoryPath).isDirectory()) {
							var latestBirthTime = 0;
							fs.readdirSync(segmentsDirectoryPath).forEach(segmentFileName => {
								const segmentFilePath = path.join(segmentsDirectoryPath, segmentFileName);
								const stat = fs.statSync(segmentFilePath);
								if (!stat.isDirectory() && stat.birthtimeMs > latestBirthTime) {
									const segmentFileNameArray = segmentFileName.split('-');
									nextExpectedSegmentIndex = Number(segmentFileNameArray[2].split('.')[0]);
									latestBirthTime = stat.birthtimeMs;
									
									nextExpectedSegmentIndex++;
								}
							});
						}
						
						res.send({isError: false, nextExpectedSegmentIndex: nextExpectedSegmentIndex});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
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
						const segmentPath = path.join(__dirname, '/public/media/videos/' + videoId + '/adaptive/' + format + '/' + resolution + '/' + segmentName);
						
						fs.unlinkSync(segmentPath);
						
						res.send({isError: false});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.get('/:videoId/progressive/:format/:resolution', (req, res) => {
			const videoId = req.params.videoId;
			const format = req.params.format;
			const resolution = req.params.resolution;
			
			if(isVideoIdValid(videoId) && isProgressiveFormatValid(format) && isResolutionValid(resolution)) {
				const relativeFilePath = 'public/media/videos/' + videoId + '/progressive/' + format + '/' + resolution + '/' + resolution + '.' + format;
				const filePath = path.join(__dirname, relativeFilePath);
				
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
						
						submitDatabaseWriteJob('UPDATE videos SET bandwidth = bandwidth + ? WHERE video_id = ?', [chunkSize, videoId], function(isError) {
							if(isError) {
								// do nothing
							}
							else {
								// do nothing
							}
						});
						
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
				const relativeFilePath = 'public/media/videos/' + videoId + '/progressive/' + format + '/' + resolution + '/' + resolution + '.' + format;
				const filePath = path.join(__dirname, relativeFilePath);
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
								logDebugMessageToConsole('', new Error(error).stack, true);
								
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
										const videosDirectoryPath = path.join(__dirname, 'public/media/videos/' + videoId);
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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
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
						logDebugMessageToConsole('unpublishing video with id <' + videoId + '> format <' + format + '> resolution <' + resolution + '>', '', true);
						
						var videoDirectoryPath = '';
						var manifestFilePath = '';
						
						if(format === 'm3u8') {
							manifestFilePath = path.join(__dirname, 'public/media/videos/' + videoId + '/adaptive/' + format + '/manifest-' + resolution + '.m3u8');
							videoDirectoryPath = path.join(__dirname, 'public/media/videos/' + videoId + '/adaptive/' + format + '/' + resolution);
						}
						else if(format === 'mp4') {
							videoDirectoryPath = path.join(__dirname, 'public/media/videos/' + videoId + '/progressive/' + format + '/' + resolution);
						}
						else if(format === 'webm') {
							videoDirectoryPath = path.join(__dirname, 'public/media/videos/' + videoId + '/progressive/' + format + '/' + resolution);
						}
						else if(format === 'ogv') {
							videoDirectoryPath = path.join(__dirname, 'public/media/videos/' + videoId + '/progressive/' + format + '/' + resolution);
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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.get('/videos/:videoId/information', (req, res) => {
			const videoId = req.params.videoId;
			
			if(isVideoIdValid(videoId)) {
				database.get('SELECT * FROM videos WHERE video_id = ?', videoId, function(error, row) {
					if(error) {
						logDebugMessageToConsole('', new Error(error).stack, true);
						
						res.send({isError: true, message: 'error communicating with the MoarTube node'});
					}
					else {
						if(row != null) {
							const nodeSettings = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_settings.json'), 'utf8'));
							
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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
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
							const nodeSettings = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_settings.json'), 'utf8'));
							
							if(nodeSettings.isNodeConfigured) {
								const nodeId = nodeSettings.nodeId;
								const nodeName = nodeSettings.nodeName;
								const nodeAbout = nodeSettings.nodeAbout;
								const publicNodeProtocol = nodeSettings.publicNodeProtocol;
								const publicNodeAddress = nodeSettings.publicNodeAddress;
								const publicNodePort = nodeSettings.publicNodePort;
								
								database.get('SELECT * FROM videos WHERE video_id = ?', videoId, function(error, video) {
									if(error) {
										logDebugMessageToConsole('', new Error(error).stack, true);
										
										res.send({isError: true, message: 'error retrieving video data'});
									}
									else {
										if(video != null) {
											if(video.is_published || video.is_live) {
												indexer_performNodeIdentification()
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
														containsAdultContent: containsAdultContent
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
							else {
								res.send({isError: true, message: "this node isn't configured for MoarTube.com indexing<br>please provide your node's external network settings to enable indexing<br><br><a href='/'>what is indexing</a>"});
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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/videos/:videoId/index/remove', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const videoId = req.params.videoId;

					if(isVideoIdValid(videoId)) {
						const nodeSettings = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_settings.json'), 'utf8'));
						
						if(nodeSettings.isNodeConfigured) {
							database.get('SELECT * FROM videos WHERE video_id = ?', videoId, function(error, video) {
								if(error) {
									logDebugMessageToConsole('', new Error(error).stack, true);
									
									res.send({isError: true, message: 'error retrieving video data'});
								}
								else {
									if(video != null) {
										indexer_performNodeIdentification()
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
						else {
							res.send({isError: true, message: "this node isn't configured for MoarTube.com indexing<br>please provide your node's external network settings to enable indexing<br><br><a href='/'>what is indexing</a>"});
						}
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/videos/:videoId/alias', (req, res) => {
			const videoId = req.params.videoId;
			const captchaResponse = req.body.captchaResponse;

			if(isVideoIdValid(videoId)) {
				const nodeSettings = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_settings.json'), 'utf8'));
				
				if(nodeSettings.isNodeConfigured) {
					indexer_performNodeIdentification()
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
								logDebugMessageToConsole(aliaserResponseData.message, new Error().stack, true);
								
								res.send({isError: true, message: aliaserResponseData.message});
							}
							else {
								res.send({isError: false, videoAliasUrl: aliaserResponseData.videoAliasUrl});
							}
						})
						.catch(error => {
							logDebugMessageToConsole('', new Error(error).stack, true);
							
							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						});
					})
					.catch(error => {
						res.send({isError: true, message: 'an error occurred while attempting to index, please try again later'});
					});
				}
				else {
					res.send({isError: true, message: 'node not configured'});
				}
			}
			else {
				res.send({isError: true, message: 'invalid parameters'});
			}
		});
		
		app.get('/videos/:videoId/alias', (req, res) => {
			const videoId = req.params.videoId;
			
			if(isVideoIdValid(videoId)) {
				indexer_performNodeIdentification()
				.then(() => {
					const nodeIdentification = getNodeIdentification();
					
					aliaser_getVideoAlias(videoId, nodeIdentification.nodeIdentifier, nodeIdentification.nodeIdentifierProof)
					.then(aliaserResponseData => {
						if(aliaserResponseData.isError) {
							logDebugMessageToConsole(aliaserResponseData.message, new Error().stack, true);
							
							res.send({isError: true, message: aliaserResponseData.message});
						}
						else {
							res.send({isError: false, videoAliasUrl: aliaserResponseData.videoAliasUrl});
						}
					})
					.catch(error => {
						logDebugMessageToConsole('', new Error(error).stack, true);
						
						res.send({isError: true, message: 'error communicating with the MoarTube node'});
					});
				})
				.catch(error => {
					res.send({isError: true, message: 'an error occurred while retrieving the video alias, please try again later'});
				});
			}
			else {
				res.send({isError: true, message: 'invalid parameters'});
			}
		});
		
		// Retrieve videos from the database
		app.get('/videos/search', (req, res) => {
			const searchTerm = req.query.searchTerm;
			const sortTerm = req.query.sortTerm;
			const tagTerm = req.query.tagTerm;
			var tagLimit = req.query.tagLimit;
			
			if(isSearchTermValid(searchTerm) && isSortTermValid(sortTerm) && isTagTermValid(tagTerm, true) && isTagLimitValid(tagLimit)) {
				tagLimit = Number(tagLimit);
				
				if(searchTerm.length === 0) {
					database.all('SELECT * FROM videos WHERE (is_published = 1 OR is_live = 1)', function(error, rows) {
						if(error) {
							logDebugMessageToConsole('', new Error(error).stack, true);
							
							res.send({isError: true});
						}
						else {
							const tagLimitCounter = {};
							
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
							}
							else {
								rows.forEach(function(row) {
									const tagsArray = row.tags.split(',');
									if (tagsArray.includes(tagTerm)) {
										if(tagLimit === 0) {
											rowsToSend.push(row);
										}
										else {
											if(!tagLimitCounter.hasOwnProperty(tagTerm)) {
												tagLimitCounter[tagTerm] = 0;
											}
											
											if(tagLimitCounter[tagTerm] < tagLimit) {
												tagLimitCounter[tagTerm]++;
												rowsToSend.push(row);
											}
										}
									}
								});
							}
							
							res.send({isError: false, searchResults: rowsToSend});
						}
					});
				}
				else if(searchTerm.length <= 100) {
					database.all('SELECT * FROM videos WHERE (is_published = 1 OR is_live = 1) AND title LIKE ?', ['%' + searchTerm + '%'], (error, rows) => {
						if(error) {
							logDebugMessageToConsole('', new Error(error).stack, true);
							
							res.send({isError: true});
						}
						else {
							const tagLimitCounter = {};
							
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
									rows.forEach(function(row) {
										if(!tagLimitCounter.hasOwnProperty(tagTerm)) {
											tagLimitCounter[tagTerm] = 0;
										}
										
										if(tagLimitCounter[tagTerm] < tagLimit) {
											tagLimitCounter[tagTerm]++;
											rowsToSend.push(row);
										}
									});
								}
							}
							else {
								rows.forEach(function(row) {
									const tagsArray = row.tags.split(',');
									if (tagsArray.includes(tagTerm)) {
										if(tagLimit === 0) {
											rowsToSend.push(row);
										}
										else {
											if(!tagLimitCounter.hasOwnProperty(tagTerm)) {
												tagLimitCounter[tagTerm] = 0;
											}
											
											if(tagLimitCounter[tagTerm] < tagLimit) {
												tagLimitCounter[tagTerm]++;
												rowsToSend.push(row);
											}
										}
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
			}
			else {
				res.send({isError: true});
			}
		});
		
		// Retrieve videos from the database
		app.get('/videos/search/all', (req, res) => {
			const searchTerm = req.query.searchTerm;
			const sortTerm = req.query.sortTerm;
			const tagTerm = req.query.tagTerm;
			var tagLimit = req.query.tagLimit;
			const timestamp = req.query.timestamp;
			
			if(isSearchTermValid(searchTerm) && isSortTermValid(sortTerm) && isTagTermValid(tagTerm, true) && isTagLimitValid(tagLimit) && isTimestampValid(timestamp)) {
				tagLimit = Number(tagLimit);
				
				if(searchTerm.length === 0) {
					database.all('SELECT * FROM videos WHERE creation_timestamp < ? ORDER BY creation_timestamp', [timestamp], function(error, rows) {
						if(error) {
							logDebugMessageToConsole('', new Error(error).stack, true);
							
							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						}
						else {
							const tagLimitCounter = {};
							
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
								rows.forEach(function(row) {
									const tagsArray = row.tags.split(',');
									if (tagsArray.includes(tagTerm)) {
										if(tagLimit === 0) {
											rowsToSend.push(row);
										}
										else {
											if(!tagLimitCounter.hasOwnProperty(tagTerm)) {
												tagLimitCounter[tagTerm] = 0;
											}
											
											if(tagLimitCounter[tagTerm] < tagLimit) {
												tagLimitCounter[tagTerm]++;
												rowsToSend.push(row);
											}
										}
									}
								});
							}
							
							res.send({isError: false, searchResults: rowsToSend});
						}
					});
				}
				else if(searchTerm.length <= 100) {
					database.all('SELECT * FROM videos WHERE creation_timestamp < ? AND title LIKE ?', [timestamp, '%' + searchTerm + '%'], (error, rows) => {
						if(error) {
							logDebugMessageToConsole('', new Error(error).stack, true);
							
							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						}
						else {
							const tagLimitCounter = {};
							
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
								rows.forEach(function(row) {
									const tagsArray = row.tags.split(',');
									if (tagsArray.includes(tagTerm)) {
										if(tagLimit === 0) {
											rowsToSend.push(row);
										}
										else {
											if(!tagLimitCounter.hasOwnProperty(tagTerm)) {
												tagLimitCounter[tagTerm] = 0;
											}
											
											if(tagLimitCounter[tagTerm] < tagLimit) {
												tagLimitCounter[tagTerm]++;
												rowsToSend.push(row);
											}
										}
									}
								});
							}
							
							res.send({isError: false, searchResults: rowsToSend});
						}
					});
				}
				else {
					res.send({isError: true, message: 'invalid search term length'});
				}
			}
			else {
				res.send({isError: true, message: 'invalid parameters'});
			}
		});
		
		
		
		// Retrieve thumbnail for video
		app.get('/videos/:videoId/thumbnail', (req, res) => {
			const videoId = req.params.videoId;
			
			if(isVideoIdValid(videoId)) {
				const thumbnailFilePath = path.join(path.join(__dirname, '/public/media/videos/' + videoId + '/images'), 'thumbnail.jpg');
				
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
						logDebugMessageToConsole('uploading thumbnail for video id: ' + videoId, '', true);

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
									const filePath = path.join(__dirname, '/public/media/videos/' + videoId + '/images');
									
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
								logDebugMessageToConsole('', new Error(error).stack, true);
								
								res.send({isError: true, message: error.message});
							}
							else {
								logDebugMessageToConsole('uploaded thumbnail for video id <' + videoId + '>', '', true);
								
								res.send({isError: false});
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		// Retrieve preview for video
		app.get('/videos/:videoId/preview', (req, res) => {
			const videoId = req.params.videoId;
			
			if(isVideoIdValid(videoId)) {
				const previewFilePath = path.join(path.join(__dirname, '/public/media/videos/' + videoId + '/images'), 'preview.jpg');
				
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
				const previewFilePath = path.join(path.join(__dirname, '/public/media/videos/' + videoId + '/images'), 'poster.jpg');
				
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
									const filePath = path.join(__dirname, '/public/media/videos/' + videoId + '/images');
									
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
								logDebugMessageToConsole('', new Error(error).stack, true);
								
								res.send({isError: true, message: error.message});
							}
							else {
								logDebugMessageToConsole('uploaded preview for video id <' + videoId + '>', '', true);
								
								res.send({isError: false});
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
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
									const filePath = path.join(__dirname, '/public/media/videos/' + videoId + '/images');
									
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
								logDebugMessageToConsole('', new Error(error).stack, true);
								
								res.send({isError: true, message: error.message});
							}
							else {
								logDebugMessageToConsole('uploaded poster for video id <' + videoId + '>', '', true);
								
								res.send({isError: false});
							}
						});
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
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
								logDebugMessageToConsole('', new Error(error).stack, true);
								
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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
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
								logDebugMessageToConsole('', new Error(error).stack, true);
								
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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
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
										logDebugMessageToConsole('', new Error(error).stack, true);
										
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
												const directoryPath = path.join(__dirname, '/public/media/videos/' + videoId);
							
												deleteDirectoryRecursive(directoryPath);
												
												deletedVideoIds.push(videoId);
											}
										});
										
										res.send({isError: false, deletedVideoIds: deletedVideoIds, nonDeletedVideoIds: nonDeletedVideoIds});
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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
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
										logDebugMessageToConsole('', new Error(error).stack, true);
										
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
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
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
							logDebugMessageToConsole('', new Error(error).stack, true);
							
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
								logDebugMessageToConsole('', new Error(error).stack, true);
								
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
								logDebugMessageToConsole('', new Error(error).stack, true);
								
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
								logDebugMessageToConsole('', new Error(error).stack, true);
								
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
						logDebugMessageToConsole('', new Error(error).stack, true);
						
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
											logDebugMessageToConsole('', new Error(error).stack, true);
											
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
						res.send({isError: false});
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
							logDebugMessageToConsole('', new Error(error).stack, true);
							
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
							logDebugMessageToConsole('', new Error(error).stack, true);
							
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
					logDebugMessageToConsole('', new Error(error).stack, true);
					
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
					logDebugMessageToConsole('', new Error(error).stack, true);
					
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
		
		// Retrieve avatar for node
		app.get('/settings/avatar', (req, res) => {
			const thumbnailFilePath = path.join(path.join(__dirname, '/public/images'), 'avatar.jpg');
			
			if (fs.existsSync(thumbnailFilePath)) {
				const fileStream = fs.createReadStream(thumbnailFilePath);
				
				res.setHeader('Content-Type', 'image/jpeg');
				
				fileStream.pipe(res);
			}
			else {
				res.status(404).send('avatar not found');
			}
		});
		
		app.post('/settings/avatar', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					logDebugMessageToConsole('uploading node avatar', '', true);
					
					multer(
					{
						fileFilter: function (req, file, cb) {
							const mimeType = file.mimetype;
							
							if(mimeType === 'image/jpeg') {
								cb(null, true);
							}
							else {
								cb(new Error('Invalid file upload mime type detected!'));
							}
						},
						storage: multer.diskStorage({
							destination: function (req, file, cb) {
								const filePath = path.join(__dirname, '/public/images');
								
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
								var extension;
								
								if(file.mimetype === 'image/jpeg') {
									extension = '.jpg';
								}
								
								const fileName = uuidv4() + extension;
								
								cb(null, fileName);
							}
						})
					}).fields([{ name: 'iconFile', minCount: 1, maxCount: 1 }, { name: 'avatarFile', minCount: 1, maxCount: 1 }])
					(req, res, async function(error)
					{
						if(error) {
							logDebugMessageToConsole('', new Error(error).stack, true);
							
							res.send({isError: true, message: error.message});
						}
						else {
							logDebugMessageToConsole('uploaded node avatar', '', true);
							
							const iconFile = req.files['iconFile'][0];
							const avatarFile = req.files['avatarFile'][0];
							
							const iconSourceFilePath = path.join(__dirname, '/public/images/' + iconFile.filename);
							const avatarSourceFilePath = path.join(__dirname, '/public/images/' + avatarFile.filename);
							
							const iconDestinationFilePath = path.join(__dirname, '/public/images/icon.jpg');
							const avatarDestinationFilePath = path.join(__dirname, '/public/images/avatar.jpg');
							
							fs.renameSync(iconSourceFilePath, iconDestinationFilePath);
							fs.renameSync(avatarSourceFilePath, avatarDestinationFilePath);
							
							res.send({isError: false});
						}
					});
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		// Retrieve banner for node
		app.get('/settings/banner', (req, res) => {
			const thumbnailFilePath = path.join(path.join(__dirname, '/public/images'), 'banner.jpg');
			
			if (fs.existsSync(thumbnailFilePath)) {
				const fileStream = fs.createReadStream(thumbnailFilePath);
				
				res.setHeader('Content-Type', 'image/jpeg');
				
				fileStream.pipe(res);
			}
			else {
				res.status(404).send('banner not found');
			}
		});
		
		app.post('/settings/banner', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					logDebugMessageToConsole('uploading node banner', '', true);
					
					multer(
					{
						fileFilter: function (req, file, cb) {
							const mimeType = file.mimetype;
							
							if(mimeType === 'image/jpeg') {
								cb(null, true);
							}
							else {
								cb(new Error('Invalid file upload mime type detected!'));
							}
						},
						storage: multer.diskStorage({
							destination: function (req, file, cb) {
								const filePath = path.join(__dirname, '/public/images');
								
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
								var extension;
								
								if(file.mimetype === 'image/jpeg') {
									extension = '.jpg';
								}
								
								const fileName = Date.now() + extension;
								
								cb(null, fileName);
							}
						})
					}).fields([{ name: 'bannerFile', minCount: 1, maxCount: 1 }])
					(req, res, async function(error)
					{
						if(error) {
							logDebugMessageToConsole('', new Error(error).stack, true);
							
							res.send({isError: true, message: error.message});
						}
						else {
							logDebugMessageToConsole('uploaded node banner', '', true);
							
							const bannerFile = req.files['bannerFile'][0];
							
							const bannerSourceFilePath = path.join(__dirname, '/public/images/' + bannerFile.filename);
							
							const bannerDestinationFilePath = path.join(__dirname, '/public/images/banner.jpg');
							
							fs.renameSync(bannerSourceFilePath, bannerDestinationFilePath);
							
							res.send({isError: false});
						}
					});
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		// Set the node name
		app.post('/settings/node/personalize', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const nodeName = req.body.nodeName;
					const nodeAbout = req.body.nodeAbout;
					const nodeId = req.body.nodeId;
					
					if(isNodeNameValid(nodeName) && isNodeAboutValid(nodeAbout) && isNodeIdValid(nodeId)) {
						const nodeSettings = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_settings.json'), 'utf8'));
						
						if(nodeSettings.isNodeConfigured) {
							indexer_performNodeIdentification()
							.then(() => {
								const nodeIdentification = getNodeIdentification();
								
								if(nodeIdentification != null) {
									const nodeIdentifier = nodeIdentification.nodeIdentifier;
									const nodeIdentifierProof = nodeIdentification.nodeIdentifierProof;
									
									indexer_doNodePersonalizeUpdate(nodeIdentifier, nodeIdentifierProof, nodeName, nodeAbout, nodeId)
									.then(indexerResponseData => {
										if(indexerResponseData.isError) {
											logDebugMessageToConsole(indexerResponseData.message, new Error().stack, true);
											
											res.send({isError: true, message: 'error communicating with the MoarTube indexer'});
										}
										else {
											nodeSettings.nodeName = nodeName;
											nodeSettings.nodeAbout = nodeAbout;
											nodeSettings.nodeId = nodeId;
											
											fs.writeFileSync(path.join(__dirname, '/_node_settings.json'), JSON.stringify(nodeSettings));
											
											res.send({ isError: false });
										}
									})
									.catch(error => {
										logDebugMessageToConsole('', new Error(error).stack, true);

										res.send({isError: true, message: 'error communicating with the MoarTube indexer'});
									});
								}
								else {
									logDebugMessageToConsole('/settings/node/personalize attempted retrieving node identification but was null', new Error().stack, true);
									
									res.send({isError: true, message: 'error communicating with the MoarTube indexer'});
								}
							})
							.catch(error => {
								res.send({isError: true, message: 'an unknown error occurred'});
							});
						}
						else {
							nodeSettings.nodeName = nodeName;
							nodeSettings.nodeAbout = nodeAbout;
							nodeSettings.nodeId = nodeId;
							
							fs.writeFileSync(path.join(__dirname, '/_node_settings.json'), JSON.stringify(nodeSettings));
							
							res.send({ isError: false });
						}
					}
					else {
						res.send({ isError: true, message: 'invalid username and/or password' });
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/settings/node/secure', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then(async (isAuthenticated) => {
				if(isAuthenticated) {
					var isSecure = req.query.isSecure;
					
					if(isBooleanStringValid(isSecure)) {
						isSecure = (isSecure === 'true');
						
						if(isSecure) {
							logDebugMessageToConsole('switching node to HTTPS mode', '', true);
							
							multer({
								fileFilter: function (req, file, cb) {
									cb(null, true);
								},
								storage: multer.diskStorage({
									destination: function (req, file, cb) {
										const filePath = path.join(__dirname, '/public/certificates');
										
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
										if(file.fieldname === 'keyFile') {
											cb(null, 'private_key.pem');
										}
										else if(file.fieldname === 'certFile') {
											cb(null, 'certificate.pem');
										}
										else if(file.fieldname === 'caFiles') {
											cb(null, file.originalname);
										}
										else {
											cb(new Error('invalid field name in POST /settings/node/secure:' + file.fieldname));
										}
									}
								})
							}).fields([{ name: 'keyFile', minCount: 1, maxCount: 1 }, { name: 'certFile', minCount: 1, maxCount: 1 }, { name: 'caFiles', minCount: 0 }])
							(req, res, async function(error) {
								if(error) {
									logDebugMessageToConsole('', new Error(error).stack, true);
									
									res.send({isError: true, message: 'error communicating with the MoarTube node'});
								}
								else {
									var keyFile = req.files['keyFile'];
									var certFile = req.files['certFile'];
									const caFiles = req.files['caFiles'];
									
									if(keyFile == null || keyFile.length !== 1) {
										res.send({isError: true, message: 'private key file is missing'});
									}
									else if(certFile == null || certFile.length !== 1) {
										res.send({isError: true, message: 'cert file is missing'});
									}
									else {
										if(httpServerWrapper.httpServer instanceof https.Server) {
											res.send({isError: true, message: 'the node is already running an HTTPS server'});
										}
										else {
											res.send({isError: false});
											
											//httpServerWrapper.httpServer.closeAllConnections();
											
											httpServerWrapper.websocketServer.clients.forEach(function each(client) {
												if (client.readyState === webSocket.OPEN) {
													client.close();
												}
											});

											logDebugMessageToConsole('attempting to terminate HTTP node', '', true);
											
											const terminator = httpTerminator.createHttpTerminator({server: httpServerWrapper.httpServer});
											
											logDebugMessageToConsole('termination of HTTP node in progress', '', true);
											
											await terminator.terminate();
											
											logDebugMessageToConsole('terminated HTTP node', '', true);
											
											httpServerWrapper.websocketServer.close(function() {
												logDebugMessageToConsole('HTTP node websocketServer closed, switching to HTTPS', '', true);
												
												httpServerWrapper.httpServer.close(async () => {
													logDebugMessageToConsole('HTTP node web server closed, switching to HTTPS', '', true);
													
													const nodeSettings = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_settings.json'), 'utf8'));
													
													nodeSettings.isSecure = true;
													
													fs.writeFileSync(path.join(__dirname, '/_node_settings.json'), JSON.stringify(nodeSettings));
													
													httpServerWrapper = await initializeHttpServer();
												});
											});
										}
									}
								}
							});
						}
						else {
							logDebugMessageToConsole('switching node to HTTP mode', '', true);
							
							if(httpServerWrapper.httpServer instanceof https.Server) {
								res.send({isError: false});
								
								//httpServerWrapper.httpServer.closeAllConnections();
								
								httpServerWrapper.websocketServer.clients.forEach(function each(client) {
									if (client.readyState === webSocket.OPEN) {
										client.close();
									}
								});
								
								logDebugMessageToConsole('attempting to terminate HTTPS node', '', true);
								
								const terminator = httpTerminator.createHttpTerminator({server: httpServerWrapper.httpServer});
								
								logDebugMessageToConsole('termination of HTTPS node in progress', '', true);
								
								await terminator.terminate();
								
								logDebugMessageToConsole('terminated HTTPS node', '', true);
								
								httpServerWrapper.websocketServer.close(function() {
									logDebugMessageToConsole('HTTPS node websocketServer closed, switching to HTTP', '', true);
									
									httpServerWrapper.httpServer.close(async () => {
										logDebugMessageToConsole('HTTPS node web server closed, switching to HTTP', '', true);
										
										const nodeSettings = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_settings.json'), 'utf8'));
										
										nodeSettings.isSecure = false;
										
										fs.writeFileSync(path.join(__dirname, '/_node_settings.json'), JSON.stringify(nodeSettings));
										
										httpServerWrapper = await initializeHttpServer();
									});
								});
							}
							else {
								res.send({isError: true, message: "the node is currently not runing an HTTPS server"});
							}
						}
					}
					else {
						res.send({isError: true, message: 'invalid parameters'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		// Set the account credentials
		app.post('/settings/account/update', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const username = req.body.username;
					const password = req.body.password;
					
					if(isUsernameValid(username) && isPasswordValid(password)) {
						const usernameHash = encodeURIComponent(Buffer.from(bcryptjs.hashSync(username, 10), 'utf8').toString('base64'));
						const passwordHash = encodeURIComponent(Buffer.from(bcryptjs.hashSync(password, 10), 'utf8').toString('base64'));
						
						const nodeSettings = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_settings.json'), 'utf8'));
						
						nodeSettings.username = usernameHash;
						nodeSettings.password = passwordHash;
						
						fs.writeFileSync(path.join(__dirname, '/_node_settings.json'), JSON.stringify(nodeSettings));
						
						res.send({ isError: false });
					}
					else {
						res.send({ isError: true, message: 'invalid username and/or password' });
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		// Set the Cloudflare credentials
		app.post('/settings/cloudflare/update', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const cloudflareAccountId = req.body.cloudflareAccountId;
					const cloudflareApiKey = req.body.cloudflareApiKey;
					
					const nodeSettings = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_settings.json'), 'utf8'));
					
					nodeSettings.cloudflareAccountId = cloudflareAccountId;
					nodeSettings.cloudflareApiKey = cloudflareApiKey;
					
					fs.writeFileSync(path.join(__dirname, '/_node_settings.json'), JSON.stringify(nodeSettings));
					
					res.send({ isError: false, cloudflareAccountId: cloudflareAccountId, cloudflareApiKey: cloudflareApiKey });
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		// Serve a page that will play the video
		app.get('/watch', async (req, res) => {
			const videoId = req.query.v;
			
			if(isVideoIdValid(videoId)) {
				const pagePath = path.join(path.join(__dirname, '/public/pages'), 'watch.html');
				
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
							const nodeSettings = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_settings.json'), 'utf8'));
							
							const nodeName = nodeSettings.nodeName;
							
							const adaptiveVideosDirectoryPath = path.join(__dirname, '/public/media/videos/' + videoId + '/adaptive');
							const progressiveVideosDirectoryPath = path.join(__dirname, '/public/media/videos/' + videoId + '/progressive');
							
							const adaptiveFormats = [{format: 'm3u8', type: 'application/vnd.apple.mpegurl'}];
							const progressiveFormats = [{format: 'mp4', type: 'video/mp4'}, {format: 'webm', type: 'video/webm'}, {format: 'ogv', type: 'video/ogg'}];
							const resolutions = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p'];
							
							const adaptiveSources = [];
							const progressiveSources = [];
							
							var isHlsAvailable = false;
							var isMp4Available = false;
							var isWebmAvailable = false;
							var isOgvAvailable = false;
							
							adaptiveFormats.forEach(function(adaptiveFormat) {
								const format = adaptiveFormat.format;
								const type = adaptiveFormat.type;
								
								const adaptiveVideoMasterManifestPath = path.join(adaptiveVideosDirectoryPath, format + '/manifest-master.' + format);
								
								if(fs.existsSync(adaptiveVideoMasterManifestPath)) {
									if(format === 'm3u8') {
										isHlsAvailable = true;
									}
									
									const src = '/' + videoId + '/adaptive/' + format + '/manifests/manifest-master.' + format;
									
									const source = {src: src, type: type};
									
									adaptiveSources.push(source);
								}
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
								progressiveSources: progressiveSources
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
		
		
		
		

		
		app.get('/report/video/captcha', async (req, res) => {
			const captcha = await generateCaptcha();
			
			req.session.videoReportCaptcha = captcha.text;
			
			res.setHeader('Content-Type', 'image/png');
			
			res.send(captcha.data);
		});
		
		app.get('/report/comment/captcha', async (req, res) => {
			const captcha = await generateCaptcha();
			
			req.session.commentReportCaptcha = captcha.text;
			
			res.setHeader('Content-Type', 'image/png');
			
			res.send(captcha.data);
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
							logDebugMessageToConsole('', new Error(error).stack, true);
							
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
							logDebugMessageToConsole('', new Error(error).stack, true);
							
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
		
		app.get('/node/reports/videos', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					database.all('SELECT * FROM videoReports', function(error, reports) {
						if(error) {
							logDebugMessageToConsole('', new Error(error).stack, true);
							
							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						}
						else {
							res.send({isError: false, reports: reports});
						}
					});
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.get('/node/reports/archive/videos', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					database.all('SELECT * FROM videoReportsArchive ORDER BY archive_id DESC', function(error, reports) {
						if(error) {
							logDebugMessageToConsole('', new Error(error).stack, true);
							
							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						}
						else {
							res.send({isError: false, reports: reports});
						}
					});
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.get('/node/reports/count', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					database.get('SELECT COUNT(*) AS reportCount FROM videoReports', function(error, videoCountResult) {
						database.get('SELECT COUNT(*) AS reportCount FROM commentReports', function(error, commentCountResult) {
							const videoReportCount = videoCountResult.reportCount;
							const commentReportCount = commentCountResult.reportCount;
							const totalReportCount = videoReportCount + commentReportCount;
							
							res.send({isError: false, videoReportCount: videoReportCount, commentReportCount: commentReportCount, totalReportCount: totalReportCount});
						});
					});
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/reports/videos/archive', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const reportId = req.body.reportId;
					
					if(isReportIdValid(reportId)) {
						database.get('SELECT * FROM videoReports WHERE report_id = ?', [reportId], function(error, report) {
							if(error) {
								logDebugMessageToConsole('', new Error(error).stack, true);
								
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								if(report != null) {
									const reportId = report.report_id;
									const timestamp = report.timestamp;
									const videoTimestamp = report.video_timestamp;
									const videoId = report.video_id;
									const email = report.email;
									const type = report.type;
									const message = report.message;
									
									submitDatabaseWriteJob('INSERT INTO videoReportsArchive(report_id, timestamp, video_timestamp, video_id, email, type, message) VALUES (?, ?, ?, ?, ?, ?, ?)', [reportId, timestamp, videoTimestamp, videoId, email, type, message], function(isError) {
										if(isError) {
											res.send({isError: true, message: 'error communicating with the MoarTube node'});
										}
										else {
											submitDatabaseWriteJob('DELETE FROM videoReports WHERE report_id = ?', [reportId], function(isError) {
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
									logDebugMessageToConsole('report with id does not exist: ' + reportId, new Error().stack, true);
									
									res.send({isError: true, message: 'error communicating with the MoarTube node'});
								}
							}
						});
					}
					else {
						logDebugMessageToConsole('invalid report id: ' + reportId, new Error().stack, true);
						
						res.send({isError: true, message: 'error communicating with the MoarTube node'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.delete('/reports/videos/:reportId/delete', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const reportId = req.params.reportId;
					
					if(isReportIdValid(reportId)) {
						submitDatabaseWriteJob('DELETE FROM videoReports WHERE report_id = ?', [reportId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: false});
							}
						});
					}
					else {
						logDebugMessageToConsole('invalid report id: ' + reportId, new Error().stack, true);
						
						res.send({isError: true, message: 'error communicating with the MoarTube node'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.delete('/reports/archive/videos/:archiveId/delete', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const archiveId = req.params.archiveId;
					
					if(isArchiveIdValid(archiveId)) {
						submitDatabaseWriteJob('DELETE FROM videoReportsArchive WHERE archive_id = ?', [archiveId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: false});
							}
						});
					}
					else {
						logDebugMessageToConsole('invalid archive id: ' + archiveId, new Error().stack, true);
						
						res.send({isError: true, message: 'error communicating with the MoarTube node'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.get('/node/reports/comments', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					database.all('SELECT * FROM commentReports', function(error, reports) {
						if(error) {
							logDebugMessageToConsole('', new Error(error).stack, true);
							
							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						}
						else {
							res.send({isError: false, reports: reports});
						}
					});
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.get('/node/reports/archive/comments', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					database.all('SELECT * FROM commentReportsArchive ORDER BY archive_id DESC', function(error, reports) {
						if(error) {
							logDebugMessageToConsole('', new Error(error).stack, true);
							
							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						}
						else {
							res.send({isError: false, reports: reports});
						}
					});
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/reports/comments/archive', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const reportId = req.body.reportId;
					
					if(isReportIdValid(reportId)) {
						database.get('SELECT * FROM commentReports WHERE report_id = ?', [reportId], function(error, report) {
							if(error) {
								logDebugMessageToConsole('', new Error(error).stack, true);
								
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								if(report != null) {
									
									const reportId = report.report_id;
									const timestamp = report.timestamp;
									const commentTimestamp = report.comment_timestamp;
									const videoId = report.video_id;
									const commentId = report.comment_id;
									const email = report.email;
									const type = report.type;
									const message = report.message;
									
									submitDatabaseWriteJob('INSERT INTO commentReportsArchive(report_id, timestamp, comment_timestamp, video_id, comment_id, email, type, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [reportId, timestamp, commentTimestamp, videoId, commentId, email, type, message], function(isError) {
										if(isError) {
											res.send({isError: true, message: 'error communicating with the MoarTube node'});
										}
										else {
											submitDatabaseWriteJob('DELETE FROM commentReports WHERE report_id = ?', [reportId], function(isError) {
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
									res.send({isError: true, message: 'error communicating with the MoarTube node'});
								}
							}
						});
					}
					else {
						logDebugMessageToConsole('invalid report id: ' + reportId, new Error().stack, true);
						
						res.send({isError: true, message: 'error communicating with the MoarTube node'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.delete('/reports/comments/:reportId/delete', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const reportId = req.params.reportId;
					
					if(isReportIdValid(reportId)) {
						submitDatabaseWriteJob('DELETE FROM commentReports WHERE report_id = ?', [reportId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: false});
							}
						});
					}
					else {
						logDebugMessageToConsole('invalid report id: ' + reportId, new Error().stack, true);
						
						res.send({isError: true, message: 'error communicating with the MoarTube node'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.delete('/reports/archive/comments/:archiveId/delete', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const archiveId = req.params.archiveId;
					
					if(isArchiveIdValid(archiveId)) {
						submitDatabaseWriteJob('DELETE FROM commentReportsArchive WHERE archive_id = ?', [archiveId], function(isError) {
							if(isError) {
								res.send({isError: true, message: 'error communicating with the MoarTube node'});
							}
							else {
								res.send({isError: false});
							}
						});
					}
					else {
						logDebugMessageToConsole('invalid archive id: ' + archiveId, new Error().stack, true);
						
						res.send({isError: true, message: 'error communicating with the MoarTube node'});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		
		
		app.post('/settings/node/network/internal', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then(async (isAuthenticated) => {
				if(isAuthenticated) {
					const listeningNodePort = req.body.listeningNodePort;
				
					if(isPortValid(listeningNodePort)) {
						
						res.send({isError: false});
						
						//httpServerWrapper.httpServer.closeAllConnections();
						
						httpServerWrapper.websocketServer.clients.forEach(function each(client) {
							if (client.readyState === webSocket.OPEN) {
								client.close();
							}
						});
						
						logDebugMessageToConsole('attempting to terminate node', '', true);
						
						const terminator = httpTerminator.createHttpTerminator({server: httpServerWrapper.httpServer});
						
						logDebugMessageToConsole('termination of node in progress', '', true);
						
						await terminator.terminate();
						
						logDebugMessageToConsole('terminated node', '', true);
						
						httpServerWrapper.websocketServer.close(function() {
							logDebugMessageToConsole('node websocketServer closed', '', true);
							
							httpServerWrapper.httpServer.close(async () => {
								logDebugMessageToConsole('node web server closed', '', true);
								
								const config = JSON.parse(fs.readFileSync(path.join(__dirname, CONFIG_FILE_NAME), 'utf8'));
								
								config.nodeConfig.httpPort = listeningNodePort;
								
								fs.writeFileSync(path.join(__dirname, CONFIG_FILE_NAME), JSON.stringify(config));
								
								MOARTUBE_NODE_HTTP_PORT = listeningNodePort;
								
								httpServerWrapper = await initializeHttpServer();
							});
						});
					}
					else {
						res.send({ isError: true, message: 'invalid parameters' });
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/settings/node/network/external', (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const publicNodeProtocol = req.body.publicNodeProtocol;
					const publicNodeAddress = req.body.publicNodeAddress;
					const publicNodePort = req.body.publicNodePort;
					
					if(isPublicNodeProtocolValid(publicNodeProtocol) && (isPublicNodeAddressValid(publicNodeAddress) || isDomainNameValid(publicNodeAddress)) && isPortValid(publicNodePort)) {
						indexer_doNodeConfigurationValidation(publicNodeProtocol, publicNodeAddress, publicNodePort)
						.then(indexerResponseData => {
							if(indexerResponseData.isError) {
								res.send({ isError: true, message: indexerResponseData.message });
							}
							else {
								if(indexerResponseData.isNodeConfigurationValid) {
									indexer_performNodeIdentification()
									.then(() => {
										const nodeIdentification = getNodeIdentification();
										
										const nodeIdentifier = nodeIdentification.nodeIdentifier;
										const nodeIdentifierProof = nodeIdentification.nodeIdentifierProof;
										
										indexer_doNodeExternalNetworkUpdate(nodeIdentifier, nodeIdentifierProof, publicNodeProtocol, publicNodeAddress, publicNodePort)
										.then(indexerResponseData => {
											if(indexerResponseData.isError) {
												res.send({isError: true, message: indexerResponseData.message});
											}
											else {
												const nodeSettings = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_settings.json'), 'utf8'));
												
												nodeSettings.publicNodeProtocol = publicNodeProtocol;
												nodeSettings.publicNodeAddress = publicNodeAddress;
												nodeSettings.publicNodePort = publicNodePort;
												
												nodeSettings.isNodeConfigured = true;
												
												fs.writeFileSync(path.join(__dirname, '/_node_settings.json'), JSON.stringify(nodeSettings));
												
												res.send({ isError: false });
											}
										})
										.catch(error => {
											console.log(error);
											
											logDebugMessageToConsole('', new Error(error).stack, true);
											
											res.send({isError: true, message: 'an unknown error occurred'});
										});
									})
									.catch(error => {
										console.log(error);
										
										logDebugMessageToConsole('', new Error(error).stack, true);
										
										res.send({isError: true, message: 'an unknown error occurred'});
									});
								}
								else {
									res.send({isError: true, message: 'that external network configuration was not valid'});
								}
							}
						})
						.catch(error => {
							logDebugMessageToConsole('', new Error(error).stack, true);
							
							res.send({ isError: true, message: 'your node was unable to communicate with the MoarTube indexer' });
						});
					}
					else {
						res.send({ isError: true, message: 'invalid parameters' });
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		app.post('/configure/skip', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const nodeSettings = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_settings.json'), 'utf8'));
					
					nodeSettings.isNodeConfigured = false;
					nodeSettings.isNodeConfigurationSkipped = true;
					
					fs.writeFileSync(path.join(__dirname, '/_node_settings.json'), JSON.stringify(nodeSettings));
					
					res.send({ isError: false });
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		
		
		
		
		
		
		
		
		
		
		
		
		// Retrieve and serve a captcha
		app.get('/index/captcha', async (req, res) => {
			getAuthenticationStatus(req.headers.authorization)
			.then((isAuthenticated) => {
				if(isAuthenticated) {
					const nodeSettings = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_settings.json'), 'utf8'));
					
					if(nodeSettings.isNodeConfigured) {
						indexer_performNodeIdentification()
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
									logDebugMessageToConsole('', new Error(error).stack, true);

									res.send({isError: true, message: 'error communicating with the MoarTube node'});
								});
							}
							else {
								logDebugMessageToConsole('/index/captcha attempted retrieving node identification but was null', new Error().stack, true);
							}
						})
						.catch(error => {
							res.send({isError: true, message: 'an error occurred while retrieving the captcha'});
						});
					}
					else {
						res.send({isError: true, message: "this node isn't configured for MoarTube.com indexing<br>please provide your node's external network settings to enable indexing<br><br><a href='/'>what is indexing</a>"});
					}
				}
				else {
					logDebugMessageToConsole('unauthenticated communication was rejected', new Error().stack, true);

					res.send({isError: true, message: 'you are not logged in'});
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);
				
				res.send({isError: true, message: 'error communicating with the MoarTube node'});
			});
		});
		
		// Retrieve and serve a captcha
		app.get('/alias/captcha', async (req, res) => {
			const nodeSettings = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_settings.json'), 'utf8'));
			
			if(nodeSettings.isNodeConfigured) {
				indexer_performNodeIdentification()
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
							logDebugMessageToConsole('', new Error(error).stack, true);

							res.send({isError: true, message: 'error communicating with the MoarTube node'});
						});
					}
					else {
						logDebugMessageToConsole('/alias/captcha attempted retrieving node identification but was null', new Error().stack, true);
					}
				})
				.catch(error => {
					res.send({isError: true, message: 'an error occurred while attempting to alias, please try again later'});
				});
			}
			else {
				res.send({isError: true, message: "this node isn't configured for MoarTube.com indexing<br>please provide your node's external network settings to enable indexing<br><br><a href='/'>what is indexing</a>"});
			}
		});
		
		
		
		
		
		
		
		
		
		
		app.get('/embed/videos/:videoId', async (req, res) => {
			const videoId = req.params.videoId;
			
			if(isVideoIdValid(videoId)) {
				const pagePath = path.join(path.join(__dirname, '/public/pages'), 'embed.html');
				
				const fileStream = fs.createReadStream(pagePath);
				
				res.setHeader('Content-Type', 'text/html');
				
				fileStream.pipe(res);
			}
			else {
				res.status(404).send('embed not found');
			}
		});
		
		// Serve the heartbeat response
		app.get('/heartbeat', (req, res) => {
			res.send({isError: false, timestamp: Date.now()});
		});
		
		
		
		
		
		
		
		
		
		
		
		function submitDatabaseWriteJob(query, parameters, callback) {
			const timestamp = Date.now();
			
			PENDING_DATABASE_WRITE_JOBS[timestamp] = {
				callback: callback
			};
			
			process.send({ cmd: 'database_write_job', query: query, parameters: parameters, timestamp: timestamp });
		}
		
		function isVideoIdValid(videoId) {
			const regex = /^(?=.*[a-zA-Z]|\d)?[a-zA-Z0-9_-]{0,11}$/;
			
			return videoId != null && videoId.length > 0 && videoId.length === 11 && regex.test(videoId);
		}
		
		function isVideoIdsValid(videoIds) {
			var result = true;
			
			if(videoIds != null) {
				videoIds.forEach(function(videoId) {
					if(!isVideoIdValid(videoId)) {
						result = false;
						return;
					}
				});
			}
			else {
				result = false
			}
			
			return result;
		}
		
		function isUsernameValid(username) {
			const regex = /^[\w!@#$%^&*()-_=+]+$/;
			
			return username != null && username.length > 0 && username.length <= 100 && regex.test(username)
		}
		
		function isPasswordValid(password) {
			const regex = /^[\w!@#$%^&*()-_=+]+$/;
			
			return password != null && password.length > 0 && password.length <= 100 && regex.test(password)
		}
		
		function isPublicNodeAddressValid(publicNodeAddress) {
			var result = false;
			
			if(publicNodeAddress === 'localhost' || publicNodeAddress === '127.0.0.1' || publicNodeAddress === '::1') {
				result = true;
			}
			else {
				const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
				const ipv6Regex = /^(([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|([0-9A-Fa-f]{1,4}:){1,6}:|::([0-9A-Fa-f]{1,4}:){0,6})$/;
				
				result = (ipv4Regex.test(publicNodeAddress) || ipv6Regex.test(publicNodeAddress));
			}
			
			return result;
		}
		
		function isDomainNameValid(domainName) {
			const regex = /^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,6}$/;
			
			return domainName != null && regex.test(domainName);
		}
		
		function isPortValid(port) {
			port = Number(port);
			
			return port != null && port != NaN && (port >= 0 && port <= 65535);
		}
		
		function isUuidv4Valid(uuid) {
			const regex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
			
			return regex != null && regex.test(uuid)
		}
		
		function isFormatValid(format) {
			return format != null && (isAdaptiveFormatValid(format) || isProgressiveFormatValid(format));
		}
		
		function isAdaptiveFormatValid(format) {
			return format != null && (format === 'm3u8');
		}
		
		function isProgressiveFormatValid(format) {
			return format != null && (format === 'mp4' || format === 'webm' || format === 'ogv');
		}
		
		function isResolutionValid(resolution) {
			return resolution != null && (resolution === '2160p' || resolution === '1440p' || resolution === '1080p' || resolution === '720p' || resolution === '480p' || resolution === '360p' || resolution === '240p');
		}
		
		function isTitleValid(title) {
			return (title != null && title.length > 0 && title.length <= 100);
		}
		
		function isDescriptionValid(description) {
			return (description != null && description.length > 0 && description.length <= 5000);
		}
		
		function isTagTermValid(tagTerm, canBeEmpty) {
			/*
			can be alphanumeric
			can be mixed case
			can contain spaces
			*/
			
			var regex = /^[a-zA-Z0-9\s]*$/;
			
			if(canBeEmpty) {
				return (tagTerm != null && tagTerm.length <= 30 && regex.test(tagTerm));
			}
			else {
				return (tagTerm != null && tagTerm.length > 0 && tagTerm.length <= 30 && regex.test(tagTerm));
			}
		}
		
		function isTagsValid(tags) {
			var result = true;
			
			if(tags != null && tags.length > 0 && tags.length <= 150) {
				const tagsArray = tags.split(',');
				
				if(tagsArray.length > 0 && tagsArray.length <= 5) {
					for(tag of tagsArray) {
						if(!(isTagTermValid(tag, false))) {
							result = false;
							break;
						}
					}
				}
				else {
					result = false;
				}
			}
			else {
				result = false;
			}
			
			return result;
		}
		
		function isVideoMimeTypeValid(mimeType) {
			return (mimeType === 'video/mp4' || mimeType === 'video/webm');
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
		
		function isNodeNameValid(nodeName) {
			return (nodeName != null && nodeName.length >= 0 && nodeName.length <= 100);
		}
		
		function isNodeAboutValid(nodeAbout) {
			return (nodeAbout != null && nodeAbout.length >= 0 && nodeAbout.length <= 100);
		}
		
		function isNodeIdValid(nodeId) {
			return (nodeId != null && nodeId.length > 0 && nodeId.length <= 100);
		}
		
		function isPublicNodeProtocolValid(publicNodeProtocol) {
			return (publicNodeProtocol != null && (publicNodeProtocol === 'http' || publicNodeProtocol === 'https'));
		}
		
		function isManifestNameValid(manifestName) {
			const regex = /^manifest-(?:2160p|1440p|1080p|720p|480p|360p|240p|master).m3u8$/;
			
			return manifestName != null && manifestName.length > 0 && manifestName.length <= 100 && regex.test(manifestName);
		}
		
		function isSegmentNameValid(segmentName) {
			const regex = /^segment-(?:2160p|1440p|1080p|720p|480p|360p|240p)-\d+\.ts$/;
			
			return segmentName != null && segmentName.length > 0 && segmentName.length <= 100 && regex.test(segmentName);
		}
		
		function isStreamMimeTypeValid(mimeType)
		{
			return (mimeType === 'application/vnd.apple.mpegurl' || mimeType === 'video/mp2t');
		}
		
		function isSearchTermValid(searchTerm) {
			return (searchTerm != null && searchTerm.length >= 0 && searchTerm.length <= 100);
		}
		
		function isSourceFileExtensionValid(sourceFileExtension) {
			return (sourceFileExtension != null && (sourceFileExtension === '.mp4' || sourceFileExtension === '.webm' || sourceFileExtension === '.ts'));
		}
		
		function isJobTypeValid(jobType) {
			return (jobType != null && (jobType === 'importing' || jobType === 'publishing' || jobType === 'streaming'));
		}
		
		function isBooleanValid(value) {
			return (value != null && (typeof value === 'boolean'));
		}
		
		function isBooleanStringValid(value) {
			return (value != null && (value === 'true' || value === 'false'));
		}
		
		function isVideoCommentValid(comment) {
			return (comment != null && comment.length <= 500);
		}
		
		function isCaptchaTypeValid(captchaType) {
			return (captchaType != null && (captchaType === 'static' || captchaType === 'dynamic'));
		}
		
		function isCaptchaResponseValid(captchaResponse, captchaAnswer) {
			return (captchaResponse != null && captchaAnswer != null && captchaResponse !== '' && captchaAnswer !== '' && captchaResponse === captchaAnswer);
		}
		
		function isTimestampValid(timestamp) {
			const timestampParsed = parseInt(timestamp, 10);
			
			return (Number.isInteger(timestampParsed));
		}
		
		function isDiscussionTypeValid(type) {
			return (type != null && (type === 'before' || type === 'after'));
		}
		
		function isCommentIdValid(commentId) {
			const regex = /^\d+$/;
			
			return (commentId != null && commentId.length <= 100 && regex.test(commentId));
		}
		
		function isReportIdValid(reportId) {
			const regex = /^\d+$/;
			
			return (reportId != null && reportId.length <= 100 && regex.test(reportId));
		}
		
		function isArchiveIdValid(reportId) {
			const regex = /^\d+$/;
			
			return (reportId != null && reportId.length <= 100 && regex.test(reportId));
		}
		
		function isSortTermValid(sortTerm) {
			return (sortTerm != null && (sortTerm === 'latest' || sortTerm === 'popular' || sortTerm === 'oldest'));
		}
		
		function isTagLimitValid(tagLimit) {
			return (tagLimit != null && tagLimit >= 0);
		}
		
		function sanitizeTagsSpaces(tags) {
			return tags.replace(/\s+/g, ' ');
		}
		
		function isReportEmailValid(reportEmail) {
			return (reportEmail != null && (reportEmail.length <= 100));
		}
		
		function isReportTypeValid(reportType) {
			return (reportType != null && (reportType === 'complaint' || reportType === 'copyright' || reportType === 'other'));
		}
		
		function isReportMessageValid(reportMessage) {
			return (reportMessage != null && (reportMessage.length <= 1000));
		}
		
		function websocketNodeBroadcast(message) {
			
			process.send({ cmd: 'websocket_broadcast', message: message });
		}
		
		function updateHlsVideoMasterManifestFile(videoId) {
			const hlsVideoDirectoryPath = path.join(__dirname, '/public/media/videos/' + videoId + '/adaptive/m3u8');
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
		
		function timestampToSeconds(timestamp) {
		  const parts = timestamp.split(':');
		  const hours = parseInt(parts[0]);
		  const minutes = parseInt(parts[1]);
		  const seconds = parseFloat(parts[2]);
		  
		  return (hours * 3600) + (minutes * 60) + seconds;
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
				
				fs.rmdirSync(directoryPath);
			}
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
		
		
		
		
		
		
		
		function indexer_doNodeConfigurationValidation(publicNodeProtocol, publicNodeAddress, publicNodePort) {
			return new Promise(function(resolve, reject) {
				axios.post(MOARTUBE_INDEXER_HTTP_PROTOCOL + '://' + MOARTUBE_INDEXER_IP + ':' + MOARTUBE_INDEXER_PORT + '/node/configuration/validate', {
					publicNodeProtocol: publicNodeProtocol,
					publicNodeAddress: publicNodeAddress,
					publicNodePort: publicNodePort
				})
				.then(response => {
					const data = response.data;
					
					resolve(data);
				})
				.catch(error => {
					resolve({isError: true, message: 'error'});
				});
			});
		}
		
		function indexer_doNodeExternalNetworkUpdate(nodeIdentifier, nodeIdentifierProof, publicNodeProtocol, publicNodeAddress, publicNodePort) {
			return new Promise(function(resolve, reject) {
				axios.post(MOARTUBE_INDEXER_HTTP_PROTOCOL + '://' + MOARTUBE_INDEXER_IP + ':' + MOARTUBE_INDEXER_PORT + '/index/node/network/update', {
					nodeIdentifier: nodeIdentifier,
					nodeIdentifierProof: nodeIdentifierProof,
					publicNodeProtocol: publicNodeProtocol,
					publicNodeAddress: publicNodeAddress,
					publicNodePort: publicNodePort
				})
				.then(response => {
					const data = response.data;
					
					resolve(data);
				})
				.catch(error => {
					resolve({isError: true, message: 'error'});
				});
			});
		}
		
		function indexer_addVideoToIndex(data) {
			return new Promise(function(resolve, reject) {
				axios.post(MOARTUBE_INDEXER_HTTP_PROTOCOL + '://' + MOARTUBE_INDEXER_IP + ':' + MOARTUBE_INDEXER_PORT + '/index/video/add', data)
				.then(response => {
					const data = response.data;
					
					resolve(data);
				})
				.catch(error => {
					resolve({isError: true, message: 'error'});
				});
			});
		}
		
		function indexer_removeVideoFromIndex(data) {
			return new Promise(function(resolve, reject) {
				axios.post(MOARTUBE_INDEXER_HTTP_PROTOCOL + '://' + MOARTUBE_INDEXER_IP + ':' + MOARTUBE_INDEXER_PORT + '/index/video/remove', data)
				.then(response => {
					const data = response.data;
					
					resolve(data);
				})
				.catch(error => {
					resolve({isError: true, message: 'error'});
				});
			});
		}
		
		function aliaser_getVideoAlias(videoId, nodeIdentifier, nodeIdentifierProof) {
			return new Promise(function(resolve, reject) {
				axios.get(MOARTUBE_ALIASER_HTTP_PROTOCOL + '://' + MOARTUBE_ALIASER_IP + ':' + MOARTUBE_ALIASER_PORT + '/alias/video', {
				  params: {
					  videoId: videoId,
					  nodeIdentifier: nodeIdentifier,
					  nodeIdentifierProof: nodeIdentifierProof
				  }
				})
				.then(response => {
					const data = response.data;
					
					resolve(data);
				})
				.catch(error => {
					resolve({isError: true, message: 'error'});
				});
			});
		}
		
		function aliaser_doAliasVideo(data) {
			return new Promise(function(resolve, reject) {
				axios.post(MOARTUBE_ALIASER_HTTP_PROTOCOL + '://' + MOARTUBE_ALIASER_IP + ':' + MOARTUBE_ALIASER_PORT + '/alias/video', data)
				.then(response => {
					const data = response.data;
					
					resolve(data);
				})
				.catch(error => {
					resolve({isError: true, message: 'error'});
				});
			});
		}
		
		function indexer_doNodePersonalizeUpdate(nodeIdentifier, nodeIdentifierProof, nodeName, nodeAbout, nodeId) {
			return new Promise(function(resolve, reject) {
				axios.post(MOARTUBE_INDEXER_HTTP_PROTOCOL + '://' + MOARTUBE_INDEXER_IP + ':' + MOARTUBE_INDEXER_PORT + '/index/node/personalize/update', {
					nodeIdentifier: nodeIdentifier,
					nodeIdentifierProof: nodeIdentifierProof,
					nodeName: nodeName,
					nodeAbout: nodeAbout,
					nodeId: nodeId,
				})
				.then(response => {
					const data = response.data;
					
					resolve(data);
				})
				.catch(error => {
					logDebugMessageToConsole('', new Error(error).stack, true);

					resolve({isError: true, message: 'error'});
				});
			});
		}
		
		function indexer_getCaptcha(nodeIdentifier, nodeIdentifierProof) {
			return new Promise(function(resolve, reject) {
				axios.get(MOARTUBE_INDEXER_HTTP_PROTOCOL + '://' + MOARTUBE_INDEXER_IP + ':' + MOARTUBE_INDEXER_PORT + '/captcha', {
				  params: {
					  nodeIdentifier: nodeIdentifier,
					  nodeIdentifierProof: nodeIdentifierProof
				  },
				  responseType: 'stream'
				})
				.then(response => {
					const data = response.data;
					
					resolve(data);
				})
				.catch(error => {
					logDebugMessageToConsole('', new Error(error).stack, true);

					resolve({isError: true, message: 'error'});
				});
			});
		}
		
		function aliaser_getCaptcha(nodeIdentifier, nodeIdentifierProof) {
			return new Promise(function(resolve, reject) {
				axios.get(MOARTUBE_ALIASER_HTTP_PROTOCOL + '://' + MOARTUBE_ALIASER_IP + ':' + MOARTUBE_ALIASER_PORT + '/captcha', {
				  params: {
					  nodeIdentifier: nodeIdentifier,
					  nodeIdentifierProof: nodeIdentifierProof
				  },
				  responseType: 'stream'
				})
				.then(response => {
					const data = response.data;
					
					resolve(data);
				})
				.catch(error => {
					logDebugMessageToConsole('', new Error(error).stack, true);

					resolve({isError: true, message: 'error'});
				});
			});
		}
		
		
		
		
		
		
		
		
		
		
		
		function getDatabase() {
			return new Promise(function(resolve, reject) {
				const database = new sqlite3.Database(path.join(__dirname, '/public/db/node_db.sqlite'), function(error) {
					if (error) {
						logDebugMessageToConsole('', new Error(error).stack, true);
						
						reject();
					}
					else {
						database.run('PRAGMA journal_mode=WAL', function (error) {
							if (error) {
								logDebugMessageToConsole('', new Error(error).stack, true);
								
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

function logDebugMessageToConsole(message, stackTrace, isLoggingToFile) {
	process.send({ cmd: 'message_log', message: message, stackTrace: stackTrace, isLoggingToFile: isLoggingToFile });
}

function generateVideoId() {
	const characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-';
	const length = 11;
	
	let result = '';
	let hyphenCount = 0;
	let underscoreCount = 0;

	do {
		result = '';
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
			result += randomChar;
		}
	} while (hyphenCount > 1 || underscoreCount > 1);

	return result;
}

function indexer_performNodeIdentification() {
	return new Promise(function(resolve, reject) {
		logDebugMessageToConsole('validating node to MoarTube network', '', true);
		
		if (!fs.existsSync(path.join(__dirname, '/_node_identification.json'))) {
			fs.writeFileSync(path.join(__dirname, '/_node_identification.json'), JSON.stringify({nodeIdentifier: '', nodeIdentifierProof: ''}));
		}
		
		const nodeIdentification = getNodeIdentification();
	
		const nodeIdentifier = nodeIdentification.nodeIdentifier;
		const nodeIdentifierProof = nodeIdentification.nodeIdentifierProof;
		
		if(nodeIdentifier === '' && nodeIdentifierProof === '') {
			logDebugMessageToConsole('this node is unidentified, creating node identification', '', true);
			
			indexer_getNodeIdentification()
			.then(indexerResponseData => {
				if(indexerResponseData.isError) {
					logDebugMessageToConsole(indexerResponseData.message, new Error().stack, true);
					
					reject(indexerResponseData.message);
				}
				else {
					nodeIdentification.nodeIdentifier = indexerResponseData.nodeIdentifier;
					nodeIdentification.nodeIdentifierProof = indexerResponseData.nodeIdentifierProof;
					
					fs.writeFileSync(path.join(__dirname, '/_node_identification.json'), JSON.stringify(nodeIdentification));

					logDebugMessageToConsole('node identification successful', '', true);
					
					resolve();
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);

				reject(error);
			});
		}
		else {
			logDebugMessageToConsole('node identification found, validating node identification', '', true);
			
			indexer_doNodeIdentificationRefresh(nodeIdentifier, nodeIdentifierProof)
			.then(indexerResponseData => {
				if(indexerResponseData.isError) {
					reject(indexerResponseData.message);
				}
				else {
					logDebugMessageToConsole('node identification valid', '', true);
					
					nodeIdentification.nodeIdentifierProof = indexerResponseData.nodeIdentifierProof;
					
					fs.writeFileSync(path.join(__dirname, '/_node_identification.json'), JSON.stringify(nodeIdentification));
					
					resolve();
				}
			})
			.catch(error => {
				logDebugMessageToConsole('', new Error(error).stack, true);

				reject(error);
			});
		}
	});
}

function indexer_getNodeIdentification() {
	return new Promise(function(resolve, reject) {
		axios.get(MOARTUBE_INDEXER_HTTP_PROTOCOL + '://' + MOARTUBE_INDEXER_IP + ':' + MOARTUBE_INDEXER_PORT + '/node/identification')
		.then(response => {
			const data = response.data;
			
			resolve(data);
		})
		.catch(error => {
			resolve({isError: true, message: 'error'});
		});
	});
}

function indexer_doNodeIdentificationRefresh(nodeIdentifier, nodeIdentifierProof) {
	return new Promise(function(resolve, reject) {
		axios.get(MOARTUBE_INDEXER_HTTP_PROTOCOL + '://' + MOARTUBE_INDEXER_IP + ':' + MOARTUBE_INDEXER_PORT + '/node/identification/refresh', {
		  params: {
			  nodeIdentifier: nodeIdentifier,
			  nodeIdentifierProof: nodeIdentifierProof
		  }
		})
		.then(response => {
			const data = response.data;
			
			resolve(data);
		})
		.catch(error => {
			resolve({isError: true, message: 'error'});
		});
	});
}

function indexer_doIndexUpdate(nodeIdentifier, nodeIdentifierProof, videoId, title, tags, views, isStreaming, lengthSeconds) {
	return new Promise(function(resolve, reject) {
		axios.post(MOARTUBE_INDEXER_HTTP_PROTOCOL + '://' + MOARTUBE_INDEXER_IP + ':' + MOARTUBE_INDEXER_PORT + '/index/video/update', {
			nodeIdentifier: nodeIdentifier,
			nodeIdentifierProof: nodeIdentifierProof,
			videoId: videoId,
			title: title,
			tags: tags,
			views: views,
			isStreaming: isStreaming,
			lengthSeconds: lengthSeconds
		})
		.then(response => {
			const data = response.data;
			
			resolve(data);
		})
		.catch(error => {
			resolve({isError: true, message: 'error'});
		});
	});
}

function getNodeIdentification() {
	if (fs.existsSync(path.join(__dirname, '/_node_identification.json'))) {
		const nodeIdentification = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_identification.json'), 'utf8'));
		
		return nodeIdentification;
	}
	else {
		return null;
	}
}

function loadConfig() {
	CONFIG_FILE_NAME = 'config.json';
	
	const config = JSON.parse(fs.readFileSync(path.join(__dirname, CONFIG_FILE_NAME), 'utf8'));
	
	MOARTUBE_NODE_HTTP_PORT = config.nodeConfig.httpPort;
	
	MOARTUBE_INDEXER_HTTP_PROTOCOL = config.indexerConfig.httpProtocol;
	MOARTUBE_INDEXER_IP = config.indexerConfig.host;
	MOARTUBE_INDEXER_PORT = config.indexerConfig.port;
	
	MOARTUBE_ALIASER_HTTP_PROTOCOL = config.aliaserConfig.httpProtocol;
	MOARTUBE_ALIASER_IP = config.aliaserConfig.host;
	MOARTUBE_ALIASER_PORT = config.aliaserConfig.port;
	
	if(!fs.existsSync(path.join(__dirname, '/_node_settings.json'))) {
		fs.writeFileSync(path.join(__dirname, '/_node_settings.json'), JSON.stringify({
			"isNodeConfigured":false,
			"isNodeConfigurationSkipped":false,
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
		}));
	}
	
	const nodeSettings = JSON.parse(fs.readFileSync(path.join(__dirname, '/_node_settings.json'), 'utf8'));
	
	EXPRESS_SESSION_NAME = nodeSettings.expressSessionName;
	EXPRESS_SESSION_SECRET = nodeSettings.expressSessionSecret;
}