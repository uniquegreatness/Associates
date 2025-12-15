const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 

const supabase = supabaseAdmin; 

/**
 * GET /api/groups/status?group_id=X&user_id=Y
 * Fetches the detailed status of a single group and the requesting user's membership status.
 */
router.get('/status', async (req, res) => {
    const { group_id, user_id } = req.query;

    if (!group_id || !user_id) {
        return res.status(400).json({ success: false, message: 'Group ID and User ID are required.' });
    }

    const groupIdNum = parseInt(group_id, 10);
    console.log(`API: Getting status for Group ${groupIdNum} and User ${user_id.substring(0, 8)}...`);

    try {
        // 1. Fetch the Core Group Status
        const { data: groupData, error: groupError } = await supabase
            .from('groups')
            .select(`
                group_id,
                name,
                max_members,
                current_members,
                is_full,
                vcf_uploaded,
                vcf_file_name,
                members_downloaded
            `)
            .eq('group_id', groupIdNum)
            .single();

        if (groupError || !groupData) {
            console.warn(`Group ${groupIdNum} not found or database error:`, groupError?.message);
            return res.status(404).json({ success: false, message: 'Group not found or inaccessible.' });
        }
        
        // 2. Check User Membership Status
        const { data: memberData, error: memberError } = await supabase
            .from('group_members')
            .select('id, has_downloaded_vcf')
            .eq('group_id', groupIdNum)
            .eq('user_id', user_id)
            .single();

        if (memberError && memberError.code !== 'PGRST116') { // PGRST116 means 'no rows found'
            console.error('Error checking membership:', memberError);
            return res.status(500).json({ success: false, message: 'Error checking membership status.' });
        }
        
        const userIsMember = !!memberData;
        const userHasDownloaded = memberData ? memberData.has_downloaded_vcf : false;
        
        // 3. Construct the Final Status Object
        const finalStatus = {
            group_id: groupData.group_id,
            max_members: groupData.max_members,
            current_members: groupData.current_members,
            is_full: groupData.is_full,
            vcf_uploaded: groupData.vcf_uploaded,
            vcf_file_name: groupData.vcf_file_name || null, // Ensure null if not set
            vcf_download_count: groupData.members_downloaded,
            spots_left: groupData.max_members - groupData.current_members,
            
            // User-specific data
            user_is_member: userIsMember,
            user_has_downloaded: userHasDownloaded,
        };

        return res.json({ 
            success: true, 
            ...finalStatus 
        });

    } catch (error) {
        console.error('Unexpected error in getGroupStatus:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

module.exports = router;

