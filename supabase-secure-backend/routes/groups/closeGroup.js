const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 

const supabase = supabaseAdmin; 

/**
 * POST /api/groups/close
 * Allows the creator of a 'direct' group to close it, triggering the deletion 
 * of all member data from the 'group_members' table for that cohort.
 * * Required Body: {
 * group_id: number,
 * user_id: string (must be the creator_user_id)
 * }
 */
router.post('/close', async (req, res) => {
    const { group_id, user_id } = req.body; 

    if (!group_id || !user_id) {
        return res.status(400).json({ success: false, message: 'Group ID and User ID are required.' });
    }
    
    const groupIdNum = parseInt(group_id, 10);

    try {
        // 1. Authorization Check: Fetch group data to verify user is the creator and check group type
        const { data: group, error: fetchError } = await supabase
            .from('groups')
            .select('creator_user_id, vcf_type')
            .eq('group_id', groupIdNum)
            .single();

        if (fetchError || !group) {
            return res.status(404).json({ success: false, message: 'Group not found.' });
        }

        if (group.creator_user_id !== user_id) {
            return res.status(403).json({ success: false, message: 'Forbidden: Only the group creator can close the group.' });
        }
        
        // This closure is designed specifically for direct groups as per requirement.
        // General groups are cleaned up automatically upon final download.
        if (group.vcf_type !== 'direct') {
            return res.status(400).json({ success: false, message: 'This action is only supported for "direct" VCF groups.' });
        }

        // 2. Perform Data Deletion (The core action)
        // Delete all member records associated with this group ID.
        const { error: deleteError, count: deletedCount } = await supabase
            .from('group_members')
            .delete()
            .eq('group_id', groupIdNum)
            .select('*', { count: 'exact' });

        if (deleteError) {
            console.error('Database Error deleting members on close:', deleteError.message);
            return res.status(500).json({ success: false, message: 'Failed to clean up group member data.' });
        }

        // 3. Update Group Status (Mark the group as closed/inactive)
        const { error: updateError } = await supabase
            .from('groups')
            .update({ 
                is_full: true, // Mark as permanently full/inactive
                is_completed_and_inactive: true // A new, clearer column may be better for this state
            })
            .eq('group_id', groupIdNum);

        if (updateError) {
            console.error('Database Error updating group status:', updateError.message);
            // This is non-critical to the response but should be logged
        }
        
        console.log(`Direct Group ${groupIdNum} closed by creator ${user_id.substring(0, 8)}. ${deletedCount} members deleted.`);

        return res.json({ 
            success: true, 
            message: `Group successfully closed and ${deletedCount} member records deleted.`
        });

    } catch (error) {
        console.error('Unexpected error in closeGroup:', error);
        return res.status(500).json({ success: false, message: 'Internal server error during group closure.' });
    }
});

module.exports = router;

