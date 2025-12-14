// routes/admin/getClusterStatsAdmin.js
const express = require('express');
const router = express.Router();
const { getCohortStatus } = require('../../services/cohortService');
const { supabaseAdmin } = require('../../config/supabase'); 
const { requireAdminAuth } = require('../../middleware/authMiddleware');
const { calculateClusterStats } = require('../../utils/cohortUtils');

const supabase = supabaseAdmin; 

/**
 * Endpoint 9: Get Cluster Statistics (Admin Only)
 */
router.get('/cohorts/:cluster_id/stats', requireAdminAuth, async (req, res) => {
    const { cluster_id } = req.params;
    const { user_country } = req.query; 

    try {
        const clusterIdNum = parseInt(cluster_id, 10);
        const status = await getCohortStatus(clusterIdNum, req.user.id); 
        if (!status.success || !status.cohort_id) {
             return res.status(404).json({ success: false, message: 'Active cohort not found.' });
        }
        
        const { data: members, error } = await supabase
            .from('cluster_cohort_members') 
            .select(`
                user_profiles (
                    age, gender, country, profession, display_profession, friend_reasons, services
                )
            `)
            .eq('cluster_id', clusterIdNum)
            .eq('cohort_id', status.cohort_id); 
            
        if (error) throw error;
        
        const combinedMembers = members.map(member => member.user_profiles);

        const stats = calculateClusterStats(combinedMembers, user_country);

        return res.json({ success: true, stats: stats });

    } catch (error) {
        console.error(`Error calculating cluster stats for ${cluster_id}:`, error.message);
        return res.status(500).json({ success: false, message: `Server error: ${error.message}` });
    }
});

module.exports = router;

