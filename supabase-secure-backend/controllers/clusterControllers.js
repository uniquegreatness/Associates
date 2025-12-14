/**
 * Cluster Controller Logic (clusterController.js)
 *
 * This file contains the API controller logic for fetching and calculating
 * the status of interest clusters, including the accurate spots_left counter.
 *
 * NOTE: This assumes your environment provides access to a pre-initialized
 * server-side Supabase client (`supabase`) configured with the SERVICE_ROLE_KEY
 * for secure and efficient database counting.
 */

// --- MOCK SUPABASE SETUP (Replace with actual server-side Supabase client initialization) ---
// If your server.js or index.js initializes Supabase, you should import that instance here.
// For demonstration, we assume a globally available or passed-in 'supabase' object.
// const supabase = require('../config/supabaseClient'); 
const supabase = {
    from: (table) => ({
        select: (fields, options) => {
            // Mock implementation for demonstration
            if (table === 'dynamic_clusters') {
                return {
                    single: async () => ({
                        data: { max_members: 5 }, // Mock max members
                        error: null
                    })
                };
            }
            if (table === 'user_clusters') {
                if (options && options.count === 'exact') {
                    // Mock result for member count
                    return { count: 3, error: null }; // Mock: 3 current members
                }
                // Mock result for user membership check
                return {
                    data: (fields === 'user_id' && 3 > 0) ? [{ user_id: 'mock_user_id' }] : [],
                    error: null
                };
            }
            return { data: [], error: null };
        }
    })
};
// -----------------------------------------------------------------------------

/**
 * Express Route Handler for /api/cohort-status
 * Calculates and returns the correct spots_left value for a given cluster.
 *
 * @param {object} req - Express Request object
 * @param {object} res - Express Response object
 */
async function handleCohortStatus(req, res) {
    // 1. Validate Input
    const clusterId = parseInt(req.query.cluster_id, 10);
    const userId = req.query.user_id;

    if (!clusterId || !userId) {
        return res.status(400).json({ 
            success: false, 
            message: "Missing cluster_id or user_id query parameters." 
        });
    }

    try {
        // 2. Fetch Max Members for the Cluster
        const { data: clusterData, error: clusterError } = await supabase
            .from('dynamic_clusters')
            .select('max_members')
            .eq('id', clusterId)
            .single();

        if (clusterError) {
            console.error(`Error fetching max_members for cluster ${clusterId}:`, clusterError);
            return res.status(500).json({ success: false, message: clusterError.message });
        }

        const maxMembers = clusterData.max_members || 5; // Default to 5 if not set

        // 3. Count Current Members for the Cluster
        // We use { count: 'exact' } which is crucial for accurate counting
        const { count: currentMembers, error: countError } = await supabase
            .from('user_clusters')
            .select('*', { count: 'exact', head: true }) // head: true for performance
            .eq('cluster_id', clusterId);

        if (countError) {
             console.error(`Error counting current members for cluster ${clusterId}:`, countError);
             return res.status(500).json({ success: false, message: countError.message });
        }
        
        // Ensure count is a number
        const memberCount = currentMembers !== null ? currentMembers : 0;

        // 4. Check User Membership
        const { data: membershipData, error: memberError } = await supabase
            .from('user_clusters')
            .select('user_id')
            .eq('cluster_id', clusterId)
            .eq('user_id', userId);

        if (memberError) {
            console.error(`Error checking user membership for cluster ${clusterId}:`, memberError);
            // Non-fatal error, continue with default assumption
        }
        
        // 5. Calculate Spots Left (THE FIX FOR THE COUNTER)
        const spotsLeft = Math.max(0, maxMembers - memberCount);
        const isFull = memberCount >= maxMembers;

        // 6. Return the status object
        // NOTE: You must replace the mock values (vcf_uploaded, etc.) with
        // actual database lookups and logic in your production environment.
        return res.json({
            success: true,
            cohort_id: `Cluster_${clusterId}`, 
            is_full: isFull,
            current_members: memberCount,
            max_members: maxMembers,
            spots_left: spotsLeft, // THIS IS THE CRITICAL, CORRECTED VALUE
            user_is_member: membershipData && membershipData.length > 0,
            vcf_uploaded: false, // Placeholder
            vcf_file_name: null, // Placeholder
            vcf_download_count: 0, // Placeholder
            user_has_downloaded: false, // Placeholder
        });

    } catch (error) {
        console.error('Fatal error in handleCohortStatus:', error);
        return res.status(500).json({ success: false, message: "An unexpected error occurred on the server." });
    }
}

// Export the function for use in the router
module.exports = { handleCohortStatus };
