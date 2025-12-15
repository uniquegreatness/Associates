const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 
const { calculateClusterStats } = require('../../utils/cohortUtils');

const supabase = supabaseAdmin; 

/**
 * FIX: CLUSTER STATS (Matches cohort_template.html query params)
 * Route: /api/cluster-stats?cluster_id=X&user_country=Y
 *
 * * FIX IMPLEMENTED: 
 * 1. Removed 'display_profession' from the user_profiles select, as confirmed not to exist.
 * 2. Fetched 'display_profession' and 'user_id' from the cluster_cohort_members table.
 * 3. Manually merged the profile data (from user_profiles) with the cohort-specific data 
 * (display_profession from cluster_cohort_members) using the 'user_id' as the key.
 * 4. CRITICAL FIX (V2): Applied exhaustive defensive checks (using || '') to ALL string fields 
 * that are likely processed by `calculateClusterStats`: 'profession', 'friend_reasons', 'services', 
 * and the merged 'display_profession'. This guarantees that no null/undefined value reaches the 
 * function that calls `.split()`.
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
        
        const cohortId = meta.active_cohort_id;

        // Step 2: Get the list of user_id's and the cohort-specific field (display_profession)
        const { data: memberCohortData, error: cohortDataError } = await supabase
            .from('cluster_cohort_members') 
            .select('user_id, display_profession') // FETCH display_profession from this table
            .eq('cluster_id', clusterIdNum)
            .eq('cohort_id', cohortId);

        if (cohortDataError) throw cohortDataError;
        
        const memberUserIds = memberCohortData.map(m => m.user_id).filter(id => id); 
        
        if (memberUserIds.length === 0) {
             // Return success with empty stats/members if cohort is empty
             const stats = calculateClusterStats([], user_country);
             return res.json({ success: true, cluster_stats: stats, cohort_members: [] });
        }
        
        // Create a map for quick lookup of display_profession by user_id
        const cohortMemberMap = memberCohortData.reduce((acc, member) => {
            acc[member.user_id] = member.display_profession;
            return acc;
        }, {});

        // Step 3: Fetch all required profile details for these users directly from user_profiles
        // We filter using 'user_id' since that is the common key and remove the non-existent 'display_profession' column.
        const { data: profileDetails, error: profileError } = await supabase
            .from('user_profiles')
            .select('user_id, nickname, age, gender, country, profession, friend_reasons, services')
            .in('user_id', memberUserIds); // Assuming cluster_cohort_members.user_id maps to user_profiles.user_id

        if (profileError) throw profileError;
        
        // Step 4: Manually merge the profile data with the cohort-specific data (display_profession)
        const mergedMembers = profileDetails.map(profile => {
            // Retrieve the display_profession from the map, defaulting to '' if not found
            const displayProfession = cohortMemberMap[profile.user_id] || ''; 
            
            // Return a new object that includes all profile fields + the cohort-specific display_profession
            // CRITICAL FIX: Ensure string fields that are split by calculateClusterStats 
            // are coerced to an empty string if null/undefined.
            return {
                ...profile,
                display_profession: displayProfession, // Defensive check applied during lookup
                
                // Defensive checks for fields fetched from user_profiles:
                profession: profile.profession || '',
                friend_reasons: profile.friend_reasons || '', 
                services: profile.services || ''
            };
        });

        // The merged data structure is now used for both stats calculation and member list display
        const flatMembers = mergedMembers; 
        const flatList = mergedMembers; 

        // Calculate and return results
        const stats = calculateClusterStats(flatMembers, user_country);

        return res.json({ success: true, cluster_stats: stats, cohort_members: flatList });

    } catch (error) {
        console.error("Error fetching cluster stats:", error);
        // Ensure the error response is useful
        const errorMessage = error.message || 'An unknown error occurred on the server.';
        return res.status(500).json({ success: false, message: errorMessage });
    }
});

module.exports = router;
