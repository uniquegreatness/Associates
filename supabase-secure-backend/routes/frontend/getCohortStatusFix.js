// routes/frontend/getCohortStatusFix.js
const express = require('express');
const router = express.Router();
const { getCohortStatus } = require('../../services/cohortService');

/**
 * FIX: COHORT STATUS (Matches cohort_template.html query params)
 * Route: /api/cohort-status?cluster_id=X&user_id=Y
 */
router.get('/cohort-status', async (req, res) => {
    const { cluster_id, user_id } = req.query;

    if (!user_id || !cluster_id) {
         return res.status(400).json({ success: false, message: 'user_id and cluster_id required.' });
    }

    const clusterIdNum = parseInt(cluster_id, 10);
    const result = await getCohortStatus(clusterIdNum, user_id);
    
    if (result.success) {
        return res.json(result);
    } else {
        return res.status(500).json(result);
    }
});

module.exports = router;

