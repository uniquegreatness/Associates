// services/cohortService.js
// Centralized database logic for managing cluster and cohort state.

const { supabaseAdmin } = require('../config/supabase'); // Use Admin client for service operations

/**
 * Retrieves the current status of a cluster and its active cohort, handling synchronization and counting.
 * This is the critical service function that ensures cluster_metadata is consistent with dynamic_clusters.
 * * @param {number} cluster_id - The ID of the cluster.
 * @param {string} user_id - The ID of the user checking the status.
 * @returns {Object} Status object including cohort state, membership, and metadata.
 */
async function getCohortStatus(cluster_id, user_id) {
    console.log(`[DB] Fetching status for Cluster: ${cluster_id}, User: ${user_id.substring(0, 8)}...`);
    
    // We use the supabaseAdmin client (Service Role Key) to bypass RLS and perform admin checks.
    const supabase = supabaseAdmin; 

    try {
        let cohort_id, current_members = 0, is_full = false, user_is_member = false, vcf_uploaded = false, max_members = 5, cluster_name = '', vcf_file_name = null;
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
            // --- CRITICAL FIX: SYNCHRONIZATION LOGIC ---
            console.log(`[DB] Metadata missing for Cluster ID ${cluster_id}. Attempting synchronization from dynamic_clusters.`);

            // 1. Check dynamic_clusters for the definition (the source of truth for existence)
            const { data: dynamicCluster, error: dynamicError } = await supabase
                .from('dynamic_clusters')
                .select('id, name, max_members')
                .eq('id', cluster_id)
                .limit(1)
                .maybeSingle();
                
            if (dynamicError) throw dynamicError;

            if (!dynamicCluster) {
                // Not found in either table. This is a genuine "not found" error.
                return { success: false, message: `Cluster ID ${cluster_id} not found in dynamic_clusters.` };
            }
            
            // 2. Found in dynamic_clusters, so create a default row in cluster_metadata
            const initialMetadata = {
                cluster_id: dynamicCluster.id,
                cluster_name: dynamicCluster.name,
                max_members: dynamicCluster.max_members,
                vcf_uploaded: false,
                vcf_download_count: 0,
                active_cohort_id: null,
                // NOTE: cluster_category_id is required by schema, defaulting to 1
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


        if (target_cohort_id) {
            
            // Step 2: Check Membership and Count
            const { count: calculated_member_count, error: membersError } = await supabase
                .from('cluster_cohort_members') 
                .select('user_id', { count: 'exact' }) 
                .eq('cluster_id', cluster_id)
                .eq('cohort_id', target_cohort_id); 

            if (membersError) throw membersError;
            
            current_members = calculated_member_count || 0;
            is_full = current_members >= max_members;

            // Check membership by fetching a single row with user_id
            const { data: userMembership, error: userMemberError } = await supabase
                .from('cluster_cohort_members') 
                .select('user_id') 
                .eq('cluster_id', cluster_id)
                .eq('user_id', user_id)
                .limit(1)
                .maybeSingle();

            if (userMemberError) throw userMemberError;
            
            user_is_member = !!userMembership; 
            cohort_id = target_cohort_id;
            
            // --- NEW FIX: PROACTIVE STATE PERSISTENCE ---
            // If the calculated count doesn't match the persisted count, update the DB.
            if (persisted_member_count !== current_members) {
                 const { error: countUpdateError } = await supabase
                    .from('cluster_metadata')
                    .update({ 
                        current_members: current_members,
                        last_updated: new Date().toISOString()
                    })
                    .eq('cluster_id', cluster_id);
                
                if (countUpdateError) {
                    console.error(`Warning: Failed to update current_members count for cluster ${cluster_id}`, countUpdateError.message);
                } else {
                     console.log(`Updated cluster_metadata.current_members for ${cluster_id} to ${current_members}.`);
                }
            }


        } else {
            // Cluster is open
            cohort_id = `C_OPEN_${cluster_id}`;
            current_members = 0;
            is_full = false;
        }

        // CRITICAL LOGIC: If VCF is uploaded, force is_full to true to maintain pause state
        if (vcf_uploaded) {
            is_full = true;
        }

        return {
            success: true,
            cohort_id,
            is_full,
            current_members,
            user_is_member, 
            vcf_uploaded,
            vcf_file_name,
            max_members,
            cluster_name,
            vcf_downloads_count, 
            message: "Cohort status retrieved successfully deep. "
        };

    } catch (error) {
        console.error(`Error in getCohortStatus for Cluster ${cluster_id}:`, error.message);
        return { success: false, message: `Database error: ${error.message}` };
    }
}

module.exports = {
    getCohortStatus,
};
