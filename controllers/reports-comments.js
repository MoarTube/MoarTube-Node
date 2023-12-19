
const { logDebugMessageToConsole, getAuthenticationStatus } = require('../utils/helpers');


async function reportsCommentsCaptcha_GET(req, res) {
    const captcha = await generateCaptcha();
    
    req.session.commentReportCaptcha = captcha.text;
    
    res.setHeader('Content-Type', 'image/png');
    
    res.send(captcha.data);
}


module.exports = {
    
}