// routes/frontend/joinClusterFix.js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 
const { getCohortStatus } = require('../../services/cohortService');

const supabase = supabaseAdmin; 

/**
 * FIX: JOIN CLUSTER (Matches cohort_template.html JSON body)
 * Route: /api/join-cluster
 */
router.post('/join-cluster', async (req, res) => {
    const { p_cluster_id, p_user_id, p_display_profession } = req.body; 
    
    const user_id = p_user_id || req.body.user_id;
    const cluster_id = p_cluster_id || req.body.cluster_id;

    if (!user_id || !cluster_id) {
        return res.status(400).json({ success: false, message: 'User ID and Cluster ID required.' });
    }
    
    const clusterIdNum = parseInt(cluster_id, 10);

    try {
        const status = await getCohortStatus(clusterIdNum, user_id);
        
        if (status.user_is_member) {
            return res.json({ success: true, message: 'Already a member.' });
        }
        if (status.is_full) {
            return res.status(409).json({ success: false, message: 'Cluster is full.' });
        }
        
        const { data: { user } } = await supabase.auth.admin.getUserById(user_id);
        const email = user?.email || 'no-email@provided.com';

        const newMember = {
            cluster_id: clusterIdNum,
            cohort_id: status.cohort_id,
            user_id: user_id,
            email: email,
            cluster_name: status.cluster_name
        };

        const { error: insertError } = await supabase
            .from('cluster_cohort_members')
            .insert([newMember]);

        if (insertError) throw insertError;

        if (p_display_profession !== undefined) {
             await supabase.from('user_profiles').update({ display_profession: p_display_profession }).eq('user_id', user_id);
        }

        const updatedStatus = await getCohortStatus(clusterIdNum, user_id);
        
        return res.json({ 
            success: true, 
            cohort_id: updatedStatus.cohort_id,
            is_full: updatedStatus.is_full,
            current_members: updatedStatus.current_members,
            vcf_uploaded: updatedStatus.vcf_uploaded,
            vcf_file_name: updatedStatus.vcf_file_name
        });

    } catch (error) {
        console.error(`Join Error:`, error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;

