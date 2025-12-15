const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 
const { calculateClusterStats } = require('../../utils/cohortUtils');

const supabase = supabaseAdmin; 

/**
 * NEW ROUTE: CLUSTER STATS V2
 * Route: /api/cluster-stats-v2?cluster_id=X&user_country=Y
 * * Purpose: This route is designed to be highly robust and defensively fetch all
 * required profile and cohort data, coercing potential null values to empty strings 
 * before calling `calculateClusterStats`, which is the presumed source of the 
 * 'split' error.
 */
router.get('/cluster-stats-v2', async (req, res) => {
    const { cluster_id, user_country } = req.query;
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
            // Defensive check: display_profession might be null from DB even if boolean (if not set). 
            // We coerce to a simple string representation if needed.
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
            
            // Coerce potential null array/text fields to safe empty strings/arrays
            const safeFriendReasons = Array.isArray(profile.friend_reasons) ? profile.friend_reasons.join(', ') : (profile.friend_reasons || '');
            const safeServices = Array.isArray(profile.services) ? profile.services.join(', ') : (profile.services || '');

            return {
                user_id: profile.user_id,
                nickname: profile.nickname || '',
                age: profile.age, // Age can be null, but usually safe for stats calculation
                gender: profile.gender || '',
                country: profile.country || '',
                
                // CRITICAL Defensive Checks for fields expected to be processed by .split()
                profession: profile.profession || '',
                friend_reasons: safeFriendReasons, 
                services: safeServices,
                
                display_profession: displayProfession 
            };
        });

        // Calculate and return results
        const stats = calculateClusterStats(flatMembers, user_country);

        return res.json({ success: true, cluster_stats: stats, cohort_members: flatMembers });

    } catch (error) {
        console.error("Error fetching cluster stats V2:", error);
        const errorMessage = error.message || 'An unknown error occurred on the server.';
        return res.status(500).json({ success: false, message: errorMessage });
    }
});

module.exports = router;
