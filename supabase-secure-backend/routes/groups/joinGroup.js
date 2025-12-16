const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 

const supabase = supabaseAdmin; 
const VCF_BUCKET_NAME = 'near_vcf_bucket'; // Define bucket name once

// =================================================================
// 1. HELPER FUNCTION DEFINITION (MOVED HERE TO PREVENT OUTPUT ISSUES)
// =================================================================

/**
 * Helper function to retrieve all necessary group status for a final response, 
 * used when a user attempts to join a group they are already in.
 */
async function getUpdatedGroupStatus(groupIdNum, user_id, groupData) {
    // Note: Re-fetching is crucial to get the most updated counts/VCF status
    const { data: updatedGroupData } = await supabase
        .from('groups')
        .select('vcf_file_name, vcf_uploaded, current_members, members_downloaded, is_full')
        .eq('group_id', groupIdNum)
        .single();
        
    const { data: memberData } = await supabase
        .from('group_members')
        .select('has_downloaded_vcf')
        .eq('group_id', groupIdNum)
        .eq('user_id', user_id)
        .single();
        
    return {
        group_id: groupIdNum,
        max_members: groupData.max_members,
        current_members: updatedGroupData.current_members,
        is_full: updatedGroupData.is_full,
        vcf_uploaded: updatedGroupData.vcf_uploaded,
        vcf_file_name: updatedGroupData.vcf_file_name || null,
        vcf_download_count: updatedGroupData.members_downloaded,
        spots_left: groupData.max_members - updatedGroupData.current_members,
        user_is_member: true,
        user_has_downloaded: memberData ? memberData.has_downloaded_vcf : false,
    };
}


// =================================================================
// 2. VCF UTILITY FUNCTIONS 
// =================================================================

/**
 * Generates the VCF filename. For GENERAL, it's Cohort_Contacts_[group_id].vcf.
 */
function generateVcfFileName(groupId, vcfType) {
    if (vcfType === 'direct') {
        // NOTE: Direct VCF file naming is handled dynamically in the download endpoint.
        // We define the name here only for the persistent GENERAL file status.
        return `Creator_Contacts_${groupId}.vcf`; 
    }
    // General type: All members' contacts, generated on full (PERSISTENT NAME)
    return `Cohort_Contacts_${groupId}.vcf`;
}

/**
 * Utility function to generate VCF content string from contacts array. 
 * (Same as previous logic)
 */
function generateVcfContent(contacts) {
    let vcfContent = '';
    
    contacts.forEach(contact => {
        let profession = contact.display_profession;
        if (profession === null || profession === undefined || profession === 'false') {
             profession = 'NEARR';
        }
        
        const name = contact.nickname || `User ${contact.user_id.substring(0, 8)}`;
        const phone = contact.whatsapp_number || '';

        vcfContent += 'BEGIN:VCARD\nVERSION:3.0\n';
        vcfContent += `FN:${name} (${profession})\n`;
        vcfContent += `N:${name};;;\n`; 
        vcfContent += `TITLE:${profession}\n`;
        if (phone) {
            const cleanPhone = phone.replace(/[^0-9+]/g, ''); 
            vcfContent += `TEL;TYPE=CELL:${cleanPhone}\n`;
        }
        vcfContent += 'END:VCARD\n';
    });
    return vcfContent;
}

/**
 * Handles the VCF generation, upload, and status update for the GENERAL VCF type 
 * when the group becomes full.
 */
async function handleGeneralGroupCompletion(group, supabase) {
    const groupId = group.group_id;
    const maxMembers = group.max_members;
    const vcfFileName = generateVcfFileName(groupId, 'general');

    console.log(`GENERAL Group ${groupId} is full. Generating VCF...`);

    // 1. Fetch All Member Data (including the just-joined member)
    const { data: allMemberData, error: memberFetchError } = await supabase
        .from('group_members')
        .select('user_id, display_profession') 
        .eq('group_id', groupId);
    
    if (memberFetchError || !allMemberData || allMemberData.length !== maxMembers) {
        console.error('VCF Error: Failed to fetch exact member count for generation.', memberFetchError);
        return false;
    }

    const userIds = allMemberData.map(m => m.user_id);
    const { data: profiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('user_id, nickname, profession, whatsapp_number')
        .in('user_id', userIds);
    
    if (profileError || !profiles) {
        console.error('VCF Error: Failed to fetch user profiles for VCF.', profileError);
        return false;
    }
    
    const vcfContacts = allMemberData.map(member => {
        const profile = profiles.find(p => p.user_id === member.user_id);
        return profile ? { ...profile, display_profession: member.display_profession } : null;
    }).filter(c => c !== null); 

    // 2. Generate and Upload
    const vcfContent = generateVcfContent(vcfContacts); 
    const storagePath = `vcf_exchange/${vcfFileName}`;
    
    const { error: uploadError } = await supabase.storage
        .from(VCF_BUCKET_NAME) 
        .upload(storagePath, vcfContent, {
            contentType: 'text/vcard',
            upsert: true 
        });

    if (uploadError) {
        console.error('VCF Upload Error:', uploadError);
        return false;
    }

    // 3. Update Group Status (Mark VCF Ready)
    const { error: updateError } = await supabase
        .from('groups')
        .update({ 
            vcf_uploaded: true,
            vcf_file_name: vcfFileName,
        })
        .eq('group_id', groupId);
        
    if (updateError) {
         console.error(`Failed to update group status with VCF metadata: ${updateError.message}`);
         return false;
    }
    
    console.log(`GENERAL VCF successfully generated and stored: ${vcfFileName}`);
    return true;
}


// =================================================================
// 3. MAIN ROUTE HANDLER
// =================================================================

/**
 * POST /api/groups/join
 * Handles member insertion and triggers GENERAL VCF generation on group completion.
 */
router.post('/join', async (req, res) => {
    const { group_id, user_id, p_display_profession } = req.body; 
    
    if (!user_id || !group_id) {
        return res.status(400).json({ success: false, message: 'User ID and Group ID required.' });
    }
    
    const groupIdNum = parseInt(group_id, 10);

    try {
        // 1. Fetch Group Status
        const { data: groupData, error: statusError } = await supabase
            .from('groups')
            .select(`
                group_id, is_full, max_members, current_members, vcf_type, vcf_uploaded, vcf_file_name
            `)
            .eq('group_id', groupIdNum)
            .single();

        if (statusError || !groupData) {
            return res.status(404).json({ success: false, message: 'Group not found.' });
        }

        // --- 1a. Pre-Join Checks ---
        const { count: isMember } = await supabase
            .from('group_members')
            .select('*', { count: 'exact' })
            .eq('group_id', groupIdNum)
            .eq('user_id', user_id);

        if (isMember > 0) {
            // Already a member. Fetch and return full status.
            const fullStatus = await getUpdatedGroupStatus(groupIdNum, user_id, groupData);
            return res.status(200).json({ success: true, message: 'Already a member.', ...fullStatus });
        }

        if (groupData.is_full) {
            return res.status(409).json({ success: false, message: 'Group is full.' });
        }
        
        // --- 2. Insert New Member ---
        const newMember = {
            group_id: groupIdNum,
            user_id: user_id,
            display_profession: p_display_profession, 
        };

        const { error: insertError } = await supabase
            .from('group_members')
            .insert([newMember]);
        
        if (insertError) {
            if (insertError.code === '23505') { 
                 return res.status(409).json({ success: false, message: 'You have already joined this group (race condition resolved).' });
            }
            throw insertError;
        }

        // --- 3. GENERAL VCF Trigger (Only runs if the group is GENERAL and just filled up) ---
        const currentMembersAfterInsert = groupData.current_members + 1;
        const maxMembers = groupData.max_members; 
        const isNowFull = currentMembersAfterInsert >= maxMembers;
        let vcf_status = { vcf_uploaded: groupData.vcf_uploaded, vcf_file_name: groupData.vcf_file_name || null, is_full: groupData.is_full };

        if (groupData.vcf_type === 'general' && isNowFull) {
            const vcfSuccess = await handleGeneralGroupCompletion(groupData, supabase);
            
            if (vcfSuccess) {
                 vcf_status = { 
                     vcf_uploaded: true, 
                     vcf_file_name: generateVcfFileName(groupIdNum, 'general'),
                     is_full: true // Must be true if generation succeeded
                 };
            }
        }

        // --- 4. Return Final Status ---
        const finalResponse = { 
            success: true, 
            message: 'Successfully joined group.',
            user_is_member: true,
            current_members: currentMembersAfterInsert,
            max_members: maxMembers,
            ...vcf_status,
            is_full: vcf_status.is_full || isNowFull // Reflect current status or new full status
        };

        return res.json(finalResponse);

    } catch (error) {
        console.error(`Join Error:`, error.message);
        return res.status(500).json({ success: false, message: `Server error during join: ${error.message}` });
    }
});

// =================================================================
// 4. MODULE EXPORT (Ensure this is the final executable statement)
// =================================================================

module.exports = router;

