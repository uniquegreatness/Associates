// routes/legacy/leaveClusterLegacy.js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 
const { getCohortStatus } = require('../../services/cohortService');

const supabase = supabaseAdmin; 

/**
 * Endpoint 4: Leave a Cluster
 */
router.post('/cohorts/:cluster_id/leave', async (req, res) => {
    const { cluster_id } = req.params;
    const { user_id } = req.body; 

    if (!user_id) {
        return res.status(400).json({ success: false, message: 'user_id is required.' });
    }
    
    const clusterIdNum = parseInt(cluster_id, 10);
    if (isNaN(clusterIdNum)) {
        return res.status(400).json({ success: false, message: 'Invalid cluster ID format.' });
    }

    try {
        const status = await getCohortStatus(clusterIdNum, user_id);
        
        if (!status.success) {
            return res.status(404).json({ success: false, message: status.message });
        }
        
        if (status.vcf_uploaded) {
            return res.status(403).json({ success: false, message: 'Cannot leave after VCF has been generated and uploaded.' });
        }

        const { count, error: deleteError } = await supabase
            .from('cluster_cohort_members')
            .delete({ count: 'exact' })
            .eq('cluster_id', clusterIdNum)
            .eq('user_id', user_id);

        if (deleteError) {
            throw deleteError;
        }
        
        if (count === 0) {
            return res.json({ success: true, message: 'User was not a member.' });
        }

        const updatedStatus = await getCohortStatus(clusterIdNum, user_id);
        
        return res.json({ 
            success: true, 
            message: 'Successfully left cluster.',
            current_members: updatedStatus.current_members,
        });

    } catch (error) {
        console.error(`Error leaving cluster ${cluster_id}:`, error.message);
        return res.status(500).json({ success: false, message: `Database operation failed: ${error.message}` });
    }
});

module.exports = router;
