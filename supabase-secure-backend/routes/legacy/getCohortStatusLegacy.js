
// routes/legacy/getCohortStatusLegacy.js
const express = require('express');
const router = express.Router();
const { getCohortStatus } = require('../../services/cohortService');

/**
 * Endpoint 2: Get Cluster Status (Membership, VCF Upload State)
 */
router.get('/cohorts/:cluster_id/status', async (req, res) => {
    const { cluster_id } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
         return res.status(400).json({ success: false, message: 'user_id query parameter is required.' });
    }

    const clusterIdNum = parseInt(cluster_id, 10);
    if (isNaN(clusterIdNum)) {
        return res.status(400).json({ success: false, message: 'Invalid cluster ID format.' });
    }

    const result = await getCohortStatus(clusterIdNum, user_id);
    
    if (result.success) {
        return res.json(result);
    } else {
        if (result.message.includes('not found')) {
             return res.status(404).json(result);
        }
        return res.status(500).json(result);
    }
});

module.exports = router;
