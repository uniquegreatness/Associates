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
            // Include existing VCF stats in success message
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
            // REMOVED 'email' and 'cluster_name' here as they are not columns in this table.
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
        // This is separate from the cluster membership insert and is assumed to be correct.
        if (p_display_profession !== undefined) {
             await supabase.from('user_profiles').update({ display_profession: p_display_profession }).eq('user_id', user_id);
        }
        
        // 4. Optionally process referral code (if available)
        // This logic is usually separate but included here for completeness if needed.
        if (p_ref_code) {
             // In a real app, you would process the p_ref_code here (e.g., track referral in a referral table)
             console.log(`Tracking referral code ${p_ref_code} for user ${user_id} joining cluster ${cluster_id}.`);
        }

        // 5. Fetch and return the updated status
        const updatedStatus = await getCohortStatus(clusterIdNum, user_id);
        
        return res.json({ 
            success: true, 
            cohort_id: updatedStatus.cohort_id,
            is_full: updatedStatus.is_full,
            current_members: updatedStatus.current_members,
            vcf_uploaded: updatedStatus.vcf_uploaded,
            vcf_file_name: updatedStatus.vcf_file_name,
            vcf_download_count: updatedStatus.vcf_download_count,
            user_has_downloaded: updatedStatus.user_has_downloaded,
            max_members: updatedStatus.max_members,
        });

    } catch (error) {
        console.error(`Join Error:`, error.message);
        // The original error should now be resolved, leaving only expected server errors.
        return res.status(500).json({ success: false, message: `Server error during join: ${error.message}` });
    }
});

module.exports = router;
