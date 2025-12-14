// Centralized database logic for managing cluster and cohort state.

const { supabaseAdmin } = require('../config/supabase'); // Use Admin client for service operations

/**
 * Retrieves the current status of a cluster and its active cohort, handling synchronization and counting.
 * This is the critical service function that ensures cluster_metadata is consistent with dynamic_clusters.
 * * FIX IMPLEMENTED:
 * 1. Separated the check for the user's membership status (user_is_member, user_has_downloaded) 
 * from the check for the active cohort's member count.
 * 2. User membership is now checked using ONLY cluster_id and user_id, ensuring correctness 
 * even during cohort transitions.
 * 3. The calculated member count for the *active* cohort is still used to update cluster_metadata.
 * * @param {number} cluster_id - The ID of the cluster.
 * @param {string} user_id - The ID of the user checking the status.
 * @returns {Object} Status object including cohort state, membership, and metadata.
 */
async function getCohortStatus(cluster_id, user_id) {
    console.log(`[DB] Fetching status for Cluster: ${cluster_id}, User: ${user_id.substring(0, 8)}...`);
    
    // We use the supabaseAdmin client (Service Role Key) to bypass RLS and perform admin checks.
    const supabase = supabaseAdmin; 

    try {
        let cohort_id, is_full = false, user_is_member = false, vcf_uploaded = false, max_members = 5, cluster_name = '', vcf_file_name = null;
        let user_has_downloaded = false;
        let calculated_member_count = 0;
        let clusterMeta;

        // Step 1: Get Metadata from cluster_metadata (the state table)
        const { data: existingMeta, error: metaError } = await supabase
            .from('cluster_metadata') 
            .select('active_cohort_id, vcf_uploaded, vcf_file_name, max_members, cluster_name, vcf_download_count, current_members') 
            .eq('cluster_id', cluster_id)
            .limit(1)
            .maybeSingle();

        if (metaError) throw metaError;
        
        if (existingMeta) {
            clusterMeta = existingMeta;
        } else {
            // --- CRITICAL FIX: SYNCHRONIZATION LOGIC (Kept as provided) ---
            console.log(`[DB] Metadata missing for Cluster ID ${cluster_id}. Attempting synchronization from dynamic_clusters.`);

            const { data: dynamicCluster, error: dynamicError } = await supabase
                .from('dynamic_clusters')
                .select('id, name, max_members')
                .eq('id', cluster_id)
                .limit(1)
                .maybeSingle();
                
            if (dynamicError) throw dynamicError;

            if (!dynamicCluster) {
                return { success: false, message: `Cluster ID ${cluster_id} not found in dynamic_clusters.` };
            }
            
            const initialMetadata = {
                cluster_id: dynamicCluster.id,
                cluster_name: dynamicCluster.name,
                max_members: dynamicCluster.max_members,
                vcf_uploaded: false,
                vcf_download_count: 0,
                active_cohort_id: null,
                cluster_category_id: 1, 
                current_members: 0, 
                is_ready_for_deletion: false, 
            };
            
            const { data: newMeta, error: insertError } = await supabase
                .from('cluster_metadata')
                .insert([initialMetadata])
                .select('active_cohort_id, vcf_uploaded, vcf_file_name, max_members, cluster_name, vcf_download_count, current_members')
                .single();
                
            if (insertError) throw insertError;
            
            clusterMeta = newMeta;
            console.log(`[DB] Successfully synchronized and created metadata for Cluster ID ${cluster_id}.`);
            // --- END CRITICAL FIX ---
        }
        
        // --- Continue processing with clusterMeta ---

        const target_cohort_id = clusterMeta.active_cohort_id;
        vcf_uploaded = clusterMeta.vcf_uploaded || false; 
        vcf_file_name = clusterMeta.vcf_file_name || null;
        max_members = clusterMeta.max_members || 5; 
        cluster_name = clusterMeta.cluster_name || `Cluster ${cluster_id}`;
        const vcf_downloads_count = clusterMeta.vcf_download_count || 0;
        let persisted_member_count = clusterMeta.current_members || 0; // The count currently in the DB


        // =========================================================
        // FIX IMPLEMENTATION: Robust User Membership Check
        // =========================================================

        // Step 2: Check User's Membership (Source of truth for client state: user_is_member, user_has_downloaded)
        const { data: userMemberEntry, error: userMemberError } = await supabase
            .from('cluster_cohort_members') 
            .select('cohort_id, vcf_downloaded_at') 
            // Crucially, we only filter by cluster_id and user_id (the PK) to find the user immediately.
            .eq('cluster_id', cluster_id)
            .eq('user_id', user_id)
            .limit(1)
            .maybeSingle();

        if (userMemberError) throw userMemberError;

        user_is_member = !!userMemberEntry;
        user_has_downloaded = !!userMemberEntry?.vcf_downloaded_at;
        
        // =========================================================
        // END FIX IMPLEMENTATION
        // =========================================================


        if (target_cohort_id) {
            
            // Step 3: Check Active Cohort Member Count (Source of truth for server state: current_members, is_full)
            const { data: activeCohortMembers, error: activeCohortMembersError } = await supabase
                .from('cluster_cohort_members') 
                // We must filter by active_cohort_id here to only count members in the currently active cohort
                .select('user_id') 
                .eq('cluster_id', cluster_id)
                .eq('cohort_id', target_cohort_id); 

            if (activeCohortMembersError) throw activeCohortMembersError;
            
            // Calculate state based on the active cohort's membership
            calculated_member_count = activeCohortMembers.length;
            is_full = calculated_member_count >= max_members;
            cohort_id = target_cohort_id;

            
            // --- PROACTIVE STATE PERSISTENCE (Kept as provided) ---
            // If the calculated count doesn't match the persisted count, update the DB.
            if (persisted_member_count !== calculated_member_count) {
                 const { error: countUpdateError } = await supabase
                    .from('cluster_metadata')
                    .update({ 
                        current_members: calculated_member_count,
                        last_updated: new Date().toISOString()
                    })
                    .eq('cluster_id', cluster_id);
                
                if (countUpdateError) {
                    console.error(`Warning: Failed to update current_members count for cluster ${cluster_id}`, countUpdateError.message);
                } else {
                     console.log(`Updated cluster_metadata.current_members for ${cluster_id} to ${calculated_member_count}.`);
                }
            }


        } else {
            // Cluster is open (No active cohort ID yet)
            cohort_id = `C_OPEN_${cluster_id}`;
            calculated_member_count = 0;
            is_full = false;
        }

        // CRITICAL LOGIC: If VCF is uploaded, force is_full to true to maintain pause state
        if (vcf_uploaded) {
            is_full = true;
        }

        // *** START CRITICAL FIX: Pre-calculate spots_left for frontend compatibility ***
        const spots_left = Math.max(0, max_members - calculated_member_count); 
        // *** END CRITICAL FIX ***

        return {
            success: true,
            cohort_id,
            is_full,
            // CRITICAL FIX: Add the spots_left field here
            spots_left: spots_left,
            current_members: calculated_member_count, // Uses the fresh calculated count for the active cohort
            user_is_member, // FIXED: Now uses the robust check from Step 2
            vcf_uploaded,
            vcf_file_name,
            max_members,
            cluster_name,
            vcf_download_count: vcf_downloads_count, 
            user_has_downloaded: user_has_downloaded, // FIXED: Now uses the robust check from Step 2
            message: "Cohort status retrieved successfully (deep fix implemented)."
        };

    } catch (error) {
        console.error(`Error in getCohortStatus for Cluster ${cluster_id}:`, error.message);
        return { success: false, message: `Database error: ${error.message}` };
    }
}

module.exports = {
    getCohortStatus,
};

