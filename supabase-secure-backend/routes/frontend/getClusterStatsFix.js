const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 
const { calculateClusterStats } = require('../../utils/cohortUtils');

const supabase = supabaseAdmin; 

/**
 * FIX: CLUSTER STATS (Matches cohort_template.html query params)
 * Route: /api/cluster-stats?cluster_id=X&user_country=Y
 * * FIX IMPLEMENTED: Replaced implicit PostgREST join (which relies on a foreign key) 
 * with a two-step query (1. Get member IDs, 2. Get member profiles) to bypass 
 * the 'relationship not found' error.
 */
router.get('/cluster-stats', async (req, res) => {
    const { cluster_id, user_country } = req.query;
    const clusterIdNum = parseInt(cluster_id, 10);

    try {
        // Step 1: Find the active cohort ID
        const { data: meta, error: metaError } = await supabase.from('cluster_metadata').select('active_cohort_id').eq('cluster_id', clusterIdNum).single();
        
        if (metaError && metaError.code !== 'PGRST116') throw metaError; // PGRST116 = no rows found
        
        if (!meta || !meta.active_cohort_id) {
             return res.json({ success: false, message: 'No active cohort found.' });
        }
        
        // Step 2: Get the list of user_id's that belong to this cohort
        const { data: memberUserIdsData, error: memberIdError } = await supabase
            .from('cluster_cohort_members') 
            .select('user_id') // Crucial: Select only the user_id column
            .eq('cluster_id', clusterIdNum)
            .eq('cohort_id', meta.active_cohort_id);

        if (memberIdError) throw memberIdError;
        
        const memberUserIds = memberUserIdsData.map(m => m.user_id).filter(id => id); // Filter out any null/undefined IDs
        
        if (memberUserIds.length === 0) {
             // Return success with empty stats/members if cohort is empty
             const stats = calculateClusterStats([], user_country);
             return res.json({ success: true, cluster_stats: stats, cohort_members: [] });
        }

        // Step 3: Fetch all required profile details for these users directly from user_profiles
        // We fetch all fields needed for both the stats calculation and the member list display.
        const { data: profileDetails, error: profileError } = await supabase
            .from('user_profiles')
            .select('nickname, age, gender, country, profession, display_profession, friend_reasons, services')
            .in('id', memberUserIds); // Assuming the primary key of user_profiles is 'id'

        if (profileError) throw profileError;

        // The data is now ready for processing
        const flatMembers = profileDetails; // Used for stats calculation
        const flatList = profileDetails; // Used for member list display (renamed for clarity)

        // Calculate and return results
        const stats = calculateClusterStats(flatMembers, user_country);

        return res.json({ success: true, cluster_stats: stats, cohort_members: flatList });

    } catch (error) {
        console.error("Error fetching cluster stats:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
