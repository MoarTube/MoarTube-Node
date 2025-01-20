const express = require('express');

const { reportsComments_GET, reportsCommentsArchive_POST, reportsCommentsReportIdDelete_DELETE } = require('../controllers/reports-comments');
const { logDebugMessageToConsole } = require('../utils/logger');
const { performAuthenticationCheck } = require('../middleware/authentication');

const router = express.Router();

router.get('/', performAuthenticationCheck(true), async (req, res) => {
    try {
        const data = await reportsComments_GET();

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);
    
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

router.post('/archive', performAuthenticationCheck(true), async (req, res) => {
    try {
        const reportId = req.body.reportId;

        const data = await reportsCommentsArchive_POST(reportId);

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

router.delete('/:reportId/delete', performAuthenticationCheck(true), async (req, res) => {
    try {
        const reportId = req.params.reportId;

        const data = await reportsCommentsReportIdDelete_DELETE(reportId);

        res.send(data);
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    }
});

module.exports = router;