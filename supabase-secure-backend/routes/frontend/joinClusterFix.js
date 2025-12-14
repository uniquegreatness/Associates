const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 
const { getCohortStatus } = require('../../services/cohortService');

const supabase = supabaseAdmin; 

/**
 * CONCEPTUAL: VCF Generation and DB Update
 * In a real-world scenario, this function would:
 * 1. Fetch all 5 user profiles associated with the cohort_id.
 * 2. Generate the .vcf file content (e.g., using a vcf library).
 * 3. Upload the VCF file to Supabase Storage.
 * 4. Update the 'cluster_cohorts' table to set vcf_uploaded = true 
 * and vcf_file_name = [filename].
 * * For this exercise, we simulate the status update.
 */
async function generateVCFAndUpload(clusterId, cohortId) {
    // Determine the max members for this cluster
    const { data: clusterData, error: clusterError } = await supabase
        .from('dynamic_clusters')
        .select('max_members')
        .eq('id', clusterId)
        .single();
    
    const maxMembers = clusterData?.max_members || 5;

    // Check if the cohort is indeed full before proceeding
    const { count: currentMembers, error: countError } = await supabase
        .from('cluster_cohort_members')
        .select('*', { count: 'exact' })
        .eq('cohort_id', cohortId);
        
    if (countError || currentMembers < maxMembers) {
        console.warn(`VCF Trigger attempted but cohort ${cohortId} is not full yet. Count: ${currentMembers}/${maxMembers}`);
        return { vcf_uploaded: false, vcf_file_name: null };
    }

    console.log(`Cohort ${cohortId} is full (${currentMembers}/${maxMembers}). Initiating VCF generation and upload simulation...`);

    // --- REAL LOGIC STARTS HERE ---
    const fileName = `cohort_${cohortId}_contacts.vcf`; 
    
    // Simulate VCF generation and upload (500ms delay)
    // await new Promise(resolve => setTimeout(resolve, 500)); 

    // Update the cluster_cohorts table with VCF status
    const { error: updateError } = await supabase
        .from('cluster_cohorts')
        .update({ 
            vcf_uploaded: true,
            vcf_file_name: fileName,
            is_full: true // Redundant, but ensures consistency
        })
        .eq('cohort_id', cohortId);

    if (updateError) {
        console.error(`Failed to update cluster_cohorts for VCF: ${updateError.message}`);
        throw updateError;
    }

    console.log(`VCF status updated for ${cohortId}. File: ${fileName}`);
    return { vcf_uploaded: true, vcf_file_name: fileName };
}


/**
 * FIX: JOIN CLUSTER API
 * The fix ensures that when the cluster reaches max capacity, 
 * the VCF status flags are immediately updated in the DB and returned to the client.
 */
router.post('/join-cluster', async (req, res) => {
    const { p_cluster_id, p_user_id, p_display_profession, p_ref_code } = req.body; 
    
    const user_id = p_user_id;
    const cluster_id = p_cluster_id;

    if (!user_id || !cluster_id) {
        return res.status(400).json({ success: false, message: 'User ID and Cluster ID required.' });
    }
    
    const clusterIdNum = parseInt(cluster_id, 10);

    try {
        // 1. Check current status before attempting to join
        let status = await getCohortStatus(clusterIdNum, user_id);
        
        if (status.user_is_member) {
            return res.json({ 
                success: true, 
                message: 'Already a member.',
                ...status 
            });
        }
        if (status.is_full) {
            return res.status(409).json({ success: false, message: 'Cluster is full.' });
        }
        
        // 2. Prepare the insert payload for cluster_cohort_members
        const newMember = {
            cluster_id: clusterIdNum,
            cohort_id: status.cohort_id, // Use the cohort_id returned from getCohortStatus
            user_id: user_id,
        };

        const { error: insertError } = await supabase
            .from('cluster_cohort_members')
            .insert([newMember]);

        if (insertError) {
            if (insertError.code === '23505') { 
                 console.warn(`Attempted duplicate join for user ${user_id} on cluster ${cluster_id}.`);
                 return res.status(409).json({ success: false, message: 'You have already joined this cluster.' });
            }
            throw insertError;
        }

        // 3. Update user profile's preference
        if (p_display_profession !== undefined) {
             await supabase.from('user_profiles').update({ display_profession: p_display_profession }).eq('user_id', user_id);
        }
        
        // 4. Optionally process referral code
        if (p_ref_code) {
             console.log(`Tracking referral code ${p_ref_code} for user ${user_id} joining cluster ${cluster_id}.`);
        }

        // === FIX IMPLEMENTATION: Check for Full Status and Trigger VCF ===
        const { count: currentMembersAfterInsert } = await supabase
            .from('cluster_cohort_members')
            .select('*', { count: 'exact' })
            .eq('cohort_id', status.cohort_id);
            
        const maxMembers = status.max_members || 5; 

        if (currentMembersAfterInsert >= maxMembers) {
            // This is the CRITICAL step for the last member:
            // 4a. Trigger the VCF generation and database status update
            await generateVCFAndUpload(clusterIdNum, status.cohort_id);
            // 4b. Also, mark the cohort as full (the VCF function handles this, but ensuring here)
            await supabase.from('cluster_cohorts').update({ is_full: true }).eq('cohort_id', status.cohort_id);
            console.log(`Cluster ${clusterIdNum} is now full and VCF generation triggered.`);
        }
        // ===============================================================

        // 5. Fetch and return the FINAL updated status (this will now include the VCF flags)
        const updatedStatus = await getCohortStatus(clusterIdNum, user_id);
        
        return res.json({ 
            success: true, 
            ...updatedStatus,
            user_is_member: true, 
        });

    } catch (error) {
        console.error(`Join Error:`, error.message);
        return res.status(500).json({ success: false, message: `Server error during join: ${error.message}` });
    }
});

module.exports = router;
