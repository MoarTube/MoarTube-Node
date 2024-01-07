const axios = require('axios').default;
const path = require('path');
const fs = require('fs');

const { logDebugMessageToConsole } = require('./logger');
const { getNodeSettings } = require('../utils/helpers');
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
    });
}

function cloudflare_purgeCache(files) {
    const filesofFiles = formatFilesParameter(files);
    const nodeSettings = getNodeSettings();

    const cloudflareEmailAddress = nodeSettings.cloudflareEmailAddress;
    const cloudflareZoneId = nodeSettings.cloudflareZoneId;
    const cloudflareGlobalApiKey = nodeSettings.cloudflareGlobalApiKey;

    if (cloudflareEmailAddress !== '' && cloudflareZoneId !== '' && cloudflareGlobalApiKey !== '') {
        const axiosPromises = filesofFiles.map(files => {
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
                    logDebugMessageToConsole('cloudflare_purgeCache success', null, null, true);
                }
                else {
                    logDebugMessageToConsole('cloudflare_purgeCache failed', null, null, true);
                }

                return { status: 'fulfilled' };
            })
            .catch(error => {
                logDebugMessageToConsole('cloudflare_purgeCache error', error, new Error().stack, true);

                return { status: 'rejected' };
            });
        });

        return Promise.allSettled(axiosPromises);
    } 
    else {
        return Promise.resolve([]);
    }
}

function cloudflare_purgeWatchPages(videoIds) {
    return new Promise(function(resolve, reject) {
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

        const files = [];

        for(const videoId of videoIds) {
            files.push(publicNodeProtocol + '://' + publicNodeAddress + publicNodePort + '/watch?v=' + videoId);
        }

        cloudflare_purgeCache(files)
        .then(() => {
            resolve();
        })
        .catch(error => {
            reject(error);
        });
    });
}

function cloudflare_purgeVideo(videoId, format, resolution) {
    return new Promise(function(resolve, reject) {
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

        cloudflare_purgeCache(files)
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

        cloudflare_purgeCache(files)
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

        cloudflare_purgeCache(files)
        .then(() => {
            resolve();
        })
        .catch(error => {
            reject(error);
        });
    });
}



function cloudflare_purgePreviewImages(videoIds) {
    return new Promise(function(resolve, reject) {
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

        const files = [];

        for(const videoId of videoIds) {
            files.push(publicNodeProtocol + '://' + publicNodeAddress + publicNodePort + '/assets/videos/' + videoId + '/preview');
        }

        cloudflare_purgeCache(files)
        .then(() => {
            resolve();
        })
        .catch(error => {
            reject(error);
        });
    });
}

function cloudflare_purgePosterImages(videoIds) {
    return new Promise(function(resolve, reject) {
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

        const files = [];

        for(const videoId of videoIds) {
            files.push(publicNodeProtocol + '://' + publicNodeAddress + publicNodePort + '/assets/videos/' + videoId + '/poster');
        }

        cloudflare_purgeCache(files)
        .then(() => {
            resolve();
        })
        .catch(error => {
            reject(error);
        });
    });
}

function cloudflare_setDefaultConfiguration() {
    return new Promise(async function(resolve, reject) {
        try {
            logDebugMessageToConsole('setting Cloudflare configuration for MoarTube Node', null, null, true);

            const nodeSettings = getNodeSettings();

            const cloudflareEmailAddress = nodeSettings.cloudflareEmailAddress;
            const cloudflareZoneId = nodeSettings.cloudflareZoneId;
            const cloudflareGlobalApiKey = nodeSettings.cloudflareGlobalApiKey;

            const publicNodeProtocol = nodeSettings.publicNodeProtocol;
            const publicNodeAddress = nodeSettings.publicNodeAddress;
            var publicNodePort = nodeSettings.publicNodePort;

            if(publicNodeProtocol === 'http') {
                publicNodePort = publicNodePort == 80 ? '' : ':' + publicNodePort;
            } 
            else if(publicNodeProtocol === 'https') {
                publicNodePort = publicNodePort == 443 ? '' : ':' + publicNodePort;
            }

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

            
            // step 3: create new http_request_cache_settings phase rule set in the zone and initialize it with rules

            logDebugMessageToConsole('creating zone http_request_cache_settings phase rule set', null, null, true);

            const newZoneRuleSet = {
                "rules": [
                    {
                        "description": "MoarTube Node - Cache Bypass for Live (dynamic) HLS stream manifests",
                        "action": "set_cache_settings",
                        "enabled": true,
                        "expression": "(http.request.uri.path contains \"/adaptive/dynamic/\")",
                        "action_parameters": {
                            "cache": false
                        }
                    }
                ]
            }

            const response_newZoneRuleSet = await axios.put(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/rulesets/phases/http_request_cache_settings/entrypoint`, newZoneRuleSet, { headers });

            if(!response_newZoneRuleSet.data.success) {
                throw new Error('failed to create zone http_request_cache_settings phase rule set');
            }

            const response_newZoneRuleSet_result = response_newZoneRuleSet.data.result;

            logDebugMessageToConsole('created zone http_request_cache_settings phase rule set: ' + JSON.stringify(response_newZoneRuleSet_result), null, null, true);

            
            // step 4: get all current page rules

            logDebugMessageToConsole('retrieving existing page rules', null, null, true);

            const response_pageRules = await axios.get(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/pagerules`, { headers });

            if(!response_pageRules.data.success) {
                throw new Error('failed to retrieve page rule(s)');
            }

            const pageRules = response_pageRules.data.result;

            logDebugMessageToConsole('discovered existing pages rules: ' + JSON.stringify(response_pageRules.data), null, null, true);

           
            // step 5: delete all current page rules

            logDebugMessageToConsole('deleting existing page rules', null, null, true);

            for(const pageRule of pageRules) {
                const response = await axios.delete(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/pagerules/${pageRule.id}`, { headers });

                if(!response.data.success) {
                    throw new Error('Failed to delete page rule(s)');
                }

                logDebugMessageToConsole('deleted existing page rule: ' + JSON.stringify(response.data), null, null, true);
            }

            
            // step 6: create new page rules

            logDebugMessageToConsole('creating new page rules', null, null, true);

            const newPageRules = [
                { "status": "active", "priority": 1, "actions": [ { "id": "cache_level", "value": "cache_everything" }, { "id": "edge_cache_ttl", "value": 7200 } ], "targets": [ { "target": "url", "constraint": { "operator": "matches", "value": `${publicNodeProtocol}://*${publicNodeAddress}${publicNodePort}/node` } } ] },
                { "status": "active", "priority": 2, "actions": [ { "id": "cache_level", "value": "cache_everything" }, { "id": "edge_cache_ttl", "value": 7200 } ], "targets": [ { "target": "url", "constraint": { "operator": "matches", "value": `${publicNodeProtocol}://*${publicNodeAddress}${publicNodePort}/watch*` } } ] },
                { "status": "active", "priority": 3, "actions": [ { "id": "cache_level", "value": "cache_everything" }, { "id": "edge_cache_ttl", "value": 7200 } ], "targets": [ { "target": "url", "constraint": { "operator": "matches", "value": `${publicNodeProtocol}://*${publicNodeAddress}${publicNodePort}/assets/*` } } ] }
            ];

            for(const newPageRule of newPageRules) {
                const response = await axios.post(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/pagerules`, newPageRule, { headers });

                if(!response.data.success) {
                    throw new Error('failed to create new page rule(s)');
                }

                logDebugMessageToConsole('created new page rule: ' + JSON.stringify(response.data), null, null, true);
            }

            
            // step 7: enable Tiered Caching

            logDebugMessageToConsole('enabling Argo Tiered Caching', null, null, true);

            const tieredCachingData = {
                value: 'on'
            };

            const response_tieredCache = await axios.patch(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/argo/tiered_caching`, tieredCachingData, { headers });

            if(!response_tieredCache.data.success) {
                throw new Error('failed to enable Argo Tiered Caching');
            }

            logDebugMessageToConsole('enabled Argo Tiered Caching: ' + JSON.stringify(response_tieredCache.data), null, null, true);
            
            
            // step 8: enable Tiered Cache Smart Topology

            logDebugMessageToConsole('enabling Tiered Cache Smart Topology', null, null, true);

            const tieredCacheSmartTopologyData = {
                value: 'on'
            };

            const response_tieredCacheSmartTopology = await axios.patch(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/cache/tiered_cache_smart_topology_enable`, tieredCacheSmartTopologyData, { headers });

            if(!response_tieredCacheSmartTopology.data.success) {
                throw new Error('failed to enable Tiered Cache Smart Topology');
            }

            logDebugMessageToConsole('enabled Tiered Cache Smart Topology: ' + JSON.stringify(response_tieredCacheSmartTopology.data), null, null, true);

            
            // step 9: ...

            
            // step 10: profit


            logDebugMessageToConsole('successfully set Cloudflare configuration for MoarTube Node', null, null, true);

            resolve({isError: false});
        }
        catch (error) {
            logDebugMessageToConsole(null, error, new Error().stack, true);
            
            resolve({isError: true, message: error.message});
        }
    });
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
    cloudflare_purgePreviewImages,
    cloudflare_purgePosterImages,
    cloudflare_setDefaultConfiguration
};