const axios = require('axios').default;
const path = require('path');
const fs = require('fs');

const { logDebugMessageToConsole } = require('./logger');
const { getNodeSettings, setNodeSettings } = require('../utils/helpers');
const { getVideosDirectoryPath } = require('../utils/paths');

function cloudflare_validate(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey) {
    return new Promise(function(resolve, reject) {
        axios.get('https://api.cloudflare.com/client/v4/zones/' + cloudflareZoneId, {
            headers: {
                'X-Auth-Email': cloudflareEmailAddress,
                'X-Auth-Key': cloudflareGlobalApiKey
            }
        })
        .then(response => {
            const data = response.data;
            
            resolve(data);
        })
        .catch(error => {
            logDebugMessageToConsole(null, error, new Error().stack, true);
            
            resolve({isError: true, message: 'error'});
        });
    });
}

function cloudflare_purgeEntireCache() {
    return new Promise(function(resolve, reject) {
        const nodeSettings = getNodeSettings();

        const cloudflareEmailAddress = nodeSettings.cloudflareEmailAddress;
        const cloudflareZoneId = nodeSettings.cloudflareZoneId;
        const cloudflareGlobalApiKey = nodeSettings.cloudflareGlobalApiKey;

        if (cloudflareEmailAddress !== '' && cloudflareZoneId !== '' && cloudflareGlobalApiKey !== '') {
            axios.post('https://api.cloudflare.com/client/v4/zones/' + cloudflareZoneId + '/purge_cache', {
                purge_everything: true
            }, {
                headers: {
                    'X-Auth-Email': cloudflareEmailAddress,
                    'X-Auth-Key': cloudflareGlobalApiKey
                }
            })
            .then(response => {
                const data = response.data;

                if(data.success) {
                    logDebugMessageToConsole('cloudflare_purgeEntireCache success', null, null, true);

                    resolve();
                }
                else {
                    reject('could not purge the cloudflare cache: ' + JSON.stringify(data.errors));
                }
            })
            .catch(error => {
                logDebugMessageToConsole(null, error, new Error().stack, true);
                
                reject('an error occurred while purging the cloudflare cache');
            });
        }
        else {
            reject('could not purge the Cloudflare cache; the node is currently not configured to use Cloudflare');
        }
    });
}

function cloudflare_purgeCache(files, source) {
    const filesofFiles = formatFilesParameter(files);

    const nodeSettings = getNodeSettings();

    const cloudflareEmailAddress = nodeSettings.cloudflareEmailAddress;
    const cloudflareZoneId = nodeSettings.cloudflareZoneId;
    const cloudflareGlobalApiKey = nodeSettings.cloudflareGlobalApiKey;

    if (cloudflareEmailAddress !== '' && cloudflareZoneId !== '' && cloudflareGlobalApiKey !== '') {
        const axiosPromises = filesofFiles.map(files => {
            const filesJson = JSON.stringify(files);

            return axios.post(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/purge_cache`, {
                files: files
            }, {
                headers: {
                    'X-Auth-Email': cloudflareEmailAddress,
                    'X-Auth-Key': cloudflareGlobalApiKey
                }
            })
            .then(response => {
                const data = response.data;

                if(data.success) {
                    logDebugMessageToConsole(source + ' success: ' + filesJson, null, null, true);
                }
                else {
                    logDebugMessageToConsole(source + ' failed: ' + filesJson, null, null, true);
                }

                return { status: 'fulfilled' };
            })
            .catch(error => {
                logDebugMessageToConsole(source + ' error: ' + filesJson, error, new Error().stack, true);

                return { status: 'rejected' };
            });
        });

        return Promise.allSettled(axiosPromises);
    } 
    else {
        return Promise.resolve([]);
    }
}

function cloudflare_purgeVideo(videoId, format, resolution) {
    return new Promise(function(resolve, reject) {
        const nodeBaseUrl = getNodebaseUrl();

        var files = [];

        if(format === 'm3u8') {
            files.push(`${nodeBaseUrl}/assets/videos/${videoId}/adaptive/static/m3u8/manifests/manifest-master.m3u8`);
            files.push(`${nodeBaseUrl}/assets/videos/${videoId}/adaptive/static/m3u8/manifests/manifest-${resolution}.m3u8`);

            files.push(`${nodeBaseUrl}/assets/videos/${videoId}/adaptive/dynamic/m3u8/manifests/manifest-master.m3u8`);
            files.push(`${nodeBaseUrl}/assets/videos/${videoId}/adaptive/dynamic/m3u8/manifests/manifest-${resolution}.m3u8`);

            const adaptiveVideoDirectory = path.join(getVideosDirectoryPath(), videoId + '/adaptive/m3u8/' + resolution);

            const items = fs.readdirSync(adaptiveVideoDirectory);

            files = files.concat(Array.from({ length: items.length }, (_, i) => `${nodeBaseUrl}/assets/videos/${videoId}/adaptive/m3u8/${resolution}/segments/segment-${resolution}-${i}.ts`));
        }
        else if(format === 'mp4' || format === 'webm' || format === 'ogv') {
            files.push(`${nodeBaseUrl}/assets/videos/${videoId}/progressive/${format}/${resolution}`);
        }

        cloudflare_purgeCache(files, 'cloudflare_purgeVideo')
        .then(() => {
            resolve();
        })
        .catch(error => {
            reject(error);
        });
    });
}

function cloudflare_purgeAdaptiveVideos(videoIds) {
    return new Promise(function(resolve, reject) {
        const nodeBaseUrl = getNodebaseUrl();

        var files = [];

        for(const videoId of videoIds) {
            const adaptiveVideosDirectory = path.join(getVideosDirectoryPath(), videoId + '/adaptive');
            const adaptiveM3u8Directory = path.join(adaptiveVideosDirectory, 'm3u8');

            files.push(`${nodeBaseUrl}/assets/videos/${videoId}/adaptive/static/m3u8/manifests/manifest-master.m3u8`);
            files.push(`${nodeBaseUrl}/assets/videos/${videoId}/adaptive/dynamic/m3u8/manifests/manifest-master.m3u8`);

            const entries = fs.readdirSync(adaptiveM3u8Directory);

            for (const entry of entries) {
                const entryPath = path.join(adaptiveM3u8Directory, entry);

                if (fs.statSync(entryPath).isDirectory()) {
                    files.push(`${nodeBaseUrl}/assets/videos/${videoId}/adaptive/static/m3u8/manifests/manifest-${entry}.m3u8`);
                    files.push(`${nodeBaseUrl}/assets/videos/${videoId}/adaptive/dynamic/m3u8/manifests/manifest-${entry}.m3u8`);

                    const items = fs.readdirSync(entryPath);

                    files = files.concat(Array.from({ length: items.length }, (_, i) => `${nodeBaseUrl}/assets/videos/${videoId}/adaptive/m3u8/${entry}/segments/segment-${entry}-${i}.ts`));
                }
            }
        }

        cloudflare_purgeCache(files, 'cloudflare_purgeAdaptiveVideos')
        .then(() => {
            resolve();
        })
        .catch(error => {
            reject(error);
        });
    });
}

function cloudflare_purgeProgressiveVideos(videoIds) {
    return new Promise(function(resolve, reject) {
        const nodeBaseUrl = getNodebaseUrl();

        var files = [];

        for(const videoId of videoIds) {
            const progressiveVideosDirectory = path.join(getVideosDirectoryPath(), videoId + '/progressive');

            const entries = fs.readdirSync(progressiveVideosDirectory);

            for (const entry of entries) {
                const entryPath = path.join(progressiveVideosDirectory, entry);

                const items = fs.readdirSync(entryPath);

                for (const item of items) {
                    if (fs.statSync(entryPath).isDirectory()) {
                        files.push(`${nodeBaseUrl}/assets/videos/${videoId}/progressive/${entry}/${item}`);
                    }
                }
            }
        }

        cloudflare_purgeCache(files, 'cloudflare_purgeProgressiveVideos')
        .then(() => {
            resolve();
        })
        .catch(error => {
            reject(error);
        });
    });
}

function cloudflare_purgeWatchPages(videoIds) {
    return new Promise(function(resolve, reject) {
        const nodeBaseUrl = getNodebaseUrl();

        const files = [];

        for(const videoId of videoIds) {
            files.push(`${nodeBaseUrl}/watch?v=${videoId}`);
        }

        cloudflare_purgeCache(files, 'cloudflare_purgeWatchPages')
        .then(() => {
            resolve();
        })
        .catch(error => {
            reject(error);
        });
    });
}

function cloudflare_purgeEmbedVideoPages(videoIds) {
    return new Promise(function(resolve, reject) {
        const nodeBaseUrl = getNodebaseUrl();

        const files = [];

        for(const videoId of videoIds) {
            files.push(`${nodeBaseUrl}/watch/embed/video/${videoId}`);
            files.push(`${nodeBaseUrl}/watch/embed/video/${videoId}?autostart=0`);
            files.push(`${nodeBaseUrl}/watch/embed/video/${videoId}?autostart=1`);
        }

        cloudflare_purgeCache(files, 'cloudflare_purgeEmbedVideoPages')
        .then(() => {
            resolve();
        })
        .catch(error => {
            reject(error);
        });
    });
}

function cloudflare_purgeNodePage(tags) {
    return new Promise(function(resolve, reject) {
        const nodeBaseUrl = getNodebaseUrl();

        const files = [];

        files.push(`${nodeBaseUrl}/node`);
        files.push(`${nodeBaseUrl}/node?searchTerm=&sortTerm=latest&tagTerm=`);
        files.push(`${nodeBaseUrl}/node?searchTerm=&sortTerm=popular&tagTerm=`);
        files.push(`${nodeBaseUrl}/node?searchTerm=&sortTerm=oldest&tagTerm=`);

        /*
        files.push(`${nodeBaseUrl}/node/`);
        files.push(`${nodeBaseUrl}/node/?searchTerm=&sortTerm=latest&tagTerm=`);
        files.push(`${nodeBaseUrl}/node/?searchTerm=&sortTerm=popular&tagTerm=`);
        files.push(`${nodeBaseUrl}/node/?searchTerm=&sortTerm=oldest&tagTerm=`);
        */

        for(const tag of tags) {
            files.push(`${nodeBaseUrl}/node?searchTerm=&sortTerm=latest&tagTerm=${tag}`);
            files.push(`${nodeBaseUrl}/node?searchTerm=&sortTerm=popular&tagTerm=${tag}`);
            files.push(`${nodeBaseUrl}/node?searchTerm=&sortTerm=oldest&tagTerm=${tag}`);

            /*
            files.push(`${nodeBaseUrl}/node/?searchTerm=&sortTerm=latest&tagTerm=${tag}`);
            files.push(`${nodeBaseUrl}/node/?searchTerm=&sortTerm=popular&tagTerm=${tag}`);
            files.push(`${nodeBaseUrl}/node/?searchTerm=&sortTerm=oldest&tagTerm=${tag}`);
            */
        }
        
        cloudflare_purgeCache(files, 'cloudflare_purgeNodePage')
        .then(() => {
            resolve();
        })
        .catch(error => {
            reject(error);
        });
    });
}

function cloudflare_purgeNodeImages() {
    return new Promise(function(resolve, reject) {
        const nodeBaseUrl = getNodebaseUrl();

        const files = [];

        files.push(`${nodeBaseUrl}/assets/resources/images/icon.png`);
        files.push(`${nodeBaseUrl}/assets/resources/images/avatar.png`);
        files.push(`${nodeBaseUrl}/assets/resources/images/banner.png`);

        cloudflare_purgeCache(files, 'cloudflare_purgeNodeImages')
        .then(() => {
            resolve();
        })
        .catch(error => {
            reject(error);
        });
    });

}

function cloudflare_purgeVideoThumbnailImages(videoIds) {
    return new Promise(function(resolve, reject) {
        const nodeBaseUrl = getNodebaseUrl();

        const files = [];

        for(const videoId of videoIds) {
            files.push(`${nodeBaseUrl}/assets/videos/${videoId}/thumbnail`);
        }

        cloudflare_purgeCache(files, 'cloudflare_purgeVideoThumbnailImages')
        .then(() => {
            resolve();
        })
        .catch(error => {
            reject(error);
        });
    });
}

function cloudflare_purgeVideoPreviewImages(videoIds) {
    return new Promise(function(resolve, reject) {
        const nodeBaseUrl = getNodebaseUrl();

        const files = [];

        for(const videoId of videoIds) {
            files.push(`${nodeBaseUrl}/assets/videos/${videoId}/preview`);
        }

        cloudflare_purgeCache(files, 'cloudflare_purgeVideoPreviewImages')
        .then(() => {
            resolve();
        })
        .catch(error => {
            reject(error);
        });
    });
}

function cloudflare_purgeVideoPosterImages(videoIds) {
    return new Promise(function(resolve, reject) {
        const nodeBaseUrl = getNodebaseUrl();

        const files = [];

        for(const videoId of videoIds) {
            files.push(`${nodeBaseUrl}/assets/videos/${videoId}/poster`);
        }

        cloudflare_purgeCache(files, 'cloudflare_purgeVideoPosterImages')
        .then(() => {
            resolve();
        })
        .catch(error => {
            reject(error);
        });
    });
}

function cloudflare_setConfiguration(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey) {
    return new Promise(async function(resolve, reject) {
        try {
            logDebugMessageToConsole('setting Cloudflare configuration for MoarTube Node', null, null, true);
            
            const headers = {
                'X-Auth-Email': cloudflareEmailAddress,
                'X-Auth-Key': cloudflareGlobalApiKey
            };

            try {
                await cloudflare_resetIntegration();
            }
            catch(error) {
                logDebugMessageToConsole(null, error, new Error().stack, true);
            }


            // step 1: create new http_request_cache_settings phase rule set in the zone and initialize it with rules

            logDebugMessageToConsole('creating zone http_request_cache_settings phase rule set', null, null, true);

            const newZoneRuleSet = {
                "rules": [
                    {
                        "description": "Node Assets - Video",
                        "action": "set_cache_settings",
                        "enabled": true,
                        "expression": "(starts_with(http.request.uri, \"/assets/video\"))",
                        "action_parameters": {
                            "cache": true,
                            "edge_ttl": {
                                "mode": "override_origin",
                                "default": 31536000
                            },
                            "browser_ttl": {
                                "mode": "override_origin",
                                "default": 28800
                            }
                        }
                    },
                    {
                        "description": "Node Assets - JavaScript, CSS, Images",
                        "action": "set_cache_settings",
                        "enabled": true,
                        "expression": "(starts_with(http.request.uri, \"/assets/resources/javascript\")) or (starts_with(http.request.uri, \"/assets/resources/css\")) or (starts_with(http.request.uri, \"/assets/resources/images\"))",
                        "action_parameters": {
                            "cache": true,
                            "edge_ttl": {
                                "mode": "override_origin",
                                "default": 86400
                            },
                            "browser_ttl": {
                                "mode": "override_origin",
                                "default": 86400
                            }
                        }
                    },
                    {
                        "description": "Node Watch - Watch Page for Displaying a Video",
                        "action": "set_cache_settings",
                        "enabled": true,
                        "expression": "(starts_with(http.request.uri, \"/watch\"))",
                        "action_parameters": {
                            "cache": true,
                            "edge_ttl": {
                                "mode": "override_origin",
                                "default": 86400
                            }
                        }
                    },
                    {
                        "description": "Node Search - Cache Searches on the Node Page, but bypass if searchTerm is specified",
                        "action": "set_cache_settings",
                        "enabled": true,
                        "expression": "(starts_with(http.request.uri, \"/node/search?searchTerm=&sortTerm\"))",
                        "action_parameters": {
                            "cache": true,
                            "edge_ttl": {
                                "mode": "override_origin",
                                "default": 86400
                            }
                        }
                    },
                    {
                        "description": "Node Page - Cache for Different Variations of the Node Page, but bypass if searchTerm is specified",
                        "action": "set_cache_settings",
                        "enabled": true,
                        "expression": "(starts_with(http.request.uri, \"/node\")) or (starts_with(http.request.uri, \"/node?searchTerm=&sortTerm\"))",
                        "action_parameters": {
                            "cache": true,
                            "edge_ttl": {
                                "mode": "override_origin",
                                "default": 86400
                            }
                        }
                    },
                    {
                        "description": "node Assets - Cache Bypass for Live (dynamic) HLS stream manifests",
                        "action": "set_cache_settings",
                        "enabled": true,
                        "expression": "(http.request.uri.path contains \"/adaptive/dynamic/\")",
                        "action_parameters": {
                            "cache": false
                        }
                    },
                ]
            }

            const response_newZoneRuleSet = await axios.put(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/rulesets/phases/http_request_cache_settings/entrypoint`, newZoneRuleSet, { headers });

            if(!response_newZoneRuleSet.data.success) {
                throw new Error('failed to create zone http_request_cache_settings phase rule set');
            }

            const response_newZoneRuleSet_result = response_newZoneRuleSet.data.result;

            logDebugMessageToConsole('created zone http_request_cache_settings phase rule set: ' + JSON.stringify(response_newZoneRuleSet_result), null, null, true);


            // step 2: enable Argo Tiered Caching

            logDebugMessageToConsole('enabling Argo Tiered Caching', null, null, true);

            const tieredCachingData = {
                value: 'on'
            };

            const response_tieredCache = await axios.patch(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/argo/tiered_caching`, tieredCachingData, { headers });

            if(!response_tieredCache.data.success) {
                throw new Error('failed to enable Argo Tiered Caching');
            }

            logDebugMessageToConsole('enabled Argo Tiered Caching: ' + JSON.stringify(response_tieredCache.data), null, null, true);
            
            
            // step 3: enable Tiered Cache Smart Topology

            logDebugMessageToConsole('enabling Tiered Cache Smart Topology', null, null, true);

            const tieredCacheSmartTopologyData = {
                value: 'on'
            };

            const response_tieredCacheSmartTopology = await axios.patch(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/cache/tiered_cache_smart_topology_enable`, tieredCacheSmartTopologyData, { headers });

            if(!response_tieredCacheSmartTopology.data.success) {
                throw new Error('failed to enable Tiered Cache Smart Topology');
            }

            logDebugMessageToConsole('enabled Tiered Cache Smart Topology: ' + JSON.stringify(response_tieredCacheSmartTopology.data), null, null, true);

            
            // step 4: save the configuration

            const nodeSettings = getNodeSettings();
            
            nodeSettings.cloudflareEmailAddress = cloudflareEmailAddress;
            nodeSettings.cloudflareZoneId = cloudflareZoneId;
            nodeSettings.cloudflareGlobalApiKey = cloudflareGlobalApiKey;

            setNodeSettings(nodeSettings);

            logDebugMessageToConsole('successfully set Cloudflare configuration for MoarTube Node', null, null, true);

            resolve();
        }
        catch (error) {
            resolve(error);
        }
    });
}

async function cloudflare_resetIntegration() {
    return new Promise(async function(resolve, reject) {
        try {
            logDebugMessageToConsole('resetting Cloudflare configuration for MoarTube Node', null, null, true);

            const nodeSettings = getNodeSettings();
            
            const cloudflareEmailAddress = nodeSettings.cloudflareEmailAddress;
            const cloudflareZoneId = nodeSettings.cloudflareZoneId;
            const cloudflareGlobalApiKey = nodeSettings.cloudflareGlobalApiKey;

            if (cloudflareEmailAddress !== '' && cloudflareZoneId !== '' && cloudflareGlobalApiKey !== '') {
                const headers = {
                    'X-Auth-Email': cloudflareEmailAddress,
                    'X-Auth-Key': cloudflareGlobalApiKey
                };

                // step 1: get all rule sets in the zone

                logDebugMessageToConsole('retrieving zone rule sets', null, null, true);

                const response_ruleSets = await axios.get(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/rulesets`, { headers });

                if(!response_ruleSets.data.success) {
                    throw new Error('failed to retrieve zone rule sets');
                }

                const response_ruleSets_result = response_ruleSets.data.result;

                logDebugMessageToConsole('discovered zone rule sets: ' + JSON.stringify(response_ruleSets.data), null, null, true);

                
                // step 2: delete all http_request_cache_settings phase rule sets in the zone

                logDebugMessageToConsole('deleting zone http_request_cache_settings phase rule set if discovered', null, null, true);

                for(const ruleSet of response_ruleSets_result) {
                    if(ruleSet.phase === 'http_request_cache_settings') {
                        logDebugMessageToConsole('deleting discovered zone http_request_cache_settings phase rule set: ' + ruleSet.id, null, null, true);

                        const response_deleteRuleSet = await axios.delete(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/rulesets/${ruleSet.id}`, { headers });

                        if(response_deleteRuleSet.status === 204) {
                            logDebugMessageToConsole('deleted discovered zone http_request_cache_settings phase rule set: ' + ruleSet.id, null, null, true);
                        }
                        else {
                            throw new Error('failed to delete zone http_request_cache_settings phase rule set');
                        }
                    }
                }


                // step 3: disable Argo Tiered Caching

                logDebugMessageToConsole('disabling Argo Tiered Caching', null, null, true);

                const tieredCachingData = {
                    value: 'off'
                };

                const response_tieredCache = await axios.patch(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/argo/tiered_caching`, tieredCachingData, { headers });

                if(!response_tieredCache.data.success) {
                    throw new Error('failed to disable Argo Tiered Caching');
                }

                logDebugMessageToConsole('disabled Argo Tiered Caching: ' + JSON.stringify(response_tieredCache.data), null, null, true);
                
                
                // step 4: disable Tiered Cache Smart Topology

                logDebugMessageToConsole('disabling Tiered Cache Smart Topology', null, null, true);

                const tieredCacheSmartTopologyData = {
                    value: 'off'
                };

                const response_tieredCacheSmartTopology = await axios.patch(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/cache/tiered_cache_smart_topology_enable`, tieredCacheSmartTopologyData, { headers });

                if(!response_tieredCacheSmartTopology.data.success) {
                    throw new Error('failed to disable Tiered Cache Smart Topology');
                }

                logDebugMessageToConsole('disabled Tiered Cache Smart Topology: ' + JSON.stringify(response_tieredCacheSmartTopology.data), null, null, true);


                // step 5: save the configuration
                
                nodeSettings.cloudflareEmailAddress = '';
                nodeSettings.cloudflareZoneId = '';
                nodeSettings.cloudflareGlobalApiKey = '';

                setNodeSettings(nodeSettings);

                logDebugMessageToConsole('successfully reset Cloudflare configuration for MoarTube Node', null, null, true);

                resolve();
            }
            else {
                reject('could not reset the Cloudflare integration; the node is currently not configured to use Cloudflare');
            }
        }
        catch (error) {
            reject(error);
        }
    });
}

function getNodebaseUrl() {
    const nodeSettings = getNodeSettings();

    const publicNodeProtocol = nodeSettings.publicNodeProtocol;
    const publicNodeAddress = nodeSettings.publicNodeAddress;
    var publicNodePort = nodeSettings.publicNodePort;

    if(publicNodeProtocol === 'http') {
        publicNodePort = publicNodePort == 80 ? '' : ':' + publicNodePort;
    } 
    else if(publicNodeProtocol === 'https') {
        publicNodePort = publicNodePort == 443 ? '' : ':' + publicNodePort;
    }

    const nodeBaseUrl = publicNodeProtocol + '://' + publicNodeAddress + publicNodePort;

    return nodeBaseUrl;
}

function formatFilesParameter(files) {
    const maxSize = 30; // cloudflare purges are a maximum of 30 files at a time

    // divide the array of files into an array of arrays of files, each array with a maximum length of maxSize
    return Array.from({ length: Math.ceil(files.length / maxSize) }, (v, i) => files.slice(i * maxSize, i * maxSize + maxSize));
}

module.exports = {
    cloudflare_validate,
    cloudflare_purgeEntireCache,
    cloudflare_purgeWatchPages,
    cloudflare_purgeVideo,
    cloudflare_purgeAdaptiveVideos,
    cloudflare_purgeProgressiveVideos,
    cloudflare_purgeEmbedVideoPages,
    cloudflare_purgeNodePage,
    cloudflare_purgeNodeImages,
    cloudflare_purgeVideoThumbnailImages,
    cloudflare_purgeVideoPreviewImages,
    cloudflare_purgeVideoPosterImages,
    cloudflare_setConfiguration,
    cloudflare_resetIntegration
};