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