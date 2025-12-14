const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 
const { getCohortStatus } = require('../../services/cohortService');

const supabase = supabaseAdmin; 

/**
 * FIX: JOIN CLUSTER (Matches cohort_template.html JSON body)
 * Route: /api/join-cluster
 * * NOTE: The 'cluster_name' and 'email' fields have been removed from the 
 * insert payload for 'cluster_cohort_members' as they do not exist in that table.
 * The 'display_profession' update correctly targets the 'user_profiles' table 
 * for persistence.
 */
router.post('/join-cluster', async (req, res) => {
    // Note: The client-side sends p_cluster_id and p_user_id (via the auth system).
    const { p_cluster_id, p_user_id, p_display_profession, p_ref_code } = req.body; 
    
    const user_id = p_user_id;
    const cluster_id = p_cluster_id;

    if (!user_id || !cluster_id) {
        return res.status(400).json({ success: false, message: 'User ID and Cluster ID required.' });
    }
    
    const clusterIdNum = parseInt(cluster_id, 10);

    try {
        // 1. Check current status before attempting to join
        const status = await getCohortStatus(clusterIdNum, user_id);
        
        if (status.user_is_member) {
            // FIX: Ensure all status data is returned for consistency, matching the structure 
            // the frontend expects to update its cache.
            return res.json({ 
                success: true, 
                message: 'Already a member.',
                ...status // Spread existing status data
            });
        }
        if (status.is_full) {
            return res.status(409).json({ success: false, message: 'Cluster is full.' });
        }
        
        // 2. Prepare the insert payload for cluster_cohort_members
        const newMember = {
            cluster_id: clusterIdNum,
            cohort_id: status.cohort_id,
            user_id: user_id,
        };

        const { error: insertError } = await supabase
            .from('cluster_cohort_members')
            .insert([newMember]);

        if (insertError) {
            // Check for specific database errors (like unique constraint violations)
            if (insertError.code === '23505') { 
                 console.warn(`Attempted duplicate join for user ${user_id} on cluster ${cluster_id}.`);
                 return res.status(409).json({ success: false, message: 'You have already joined this cluster.' });
            }
            throw insertError;
        }

        // 3. Update user profile's preference (this targets a different table: user_profiles)
        if (p_display_profession !== undefined) {
             await supabase.from('user_profiles').update({ display_profession: p_display_profession }).eq('user_id', user_id);
        }
        
        // 4. Optionally process referral code (if available)
        if (p_ref_code) {
             console.log(`Tracking referral code ${p_ref_code} for user ${user_id} joining cluster ${cluster_id}.`);
        }

        // 5. Fetch and return the updated status
        // IMPORTANT: The status will now reflect the user as a member
        const updatedStatus = await getCohortStatus(clusterIdNum, user_id);
        
        // FIX: Use spread operator to include ALL properties returned by getCohortStatus,
        // which ensures fields like 'user_is_member: true', 'max_members', etc., are present 
        // for the frontend to correctly transition the button state.
        return res.json({ 
            success: true, 
            ...updatedStatus,
            // Explicitly ensure user_is_member is true for immediate cache update
            user_is_member: true, 
        });

    } catch (error) {
        console.error(`Join Error:`, error.message);
        return res.status(500).json({ success: false, message: `Server error during join: ${error.message}` });
    }
});

module.exports = router;
