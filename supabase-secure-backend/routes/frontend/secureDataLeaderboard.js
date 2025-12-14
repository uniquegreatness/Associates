// routes/frontend/secureDataLeaderboard.js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 

const supabase = supabaseAdmin; 

/**
 * FIX: LEADERBOARD ENDPOINT (Matches leaderboard.html fetch of /api/secure-data)
 */
router.get('/secure-data', async (req, res) => {
    try {
        const { data: leaderboardData, error } = await supabase
            .from('user_profiles')
            .select('user_id, nickname, referrals, country, gender, referral_code')
            .order('referrals', { ascending: false }) 
            .limit(100); 

        if (error) throw error;

        return res.json(leaderboardData); 
    } catch (error) {
        console.error('Leaderboard /secure-data Error:', error.message);
        return res.status(500).json({ error: error.message });
    }
});

module.exports = router;

