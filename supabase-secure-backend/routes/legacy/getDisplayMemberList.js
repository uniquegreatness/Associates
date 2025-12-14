// routes/legacy/getDisplayMemberList.js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 
const { getCohortStatus } = require('../../services/cohortService');

const supabase = supabaseAdmin; 

/**
 * Endpoint 12: Get Member List for Display (Not Admin-gated)
 */
router.get('/cohorts/:cluster_id/members/display', async (req, res) => {
    const { cluster_id } = req.params;
    const clusterIdNum = parseInt(cluster_id, 10);
    const { user_id } = req.query; 

    if (!user_id) {
         return res.status(400).json({ success: false, message: 'user_id query parameter is required.' });
    }

    try {
        const status = await getCohortStatus(clusterIdNum, user_id);
        if (!status.success || !status.cohort_id) {
             return res.status(404).json({ success: false, message: status.message || 'Active cohort not found.' });
        }
        
        if (!status.user_is_member) {
            return res.status(403).json({ success: false, message: 'Access denied. You must be a member of this cluster to view the member list.' });
        }

        const active_cohort_id = status.cohort_id;
        
        const { data: members, error } = await supabase
            .from('cluster_cohort_members') 
            .select(`
                user_id, 
                joined_at,
                user_profiles (
                    nickname, 
                    gender, 
                    country, 
                    profession, 
                    display_profession,
                    friend_reasons,
                    services
                )
            `)
            .eq('cluster_id', clusterIdNum)
            .eq('cohort_id', active_cohort_id); 

        if (error) throw error;

        const combinedMembers = members.map(member => ({
            ...member.user_profiles,
            user_id: member.user_id,
            joined_at: member.joined_at,
        }));
        
        return res.json({ success: true, members: combinedMembers });

    } catch (error) {
        console.error(`Error fetching display member list for cluster ${cluster_id}:`, error.message);
        return res.status(500).json({ success: false, message: `Server error: ${error.message}` });
    }
});

module.exports = router;

