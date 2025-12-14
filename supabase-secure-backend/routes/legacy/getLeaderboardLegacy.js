// routes/legacy/getLeaderboardLegacy.js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 

const supabase = supabaseAdmin; 

/**
 * Endpoint 5: GET the Global Leaderboard Data.
 */
router.get('/leaderboard', async (req, res) => {
    try {
        const { data: leaderboardData, error } = await supabase
            .from('user_profiles')
            .select('user_id, nickname, referrals, country')
            .order('referrals', { ascending: false })
            .limit(100);

        if (error) {
            console.error('Supabase Leaderboard Fetch Error:', error.message);
            throw new Error('Database query failed.');
        }

        return res.json({ 
            success: true, 
            leaderboard: leaderboardData
        });

    } catch (error) {
        console.error('Error fetching leaderboard data:', error.message);
        return res.status(500).json({ 
            success: false, 
            message: `Failed to retrieve leaderboard data: ${error.message}` 
        });
    }
});

module.exports = router;
