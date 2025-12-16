const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 

const supabase = supabaseAdmin; 

/**
 * POST /api/groups/create
 * Creates a new, empty group/cohort in the 'groups' table.
 */
router.post('/create', async (req, res) => {
    const { 
        creator_user_id, 
        name, 
        description, 
        max_members, 
        referral_message_template,
        is_paid = false,       
        is_incentivized = false,
        vcf_type = 'direct' 
    } = req.body;

    // Basic Input Validation
    if (!creator_user_id || !name || !max_members || !referral_message_template) {
        return res.status(400).json({ success: false, message: 'Missing required fields: creator, name, max_members, or referral_message.' });
    }
    
    const maxMembersNum = parseInt(max_members, 10);
    if (isNaN(maxMembersNum) || maxMembersNum < 2) {
        return res.status(400).json({ success: false, message: 'Max members must be a number greater than 1.' });
    }

    // VCF Type Validation
    const validVcfTypes = ['direct', 'general'];
    if (!validVcfTypes.includes(vcf_type)) {
        return res.status(400).json({ 
            success: false, 
            message: `Invalid vcf_type specified. Must be one of: ${validVcfTypes.join(', ')}.` 
        });
    }

    try {
        // Fetch creator nickname from user_profiles
        const { data: userProfile, error: profileError } = await supabase
            .from('user_profiles')
            .select('nickname')
            .eq('user_id', creator_user_id)
            .single();

        if (profileError || !userProfile) {
            console.warn('Failed to fetch creator nickname:', profileError?.message);
            return res.status(400).json({ success: false, message: 'Invalid creator_user_id or user not found.' });
        }

        const creatorNickname = userProfile.nickname;

        const newGroupData = {
            creator_user_id,
            creator_nickname,         // Store nickname for frontend display
            name,
            description,
            max_members: maxMembersNum,
            referral_message_template,
            is_paid,
            is_incentivized,
            vcf_type
        };
        
        // Insert new group
        const { data: createdGroup, error: insertError } = await supabase
            .from('groups')
            .insert([newGroupData])
            .select('group_id, name, max_members, vcf_type, creator_nickname')
            .single();

        if (insertError) {
            console.error('Database Error creating group:', insertError.message);
            return res.status(500).json({ success: false, message: `Failed to create group: ${insertError.message}` });
        }
        
        console.log(`Successfully created new Group ID: ${createdGroup.group_id} (Type: ${createdGroup.vcf_type}) by @${creatorNickname}.`);

        return res.status(201).json({ 
            success: true, 
            message: 'Group created successfully.', 
            group: createdGroup 
        });

    } catch (error) {
        console.error('Unexpected error in createGroup:', error);
        return res.status(500).json({ success: false, message: 'Internal server error during group creation.' });
    }
});

module.exports = router;
