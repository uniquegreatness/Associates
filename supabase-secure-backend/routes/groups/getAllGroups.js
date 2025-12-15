const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 

const supabase = supabaseAdmin; 

/**
 * GET /api/groups
 * Fetches all available groups and their core status for the main page display.
 * This endpoint does NOT require a user to be logged in (guest viewing is allowed).
 */
router.get('/', async (req, res) => {
    console.log('API: Fetching all groups and status...');
    
    try {
        // Fetch all required data from the 'groups' table.
        // We exclude sensitive data like creator_user_id and only fetch fields necessary 
        // for rendering the card and determining its state.
        const { data, error } = await supabase
            .from('groups')
            .select(`
                group_id,
                name,
                description,
                max_members,
                current_members,
                is_full,
                vcf_uploaded,
                is_paid,
                is_incentivized,
                referral_message_template
            `)
            .order('group_id', { ascending: true }); // Order by ID to ensure consistent display

        if (error) {
            console.error('Database Error fetching groups:', error.message);
            return res.status(500).json({ success: false, message: 'Could not retrieve group data.' });
        }

        console.log(`Successfully retrieved ${data.length} groups.`);
        
        // Transform the data to include a spots_left field for the frontend
        const groupsWithSpots = data.map(group => ({
            ...group,
            spots_left: group.max_members - group.current_members,
            // A group is only 'available' if it's not full
            is_available: !group.is_full, 
        }));

        return res.json({ 
            success: true, 
            groups: groupsWithSpots 
        });

    } catch (error) {
        console.error('Unexpected error in getAllGroups:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

module.exports = router;
