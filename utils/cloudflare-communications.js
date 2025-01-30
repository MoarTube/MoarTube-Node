const axios = require('axios').default;
const path = require('path');
const fs = require('fs');

const { 
    logDebugMessageToConsole 
} = require('./logger');
const { 
    getNodeSettings, setNodeSettings, getIsDeveloperMode, getNodebaseUrl, getExternalVideosBaseUrl, getExternalResourcesBaseUrl 
} = require('../utils/helpers');
const { 
    getVideosDirectoryPath 
} = require('../utils/paths');
const { 
    performDatabaseReadJob_ALL, performDatabaseReadJob_GET 
} = require('../utils/database');
const { 
    s3_listObjectsWithPrefix 
} = require('../utils/s3-communications');

async function cloudflare_purgeWatchPages(videoIds) {
    try {
        const nodeBaseUrl = getNodebaseUrl();

        const files = [];
        for (const videoId of videoIds) {
            files.push(`${nodeBaseUrl}/watch?v=${videoId}`);
        }

        await cloudflare_purgeCache(files, 'cloudflare_purgeWatchPages');
    }
    catch (error) {
        logDebugMessageToConsole(null, error, null);
    }
}

async function cloudflare_purgeAllWatchPages() {
    try {
        const videos = await performDatabaseReadJob_ALL('SELECT video_id FROM videos', []);

        const videoIds = videos.map(video => video.video_id);

        await cloudflare_purgeWatchPages(videoIds);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, null);
    }
}

async function cloudflare_purgeNodePage() {
    try {
        const videos = await performDatabaseReadJob_ALL('SELECT tags FROM videos', []);

        const tags = Array.from(new Set(videos.map(video => video.tags.split(',')).flat()));

        const nodeBaseUrl = getNodebaseUrl();

        const files = [];

        files.push(`${nodeBaseUrl}/node`);

        files.push(`${nodeBaseUrl}/node?searchTerm=&sortTerm=latest&tagTerm=`);
        files.push(`${nodeBaseUrl}/node?searchTerm=&sortTerm=popular&tagTerm=`);
        files.push(`${nodeBaseUrl}/node?searchTerm=&sortTerm=oldest&tagTerm=`);

        files.push(`${nodeBaseUrl}/node/search?searchTerm=&sortTerm=latest&tagTerm=`);
        files.push(`${nodeBaseUrl}/node/search?searchTerm=&sortTerm=popular&tagTerm=`);
        files.push(`${nodeBaseUrl}/node/search?searchTerm=&sortTerm=oldest&tagTerm=`);

        for (const tag of tags) {
            files.push(`${nodeBaseUrl}/node?searchTerm=&sortTerm=latest&tagTerm=${tag}`);
            files.push(`${nodeBaseUrl}/node?searchTerm=&sortTerm=popular&tagTerm=${tag}`);
            files.push(`${nodeBaseUrl}/node?searchTerm=&sortTerm=oldest&tagTerm=${tag}`);

            files.push(`${nodeBaseUrl}/node/search?searchTerm=&sortTerm=latest&tagTerm=${tag}`);
            files.push(`${nodeBaseUrl}/node/search?searchTerm=&sortTerm=popular&tagTerm=${tag}`);
            files.push(`${nodeBaseUrl}/node/search?searchTerm=&sortTerm=oldest&tagTerm=${tag}`);
        }

        await cloudflare_purgeCache(files, 'cloudflare_purgeNodePage');
    }
    catch (error) {
        logDebugMessageToConsole(null, error, null);
    }
}

async function cloudflare_purgeEmbedVideoPages(videoIds) {
    try {
        const nodeBaseUrl = getNodebaseUrl();

        const files = [];
        for (const videoId of videoIds) {
            files.push(`${nodeBaseUrl}/watch/embed/video/${videoId}`);
            files.push(`${nodeBaseUrl}/watch/embed/video/${videoId}?autostart=0`);
            files.push(`${nodeBaseUrl}/watch/embed/video/${videoId}?autostart=1`);
        }

        await cloudflare_purgeCache(files, 'cloudflare_purgeEmbedVideoPages');
    }
    catch (error) {
        logDebugMessageToConsole(null, error, null);
    }
}

async function cloudflare_purgeAllEmbedVideoPages() {
    try {
        const videos = await performDatabaseReadJob_ALL('SELECT video_id FROM videos', []);

        const videoIds = videos.map(video => video.video_id);

        await cloudflare_purgeEmbedVideoPages(videoIds);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, null);
    }
}

async function cloudflare_purgeNodeImages() {
    try {
        const externalResourcesbaseUrl = getExternalResourcesBaseUrl();

        const files = [];

        files.push(`${externalResourcesbaseUrl}/external/resources/images/icon.png`);
        files.push(`${externalResourcesbaseUrl}/external/resources/images/avatar.png`);
        files.push(`${externalResourcesbaseUrl}/external/resources/images/banner.png`);

        await cloudflare_purgeCache(files, 'cloudflare_purgeNodeImages');
    }
    catch (error) {
        logDebugMessageToConsole(null, error, null);
    }
}

async function cloudflare_purgeVideoThumbnailImages(videoIds) {
    try {
        const externalVideosBaseUrl = getExternalVideosBaseUrl();

        const files = [];
        for (const videoId of videoIds) {
            files.push(`${externalVideosBaseUrl}/external/videos/${videoId}/images/thumbnail.jpg`);
        }

        await cloudflare_purgeCache(files, 'cloudflare_purgeVideoThumbnailImages');
    }
    catch (error) {
        logDebugMessageToConsole(null, error, null);
    }
}

async function cloudflare_purgeVideoPreviewImages(videoIds) {
    try {
        const externalVideosBaseUrl = getExternalVideosBaseUrl();

        const files = [];
        for (const videoId of videoIds) {
            files.push(`${externalVideosBaseUrl}/external/videos/${videoId}/images/preview.jpg`);
        }

        await cloudflare_purgeCache(files, 'cloudflare_purgeVideoPreviewImages');
    }
    catch (error) {
        logDebugMessageToConsole(null, error, null);
    }
}

async function cloudflare_purgeVideoPosterImages(videoIds) {
    try {
        const externalVideosBaseUrl = getExternalVideosBaseUrl();

        const files = [];
        for (const videoId of videoIds) {
            files.push(`${externalVideosBaseUrl}/external/videos/${videoId}/images/poster.jpg`);
        }

        await cloudflare_purgeCache(files, 'cloudflare_purgeVideoPosterImages');
    }
    catch (error) {
        logDebugMessageToConsole(null, error, null);
    }
}

async function cloudflare_purgeVideo(videoId, format, resolution) {
    try {
        const nodeSettings = getNodeSettings();
        const externalVideosBaseUrl = getExternalVideosBaseUrl();

        const storageMode = nodeSettings.storageConfig.storageMode;

        const video = await performDatabaseReadJob_GET('SELECT outputs FROM videos WHERE video_id = ?', [videoId]);

        let files = [];

        if (video != null) {
            const outputs = JSON.parse(video.outputs);
            const resolutions = outputs[format];

            if (resolutions.includes(resolution)) {
                if (format === 'm3u8') {
                    files.push(`${externalVideosBaseUrl}/external/videos/${videoId}/adaptive/m3u8/static/manifests/manifest-master.m3u8`);
                    files.push(`${externalVideosBaseUrl}/external/videos/${videoId}/adaptive/m3u8/static/manifests/manifest-${resolution}.m3u8`);

                    files.push(`${externalVideosBaseUrl}/external/videos/${videoId}/adaptive/m3u8/dynamic/manifests/manifest-master.m3u8`);
                    files.push(`${externalVideosBaseUrl}/external/videos/${videoId}/adaptive/m3u8/dynamic/manifests/manifest-${resolution}.m3u8`);

                    if (storageMode === 'filesystem') {
                        const adaptiveM3u8ResolutionDirectory = path.join(getVideosDirectoryPath(), videoId + '/adaptive/m3u8/' + resolution);

                        if (fs.existsSync(adaptiveM3u8ResolutionDirectory)) {
                            const segments = fs.readdirSync(adaptiveM3u8ResolutionDirectory);

                            files = files.concat(Array.from({ length: segments.length }, (_, i) => `${externalVideosBaseUrl}/external/videos/${videoId}/adaptive/m3u8/${resolution}/segments/segment-${resolution}-${i}.ts`));
                        }
                    }
                    else if (storageMode === 's3provider') {
                        const s3Config = nodeSettings.storageConfig.s3Config;
                        const prefix = 'external/videos/' + videoId + '/adaptive/m3u8/' + resolution + '/segments/';

                        const keys = await s3_listObjectsWithPrefix(s3Config, prefix);

                        for (const key of keys) {
                            files.push(`${externalVideosBaseUrl}/${key}`);
                        }
                    }
                }
                else if (format === 'mp4' || format === 'webm' || format === 'ogv') {
                    files.push(`${externalVideosBaseUrl}/external/videos/${videoId}/progressive/${format}/${resolution}.${format}`);
                }
            }
        }

        await cloudflare_purgeCache(files, 'cloudflare_purgeVideo');
    }
    catch (error) {
        logDebugMessageToConsole(null, error, null);
    }
}

async function cloudflare_purgeAdaptiveVideos(videoIds) {
    try {
        const nodeSettings = getNodeSettings();
        const externalVideosBaseUrl = getExternalVideosBaseUrl();

        const storageMode = nodeSettings.storageConfig.storageMode;

        const videos = await performDatabaseReadJob_ALL('SELECT video_id, outputs FROM videos WHERE video_id IN (:videoIds)', { videoIds });

        let files = [];
        for (const video of videos) {
            const videoId = video.video_id;
            const resolutions = JSON.parse(video.outputs).m3u8;

            files.push(`${externalVideosBaseUrl}/external/videos/${videoId}/adaptive/m3u8/static/manifests/manifest-master.m3u8`);
            files.push(`${externalVideosBaseUrl}/external/videos/${videoId}/adaptive/m3u8/dynamic/manifests/manifest-master.m3u8`);

            for (const resolution of resolutions) {
                files.push(`${externalVideosBaseUrl}/external/videos/${videoId}/adaptive/m3u8/static/manifests/manifest-${resolution}.m3u8`);
                files.push(`${externalVideosBaseUrl}/external/videos/${videoId}/adaptive/m3u8/dynamic/manifests/manifest-${resolution}.m3u8`);

                if (storageMode === 'filesystem') {
                    const adaptiveM3u8ResolutionDirectory = path.join(getVideosDirectoryPath(), videoId + '/adaptive/m3u8/' + resolution);

                    if (fs.existsSync(adaptiveM3u8ResolutionDirectory)) {
                        if (fs.statSync(adaptiveM3u8ResolutionDirectory).isDirectory()) {
                            const segments = fs.readdirSync(adaptiveM3u8ResolutionDirectory);

                            files = files.concat(Array.from({ length: segments.length }, (_, i) => `${externalVideosBaseUrl}/external/videos/${videoId}/adaptive/m3u8/${resolution}/segments/segment-${resolution}-${i}.ts`));
                        }
                    }
                }
                else if (storageMode === 's3provider') {
                    const s3Config = nodeSettings.storageConfig.s3Config;

                    const prefix = 'external/videos/' + videoId + '/adaptive/m3u8/' + resolution + '/segments/';

                    const keys = await s3_listObjectsWithPrefix(s3Config, prefix);

                    for (const key of keys) {
                        files.push(`${externalVideosBaseUrl}/${key}`);
                    }
                }
            }
        }

        await cloudflare_purgeCache(files, 'cloudflare_purgeAdaptiveVideos');
    }
    catch (error) {
        logDebugMessageToConsole(null, error, null);
    }
}

async function cloudflare_purgeProgressiveVideos(videoIds) {
    try {
        const nodeSettings = getNodeSettings();
        const externalVideosBaseUrl = getExternalVideosBaseUrl();

        const storageMode = nodeSettings.storageConfig.storageMode;

        const videos = await performDatabaseReadJob_ALL('SELECT video_id, outputs FROM videos WHERE video_id IN (:videoIds)', { videoIds });

        let files = [];
        for (const video of videos) {
            const videoId = video.video_id;
            const outputs = JSON.parse(video.outputs);

            for (const output in outputs) {
                const resolutions = outputs[output];

                for (const resolution of resolutions) {
                    if (storageMode === 'filesystem') {
                        files.push(`${externalVideosBaseUrl}/external/videos/${videoId}/progressive/${output}/${resolution}.${output}`);
                    }
                    else if (storageMode === 's3provider') {
                        const s3Config = nodeSettings.storageConfig.s3Config;

                        const prefix = `external/videos/${videoId}/progressive/${output}`;

                        const keys = await s3_listObjectsWithPrefix(s3Config, prefix);

                        for (const key of keys) {
                            files.push(`${externalVideosBaseUrl}/${key}`);
                        }
                    }
                }

            }
        }

        await cloudflare_purgeCache(files, 'cloudflare_purgeProgressiveVideos');
    }
    catch (error) {
        logDebugMessageToConsole(null, error, null);
    }
}

async function cloudflare_setCdnConfiguration(moartubeNodeIp, cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey) {
    logDebugMessageToConsole('setting Cloudflare CDN configuration for MoarTube Node', null, null);

    const headers = {
        'X-Auth-Email': cloudflareEmailAddress,
        'X-Auth-Key': cloudflareGlobalApiKey
    };

    await cloudflare_resetCdn(moartubeNodeIp);
    
    // step 1: create new http_request_cache_settings phase rule set in the zone and initialize it with rules

    logDebugMessageToConsole('creating zone http_request_cache_settings phase rule set', null, null);

    const newZoneRuleSet = {
        "rules": [
            {
                "description": "Node External - Video",
                "action": "set_cache_settings",
                "enabled": true,
                "expression": "(starts_with(http.request.uri, \"/external/videos\"))",
                "action_parameters": {
                    "cache": true,
                    "edge_ttl": {
                        "mode": "override_origin",
                        "default": 31536000
                    },
                    "browser_ttl": {
                        "mode": "bypass"
                    }
                }
            },
            {
                "description": "Node External - JavaScript, CSS",
                "action": "set_cache_settings",
                "enabled": true,
                "expression": "(starts_with(http.request.uri, \"/external/resources/javascript\")) or (starts_with(http.request.uri, \"/external/resources/css\"))",
                "action_parameters": {
                    "cache": true,
                    "edge_ttl": {
                        "mode": "override_origin",
                        "default": 86400
                    },
                    "browser_ttl": {
                        "mode": "override_origin",
                        "default": 28800
                    }
                }
            },
            {
                "description": "Node External - Images",
                "action": "set_cache_settings",
                "enabled": true,
                "expression": "(starts_with(http.request.uri, \"/external/resources/images\"))",
                "action_parameters": {
                    "cache": true,
                    "edge_ttl": {
                        "mode": "override_origin",
                        "default": 86400
                    },
                    "browser_ttl": {
                        "mode": "bypass"
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
                        "mode": "respect_origin"
                    },
                    "browser_ttl": {
                        "mode": "bypass"
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
                    },
                    "browser_ttl": {
                        "mode": "bypass"
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
                    },
                    "browser_ttl": {
                        "mode": "bypass"
                    }
                }
            },
            {
                "description": "Node External - Cache Bypass for Live (dynamic) HLS stream manifests",
                "action": "set_cache_settings",
                "enabled": true,
                "expression": "(http.request.uri.path contains \"/adaptive/m3u8/dynamic/\") and (http.request.method == \"GET\")",
                "action_parameters": {
                    "cache": false
                }
            },
        ]
    }

    const response_newZoneRuleSet = await axios.put(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/rulesets/phases/http_request_cache_settings/entrypoint`, newZoneRuleSet, { headers });

    if (!response_newZoneRuleSet.data.success) {
        throw new Error('failed to create zone http_request_cache_settings phase rule set');
    }

    const response_newZoneRuleSet_result = response_newZoneRuleSet.data.result;

    logDebugMessageToConsole('created zone http_request_cache_settings phase rule set: ' + JSON.stringify(response_newZoneRuleSet_result), null, null);

    // step 2: set Browser Cache TTL to "Respect Existing Headers"

    logDebugMessageToConsole('setting Browser Cache TTL to Respect Existing Headers', null, null);

    const browserCacheTtlData = {
        value: 0
    };

    const response_BrowserCacheTtl = await axios.patch(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/settings/browser_cache_ttl`, browserCacheTtlData, { headers });

    if (!response_BrowserCacheTtl.data.success) {
        throw new Error('failed to set Browser Cache TTL');
    }

    logDebugMessageToConsole('set Browser Cache TTL to Respect Existing Headers: ' + JSON.stringify(response_BrowserCacheTtl.data), null, null);

    // step 3: enable Always Use HTTPS

    logDebugMessageToConsole('enabling Always Use HTTPS', null, null);

    const alwaysUseHttpsData = {
        value: 'on'
    };

    const response_AlwaysUseHttps = await axios.patch(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/settings/always_use_https`, alwaysUseHttpsData, { headers });

    if (!response_AlwaysUseHttps.data.success) {
        throw new Error('failed to enable Always Use HTTPS');
    }

    logDebugMessageToConsole('enabled Always Use HTTPS: ' + JSON.stringify(alwaysUseHttpsData.data), null, null);

    // step 4: enable Argo Tiered Caching

    logDebugMessageToConsole('enabling Argo Tiered Caching', null, null);

    const tieredCachingData = {
        value: 'on'
    };

    const response_tieredCache = await axios.patch(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/argo/tiered_caching`, tieredCachingData, { headers });

    if (!response_tieredCache.data.success) {
        throw new Error('failed to enable Argo Tiered Caching');
    }

    logDebugMessageToConsole('enabled Argo Tiered Caching: ' + JSON.stringify(response_tieredCache.data), null, null);

    // step 5: enable Tiered Cache Smart Topology

    logDebugMessageToConsole('enabling Tiered Cache Smart Topology', null, null);

    const tieredCacheSmartTopologyData = {
        value: 'on'
    };

    const response_tieredCacheSmartTopology = await axios.patch(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/cache/tiered_cache_smart_topology_enable`, tieredCacheSmartTopologyData, { headers });

    if (!response_tieredCacheSmartTopology.data.success) {
        throw new Error('failed to enable Tiered Cache Smart Topology');
    }

    logDebugMessageToConsole('enabled Tiered Cache Smart Topology: ' + JSON.stringify(response_tieredCacheSmartTopology.data), null, null);

    // step 6: save the configuration

    const nodeSettings = getNodeSettings();

    nodeSettings.isCloudflareCdnEnabled = true;
    nodeSettings.cloudflareEmailAddress = cloudflareEmailAddress;
    nodeSettings.cloudflareZoneId = cloudflareZoneId;
    nodeSettings.cloudflareGlobalApiKey = cloudflareGlobalApiKey;

    setNodeSettings(nodeSettings);

    logDebugMessageToConsole('successfully set Cloudflare configuration for MoarTube Node', null, null);

    await cloudflare_addCdnDnsRecord(moartubeNodeIp, nodeSettings.storageConfig);

    await cloudflare_purgeEntireCache();
}

async function cloudflare_resetCdn(moartubeNodeIp) {
    logDebugMessageToConsole('resetting Cloudflare configuration for MoarTube Node', null, null);

    const nodeSettings = getNodeSettings();

    if (nodeSettings.isCloudflareCdnEnabled) {
        const cloudflareEmailAddress = nodeSettings.cloudflareEmailAddress;
        const cloudflareZoneId = nodeSettings.cloudflareZoneId;
        const cloudflareGlobalApiKey = nodeSettings.cloudflareGlobalApiKey;

        const headers = {
            'X-Auth-Email': cloudflareEmailAddress,
            'X-Auth-Key': cloudflareGlobalApiKey
        };

        // step 1: get all rule sets in the zone

        logDebugMessageToConsole('retrieving zone rule sets', null, null);

        const response_ruleSets = await axios.get(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/rulesets`, { headers });

        if (!response_ruleSets.data.success) {
            throw new Error('failed to retrieve zone rule sets');
        }

        const response_ruleSets_result = response_ruleSets.data.result;

        logDebugMessageToConsole('discovered zone rule sets: ' + JSON.stringify(response_ruleSets.data), null, null);

        // step 2: delete all http_request_cache_settings phase rule sets in the zone

        logDebugMessageToConsole('deleting zone http_request_cache_settings phase rule set if discovered', null, null);

        for (const ruleSet of response_ruleSets_result) {
            if (ruleSet.phase === 'http_request_cache_settings') {
                logDebugMessageToConsole('deleting discovered zone http_request_cache_settings phase rule set: ' + ruleSet.id, null, null);

                const response_deleteRuleSet = await axios.delete(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/rulesets/${ruleSet.id}`, { headers });

                if (response_deleteRuleSet.status === 204) {
                    logDebugMessageToConsole('deleted discovered zone http_request_cache_settings phase rule set: ' + ruleSet.id, null, null);
                }
                else {
                    throw new Error('failed to delete zone http_request_cache_settings phase rule set');
                }
            }
        }

        // step 3: disable Argo Tiered Caching

        logDebugMessageToConsole('disabling Argo Tiered Caching', null, null);

        const tieredCachingData = {
            value: 'off'
        };

        const response_tieredCache = await axios.patch(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/argo/tiered_caching`, tieredCachingData, { headers });

        if (!response_tieredCache.data.success) {
            throw new Error('failed to disable Argo Tiered Caching');
        }

        logDebugMessageToConsole('disabled Argo Tiered Caching: ' + JSON.stringify(response_tieredCache.data), null, null);

        // step 4: disable Tiered Cache Smart Topology

        logDebugMessageToConsole('disabling Tiered Cache Smart Topology', null, null);

        const tieredCacheSmartTopologyData = {
            value: 'off'
        };

        const response_tieredCacheSmartTopology = await axios.patch(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/cache/tiered_cache_smart_topology_enable`, tieredCacheSmartTopologyData, { headers });

        if (!response_tieredCacheSmartTopology.data.success) {
            throw new Error('failed to disable Tiered Cache Smart Topology');
        }

        logDebugMessageToConsole('disabled Tiered Cache Smart Topology: ' + JSON.stringify(response_tieredCacheSmartTopology.data), null, null);

        // step 5: save the configuration

        await cloudflare_resetDnsRecords(moartubeNodeIp);
        await cloudflare_purgeEntireCache();

        nodeSettings.isCloudflareCdnEnabled = false;
        nodeSettings.cloudflareEmailAddress = '';
        nodeSettings.cloudflareZoneId = '';
        nodeSettings.cloudflareGlobalApiKey = '';

        setNodeSettings(nodeSettings);

        logDebugMessageToConsole('successfully reset Cloudflare configuration for MoarTube Node', null, null);
    }
}

async function cloudflare_validateTurnstileToken(token, cloudflareConnectingIp) {
    const nodeSettings = getNodeSettings();

    const cloudflareTurnstileSecretKey = nodeSettings.cloudflareTurnstileSecretKey;

    const data = {
        secret: cloudflareTurnstileSecretKey,
        response: token
    };

    if (cloudflareConnectingIp != null) {
        data.remoteip = cloudflareConnectingIp;
    }

    const response = await axios.post('https://challenges.cloudflare.com/turnstile/v0/siteverify', data);

    if (!response.data.success) {
        throw new Error('human verification was unsuccessful');
    }
}

async function cloudflare_addCdnDnsRecord(moartubeNodeIp, storageConfig) {
    const nodeSettings = getNodeSettings();

    const isCloudflareCdnEnabled = nodeSettings.isCloudflareCdnEnabled;

    if(isCloudflareCdnEnabled) {
        const cloudflareEmailAddress = nodeSettings.cloudflareEmailAddress;
        const cloudflareZoneId = nodeSettings.cloudflareZoneId;
        const cloudflareGlobalApiKey = nodeSettings.cloudflareGlobalApiKey;

        let recordName;
        let recordContent;

        if (storageConfig.storageMode === 'filesystem') {
            const nodeSettings = getNodeSettings();

            if (getIsDeveloperMode()) {
                recordName = `testingexternalvideos.${nodeSettings.publicNodeAddress}`;
            }
            else {
                recordName = `externalvideos.${nodeSettings.publicNodeAddress}`;
            }
            
            recordContent = moartubeNodeIp;
        }
        else if (storageConfig.storageMode === 's3provider') {
            const bucketName = storageConfig.s3Config.bucketName;
            
            recordName = bucketName;

            const endpoint = storageConfig.s3Config.s3ProviderClientConfig.endpoint;
            
            if (endpoint != null) {
                // assume non-AWS S3 provider

                const url = new URL(endpoint);
                const hostname = url.hostname;

                recordContent = `${bucketName}.${hostname}`;
            }
            else {
                // assume AWS S3
                const region = storageConfig.s3Config.s3ProviderClientConfig.region;

                recordContent = `${bucketName}.s3.${region}.amazonaws.com`;
            }
        }

        logDebugMessageToConsole('verifying required DNS record name: ' + recordName + ' Content: ' + recordContent, null, null);

        logDebugMessageToConsole('querying DNS records...', null, null);

        const dnsRecordGetResponse = await axios.get(
            `https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/dns_records?name=${recordName}`,
            {
                headers:
                {
                    'X-Auth-Email': cloudflareEmailAddress,
                    'X-Auth-Key': cloudflareGlobalApiKey
                }
            }
        );

        if (dnsRecordGetResponse.data.success) {
            logDebugMessageToConsole('successfully queried DNS records', null, null);

            const dnsRecords = dnsRecordGetResponse.data.result;

            for(const dnsRecord of dnsRecords) {
                if(dnsRecord.name === recordName) {
                    logDebugMessageToConsole(`removing existing DNS record with name: ${dnsRecord.name}`, null, null);

                    await axios.delete(
                        `https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/dns_records/${dnsRecord.id}`,
                        {
                            headers: {
                                'X-Auth-Email': cloudflareEmailAddress,
                                'X-Auth-Key': cloudflareGlobalApiKey
                            }
                        }
                    );
                }
            }

            logDebugMessageToConsole('adding DNS record...', null, null);

            let dnsRecordPostResponse;

            if(storageConfig.storageMode === 'filesystem') {
                dnsRecordPostResponse = await axios.post(
                    `https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/dns_records`,
                    {
                        type: 'A',
                        name: recordName,
                        content: recordContent,
                        ttl: 1,
                        proxied: true,
                    },
                    {
                        headers:
                        {
                            'X-Auth-Email': cloudflareEmailAddress,
                            'X-Auth-Key': cloudflareGlobalApiKey
                        }
                    }
                );
            }
            else if(storageConfig.storageMode === 's3provider') {
                dnsRecordPostResponse = await axios.post(
                    `https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/dns_records`,
                    {
                        type: 'CNAME',
                        name: recordName,
                        content: recordContent,
                        ttl: 1,
                        proxied: true,
                    },
                    {
                        headers:
                        {
                            'X-Auth-Email': cloudflareEmailAddress,
                            'X-Auth-Key': cloudflareGlobalApiKey
                        }
                    }
                );
            }
            else {
                throw new Error('invalid storageMode');
            }

            if (dnsRecordPostResponse.data.success) {
                logDebugMessageToConsole('successfully added DNS record', null, null);
            }
            else {
                throw new Error('failed to add DNS record');
            }
        }
        else {
            throw new Error('failed to query DNS records from Cloudflare');
        }
    }
}

async function cloudflare_resetDnsRecords(moartubeNodeIp) {
    const nodeSettings = getNodeSettings();
    const storageConfig = nodeSettings.storageConfig;

    const isCloudflareCdnEnabled = nodeSettings.isCloudflareCdnEnabled;

    if(isCloudflareCdnEnabled) {
        const cloudflareEmailAddress = nodeSettings.cloudflareEmailAddress;
        const cloudflareZoneId = nodeSettings.cloudflareZoneId;
        const cloudflareGlobalApiKey = nodeSettings.cloudflareGlobalApiKey;

        const dnsRecordGetResponse = await axios.get(
            `https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/dns_records`,
            {
                headers:
                {
                    'X-Auth-Email': cloudflareEmailAddress,
                    'X-Auth-Key': cloudflareGlobalApiKey
                }
            }
        );
    
        if (dnsRecordGetResponse.data.success) {
            logDebugMessageToConsole('successfully queried DNS records', null, null);
    
            const dnsRecords = dnsRecordGetResponse.data.result;
    
            for(const dnsRecord of dnsRecords) {
                if(dnsRecord.name.contains('externalvideos') || dnsRecord.name.contains('testingexternalvideos')) {
                    logDebugMessageToConsole(`removing existing DNS record with name: ${dnsRecord.name}`, null, null);
    
                    await axios.delete(
                        `https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/dns_records/${dnsRecord.id}`,
                        {
                            headers: {
                                'X-Auth-Email': cloudflareEmailAddress,
                                'X-Auth-Key': cloudflareGlobalApiKey
                            }
                        }
                    );
                }
            }

            if(storageConfig.storageMode === 'filesystem') {
                let recordName;

                if (getIsDeveloperMode()) {
                    recordName = `testingexternalvideos.${nodeSettings.publicNodeAddress}`;
                }
                else {
                    recordName = `externalvideos.${nodeSettings.publicNodeAddress}`;
                }

                const dnsRecordPostResponse = await axios.post(
                    `https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/dns_records`,
                    {
                        type: 'A',
                        name: recordName,
                        content: moartubeNodeIp,
                        ttl: 1,
                        proxied: true
                    },
                    {
                        headers:
                        {
                            'X-Auth-Email': cloudflareEmailAddress,
                            'X-Auth-Key': cloudflareGlobalApiKey
                        }
                    }
                );

                if (dnsRecordPostResponse.data.success) {
                    logDebugMessageToConsole('successfully added DNS record', null, null);
                }
                else {
                    throw new Error('failed to add DNS record');
                }
            }
        }
    }
}




async function cloudflare_validate(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey) {
    const response = await axios.get('https://api.cloudflare.com/client/v4/zones/' + cloudflareZoneId, {
        headers: {
            'X-Auth-Email': cloudflareEmailAddress,
            'X-Auth-Key': cloudflareGlobalApiKey
        }
    });

    return response.data;
}

async function cloudflare_purgeEntireCache() {
    const nodeSettings = getNodeSettings();

    if (nodeSettings.isCloudflareCdnEnabled) {
        const cloudflareEmailAddress = nodeSettings.cloudflareEmailAddress;
        const cloudflareZoneId = nodeSettings.cloudflareZoneId;
        const cloudflareGlobalApiKey = nodeSettings.cloudflareGlobalApiKey;

        const response = await axios.post('https://api.cloudflare.com/client/v4/zones/' + cloudflareZoneId + '/purge_cache', {
            purge_everything: true
        }, {
            headers: {
                'X-Auth-Email': cloudflareEmailAddress,
                'X-Auth-Key': cloudflareGlobalApiKey
            }
        });

        return response.data;
    }
    else {
        throw new Error('could not purge the Cloudflare cache; the node is currently not configured to use Cloudflare');
    }
}

async function cloudflare_purgeCache(files, source) {
    if (files.length > 0) {
        const filesofFiles = formatFilesParameter(files);

        if (getIsDeveloperMode()) {
            return Promise.resolve([]);
        }
        else {
            const nodeSettings = getNodeSettings();

            if (nodeSettings.isCloudflareCdnEnabled) {
                const cloudflareEmailAddress = nodeSettings.cloudflareEmailAddress;
                const cloudflareZoneId = nodeSettings.cloudflareZoneId;
                const cloudflareGlobalApiKey = nodeSettings.cloudflareGlobalApiKey;

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

                            if (data.success) {
                                logDebugMessageToConsole(source + ' success: ' + filesJson, null, null);
                            }
                            else {
                                logDebugMessageToConsole(source + ' failed: ' + filesJson, null, null);
                            }

                            return { status: 'fulfilled' };
                        })
                        .catch(error => {
                            logDebugMessageToConsole(source + ' error: ' + filesJson, error, new Error().stack);

                            return { status: 'rejected' };
                        });
                });

                return Promise.allSettled(axiosPromises);
            }
            else {
                return Promise.resolve([]);
            }
        }
    }
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
    cloudflare_setCdnConfiguration,
    cloudflare_resetCdn,
    cloudflare_validateTurnstileToken,
    cloudflare_addCdnDnsRecord,
    cloudflare_resetDnsRecords,
    cloudflare_purgeAllWatchPages,
    cloudflare_purgeAllEmbedVideoPages
};