const { logDebugMessageToConsole } = require('../utils/logger');
const { getAuthenticationStatus, generateCaptcha, performNodeIdentification, getNodeIdentification, getNodeSettings } = require('../utils/helpers');
const { isCaptchaTypeValid } = require('../utils/validators');
const { indexer_getCaptcha } = require('../utils/indexer-communications');
const { aliaser_getCaptcha } = require('../utils/aliaser-communications');

async function comments_GET(req, res) {
    const captchaType = req.query.captchaType;
    
    if(isCaptchaTypeValid(captchaType)) {
        const captcha = await generateCaptcha();
        
        if(captchaType === 'static') {
            req.session.staticCommentsCaptcha = captcha.text;
        }
        else if(captchaType === 'dynamic') {
            req.session.dynamicCommentsCaptcha = captcha.text;
        }
        
        res.setHeader('Content-Type', 'image/png');
        
        res.send(captcha.data);
    }
    else {
        res.end();
    }
}

async function likedislike_GET(req, res) {
    const captcha = await generateCaptcha();
    
    req.session.likeDislikeCaptcha = captcha.text;
    
    res.setHeader('Content-Type', 'image/png');
    
    res.send(captcha.data);
}

function index_GET(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            performNodeIdentification()
            .then(() => {
                const nodeIdentification = getNodeIdentification();
                
                const moarTubeTokenProof = nodeIdentification.moarTubeTokenProof;
                
                indexer_getCaptcha(moarTubeTokenProof)
                .then(async indexerResponseData => {
                    res.setHeader('Content-Type', 'image/png');
                    indexerResponseData.pipe(res);
                })
                .catch(error => {
                    logDebugMessageToConsole(null, error, new Error().stack, true);

                    res.send({isError: true, message: 'unable to communicate with the MoarTube platform'});
                });
            })
            .catch(error => {
                logDebugMessageToConsole(null, error, new Error().stack, true);

                res.send({isError: true, message: 'unable to communicate with the MoarTube platform'});
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
}

function alias_GET(req, res) {
    performNodeIdentification()
    .then(() => {
        const nodeIdentification = getNodeIdentification();
        
        const moarTubeTokenProof = nodeIdentification.moarTubeTokenProof;
        
        aliaser_getCaptcha(moarTubeTokenProof)
        .then(aliaserResponseData => {
            res.setHeader('Content-Type', 'image/png');
            aliaserResponseData.pipe(res);
        })
        .catch(error => {
            logDebugMessageToConsole(null, error, new Error().stack, true);

            res.send({isError: true, message: 'unable to communicate with the MoarTube platform'});
        });
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);

        res.send({isError: true, message: 'unable to communicate with the MoarTube platform'});
    });
}

module.exports = {
    comments_GET,
    likedislike_GET,
    index_GET,
    alias_GET
}