// routes/admin/getFullMemberListAdmin.js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 
const { requireAdminAuth } = require('../../middleware/authMiddleware');
const { getCohortStatus } = require('../../services/cohortService');

const supabase = supabaseAdmin; 

/**
 * Endpoint 8: Get Combined Member List (Admin Only)
 */
router.get('/cohorts/:cluster_id/members', requireAdminAuth, async (req, res) => {
    const { cluster_id } = req.params;
    const clusterIdNum = parseInt(cluster_id, 10);
    
    try {
        // req.user.id is available from requireAdminAuth
        const status = await getCohortStatus(clusterIdNum, req.user.id); 
        if (!status.success || !status.cohort_id) {
             return res.status(404).json({ success: false, message: status.message || 'Active cohort not found.' });
        }
        
        const active_cohort_id = status.cohort_id;
        
        const { data: members, error } = await supabase
            .from('cluster_cohort_members') 
            .select(`
                user_id, 
                email, 
                joined_at,
                user_profiles (
                    nickname, 
                    age, 
                    gender, 
                    country, 
                    profession, 
                    display_profession,
                    whatsapp_number,
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
            email: member.email,
            joined_at: member.joined_at,
        }));
        
        return res.json({ success: true, members: combinedMembers });

    } catch (error) {
        console.error(`Error fetching combined member list for cluster ${cluster_id}:`, error.message);
        return res.status(500).json({ success: false, message: `Server error: ${error.message}` });
    }
});

module.exports = router;
