// routes/frontend/getClusterStatsFix.js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 
const { calculateClusterStats } = require('../../utils/cohortUtils');

const supabase = supabaseAdmin; 

/**
 * FIX: CLUSTER STATS (Matches cohort_template.html query params)
 * Route: /api/cluster-stats?cluster_id=X&user_country=Y
 */
router.get('/cluster-stats', async (req, res) => {
    const { cluster_id, user_country } = req.query;
    const clusterIdNum = parseInt(cluster_id, 10);

    try {
        const { data: meta } = await supabase.from('cluster_metadata').select('active_cohort_id').eq('cluster_id', clusterIdNum).single();
        
        if (!meta || !meta.active_cohort_id) {
             return res.json({ success: false, message: 'No active cohort found.' });
        }

        const { data: members, error } = await supabase
            .from('cluster_cohort_members') 
            .select(`user_profiles (age, gender, country, profession, display_profession, friend_reasons, services)`)
            .eq('cluster_id', clusterIdNum)
            .eq('cohort_id', meta.active_cohort_id); 
            
        if (error) throw error;
        
        const { data: memberList } = await supabase
            .from('cluster_cohort_members')
            .select(`user_profiles (nickname, gender, age, country, friend_reasons, services)`)
            .eq('cluster_id', clusterIdNum)
            .eq('cohort_id', meta.active_cohort_id);

        const flatMembers = members.map(m => m.user_profiles);
        const stats = calculateClusterStats(flatMembers, user_country);
        const flatList = memberList.map(m => m.user_profiles);

        return res.json({ success: true, cluster_stats: stats, cohort_members: flatList });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;

