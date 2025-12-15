const express = require('express');
const router = express.Router();
// IMPORTANT FIX 1: Corrected path to config (from previous step)
const { supabaseAdmin } = require('../../config/supabase'); 
// CRITICAL FIX 2: Corrected path to utils folder
const { calculateClusterStats } = require('../../utils/cohortUtils');

const supabase = supabaseAdmin; 

/**
 * NEW ROUTE: CLUSTER STATS V2
 * Route: /api/cluster-stats-v2?cluster_id=X&user_country=Y
 * * Purpose: This route is designed to be highly robust and defensively fetch all
 * required profile and cohort data, coercing potential null values to safe formats
 * to prevent the original 'split is not a function' error within the utility function.
 */
router.get('/cluster-stats-v2', async (req, res) => {
    // CRITICAL FIX 1: Add input validation to prevent crashes from bad query params
    const { cluster_id, user_country } = req.query;
    
    if (!cluster_id || isNaN(parseInt(cluster_id, 10))) {
        return res.status(400).json({ success: false, message: 'Invalid or missing cluster_id parameter.' });
    }
    
    const clusterIdNum = parseInt(cluster_id, 10);

    try {
        // Step 1: Find the active cohort ID from cluster_metadata
        const { data: meta, error: metaError } = await supabase
            .from('cluster_metadata')
            .select('active_cohort_id')
            .eq('cluster_id', clusterIdNum)
            .single();
        
        if (metaError && metaError.code !== 'PGRST116') throw metaError; 
        
        if (!meta || !meta.active_cohort_id) {
             return res.json({ success: false, message: 'No active cohort found.' });
        }
        
        const cohortId = meta.active_cohort_id;

        // Step 2: Get user_id's and display_profession from cluster_cohort_members
        const { data: memberCohortData, error: cohortDataError } = await supabase
            .from('cluster_cohort_members') 
            .select('user_id, display_profession') 
            .eq('cluster_id', clusterIdNum)
            .eq('cohort_id', cohortId);

        if (cohortDataError) throw cohortDataError;
        
        const memberUserIds = memberCohortData.map(m => m.user_id).filter(id => id); 
        
        if (memberUserIds.length === 0) {
             // Return success with empty stats/members if cohort is empty
             const stats = calculateClusterStats([], user_country);
             return res.json({ success: true, cluster_stats: stats, cohort_members: [] });
        }
        
        // Map display_profession for merging
        const cohortMemberMap = memberCohortData.reduce((acc, member) => {
            // Defensive check: display_profession might be null from DB even if boolean. 
            acc[member.user_id] = String(member.display_profession || ''); 
            return acc;
        }, {});

        // Step 3: Fetch all required profile details from user_profiles
        const { data: profileDetails, error: profileError } = await supabase
            .from('user_profiles')
            .select('user_id, nickname, age, gender, country, profession, friend_reasons, services')
            .in('user_id', memberUserIds); 

        if (profileError) throw profileError;
        
        // Step 4: Merge and apply aggressive null checks
        const flatMembers = profileDetails.map(profile => {
            
            // Extract cohort-specific display_profession, safely defaulting to ''
            const displayProfession = cohortMemberMap[profile.user_id] || '';
            
            // CRITICAL FIX 2: Ensure array fields are safely converted to comma-separated strings
            // or default to an empty string, as the current calculateClusterStats expects strings.
            const safeFriendReasons = Array.isArray(profile.friend_reasons) ? profile.friend_reasons.join(', ') : (profile.friend_reasons || '');
            const safeServices = Array.isArray(profile.services) ? profile.services.join(', ') : (profile.services || '');

            return {
                user_id: profile.user_id,
                nickname: profile.nickname || '',
                
                // CRITICAL FIX 3: Ensure age is a number or null. If it's a null string from the DB,
                // parseInt will return NaN, which crashes the stats calculator. 
                age: (profile.age !== null && profile.age !== undefined) ? parseInt(profile.age, 10) : null,
                
                gender: profile.gender || '',
                country: profile.country || '',
                
                // Fields expected to be split() must be strings
                profession: profile.profession || '',
                friend_reasons: safeFriendReasons, // Now a safe string
                services: safeServices,           // Now a safe string
                
                display_profession: displayProfession 
            };
        });

        // Step 5: Calculate and return results
        const stats = calculateClusterStats(flatMembers, user_country);

        return res.json({ success: true, cluster_stats: stats, cohort_members: flatMembers });

    } catch (error) {
        console.error("Error fetching cluster stats V2:", error);
        // CRITICAL FIX 4: Ensure the error message is always a string and not null
        const errorMessage = (error.message || String(error)) || 'An unknown error occurred on the server.';
        return res.status(500).json({ success: false, message: errorMessage });
    }
});

module.exports = router;
