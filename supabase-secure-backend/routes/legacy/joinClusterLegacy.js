// routes/legacy/joinClusterLegacy.js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 
const { getCohortStatus } = require('../../services/cohortService');

const supabase = supabaseAdmin; 

/**
 * Endpoint 3: Join a Cluster
 */
router.post('/cohorts/:cluster_id/join', async (req, res) => {
    const { cluster_id } = req.params;
    const { user_id, user_email } = req.body; 

    if (!user_id || !user_email) {
        return res.status(400).json({ success: false, message: 'user_id and user_email are required.' });
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

        if (status.user_is_member) {
            return res.json({ success: true, message: 'Already a member.' });
        }
        
        if (status.is_full) {
            return res.status(409).json({ success: false, message: 'Cluster is full or VCF uploaded. Cannot join.' });
        }
        
        if (!status.cohort_id) {
             return res.status(500).json({ success: false, message: 'Could not determine active cohort ID.' });
        }
        
        const newMember = {
            cluster_id: clusterIdNum,
            cohort_id: status.cohort_id,
            user_id: user_id,
            email: user_email,
            cluster_name: status.cluster_name || `Cluster ${clusterIdNum}`, 
        };

        const { error: insertError } = await supabase
            .from('cluster_cohort_members')
            .insert([newMember]);

        if (insertError) {
            if (insertError.code === '23505') { 
                return res.json({ success: true, message: 'Already a member.' });
            }
            throw insertError;
        }

        const updatedStatus = await getCohortStatus(clusterIdNum, user_id);
        const isNowFull = updatedStatus.current_members >= status.max_members;
        
        return res.json({ 
            success: true, 
            message: 'Successfully joined cluster.', 
            is_full: isNowFull,
            current_members: updatedStatus.current_members,
            max_members: status.max_members
        });

    } catch (error) {
        console.error(`Error joining cluster ${cluster_id}:`, error.message);
        return res.status(500).json({ success: false, message: `Database operation failed: ${error.message}` });
    }
});

module.exports = router;
