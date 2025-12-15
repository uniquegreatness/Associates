const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 

const supabase = supabaseAdmin;
const VCF_BUCKET_NAME = 'near_vcf_bucket';

// --- Utility Functions (Re-used/Adapted) ---

// VCF Content Generation Function (from joinGroup.js, ensuring consistency)
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
 * Helper to fetch profiles required for VCF generation.
 * @param {Array<Object>} groupMembers - List of {user_id, display_profession}
 * @returns {Array<Object>} Contacts ready for VCF generation.
 */
async function getVcfContacts(groupMembers) {
    const userIds = groupMembers.map(m => m.user_id);

    const { data: profiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('user_id, nickname, profession, whatsapp_number')
        .in('user_id', userIds);
    
    if (profileError) {
        throw new Error('Failed to fetch user profiles for VCF.');
    }

    // Merge group-specific profession with profile data
    return groupMembers.map(member => {
        const profile = profiles.find(p => p.user_id === member.user_id);
        return profile ? { ...profile, display_profession: member.display_profession } : null;
    }).filter(c => c !== null);
}

// --- Main Download Logic ---

/**
 * GET /api/groups/download?group_id=X&user_id=Y
 * Handles VCF generation, serving, and cleanup based on group type and user role.
 */
router.get('/download', async (req, res) => {
    const { group_id, user_id } = req.query;

    if (!group_id || !user_id) {
        return res.status(400).json({ success: false, message: 'Group ID and User ID are required.' });
    }

    const groupIdNum = parseInt(group_id, 10);
    console.log(`API: Download request for Group ${groupIdNum} by User ${user_id.substring(0, 8)}`);

    try {
        // 1. Fetch Group and Membership Status
        const { data: group, error: groupError } = await supabase
            .from('groups')
            .select('*') // Get all fields needed for logic (type, creator, vcf_uploaded, max_members)
            .eq('group_id', groupIdNum)
            .single();

        const { data: member, error: memberError } = await supabase
            .from('group_members')
            .select('has_downloaded_vcf, display_profession')
            .eq('group_id', groupIdNum)
            .eq('user_id', user_id)
            .single();

        if (groupError || !group) {
            return res.status(404).send('Group not found.');
        }

        if (memberError || !member) {
            return res.status(403).send('Access denied. You are not a member of this group.');
        }

        const isCreator = group.creator_user_id === user_id;
        
        // Check for double download on general group (if already downloaded, we deny, or just stream it again?)
        // For security/tracking, we deny if they already marked it downloaded, unless this is a new file.
        // We will assume that if 'general' and already downloaded, they don't need to re-download.
        if (group.vcf_type === 'general' && group.vcf_uploaded && member.has_downloaded_vcf) {
            // NOTE: If VCF is deleted after all members download, this check might fail later.
            // For now, allow re-download if the file exists, but don't re-run status updates.
            // Let's proceed to the General download path to check file existence.
        }

        // --- 2. VCF Type Routing ---

        if (group.vcf_type === 'general') {
            // ----------------------------------------------------
            // A. GENERAL VCF TYPE: Fetch pre-generated file
            // ----------------------------------------------------
            if (!group.vcf_uploaded || !group.vcf_file_name) {
                 return res.status(404).send('General VCF not ready. Group may not be full yet.');
            }

            const storagePath = `vcf_exchange/${group.vcf_file_name}`;

            // Download file from storage
            const { data: fileBlob, error: downloadError } = await supabase.storage
                .from(VCF_BUCKET_NAME)
                .download(storagePath);
            
            if (downloadError) {
                console.error('General VCF Download Error:', downloadError);
                return res.status(500).send('Error retrieving VCF file.');
            }
            
            // Convert Blob to ArrayBuffer and then to Buffer for Express
            const buffer = Buffer.from(await fileBlob.arrayBuffer());
            
            // --- 2a. Tracking and Cleanup (General) ---
            await updateDownloadStatusAndCleanup(groupIdNum, user_id, group.max_members, storagePath);
            
            // 3. Serve the file
            res.setHeader('Content-Type', 'text/vcard');
            res.setHeader('Content-Disposition', `attachment; filename="${group.vcf_file_name}"`);
            return res.send(buffer);

        } else if (group.vcf_type === 'direct') {
            // ----------------------------------------------------
            // B. DIRECT VCF TYPE: Generate VCF on demand (Ephemeral)
            // ----------------------------------------------------
            
            let contactsToInclude = [];
            let fileNameSuffix = '';

            if (!isCreator) {
                // Invited User: Download Creator's contact
                console.log(`Direct Group: Invited user ${user_id} downloading CREATOR VCF.`);
                const { data: creatorProfile } = await supabase
                    .from('user_profiles')
                    .select('user_id, nickname, profession, whatsapp_number')
                    .eq('user_id', group.creator_user_id)
                    .single();
                
                if (!creatorProfile) {
                     return res.status(500).send('Creator profile not found.');
                }
                
                contactsToInclude.push({ 
                    ...creatorProfile, 
                    display_profession: member.display_profession // Use the user's setting for the label
                });
                fileNameSuffix = `Creator_Contacts_${groupIdNum}.vcf`;

            } else {
                // Creator: Download All Current Members' contacts
                console.log(`Direct Group: Creator ${user_id} downloading ALL MEMBERS VCF.`);
                
                const { data: allMembers } = await supabase
                    .from('group_members')
                    .select('user_id, display_profession')
                    .eq('group_id', groupIdNum)
                    .neq('user_id', user_id); // Exclude creator from the VCF list

                contactsToInclude = await getVcfContacts(allMembers);
                
                // Add the creator's own profile to the VCF list for their own download
                const { data: creatorProfile } = await supabase
                    .from('user_profiles')
                    .select('user_id, nickname, profession, whatsapp_number')
                    .eq('user_id', user_id)
                    .single();

                if (creatorProfile) {
                    contactsToInclude.push({
                        ...creatorProfile,
                        display_profession: member.display_profession 
                    });
                }
                
                fileNameSuffix = `All_Members_Contacts_${groupIdNum}.vcf`;
            }

            // 3. Generate VCF Content
            const vcfContent = generateVcfContent(contactsToInclude);
            const storagePath = `vcf_exchange/temp_${fileNameSuffix}`;
            
            // 4. Upload Temporarily (Needed for secure streaming/handling large files, but we delete immediately)
            const { error: uploadError } = await supabase.storage
                .from(VCF_BUCKET_NAME) 
                .upload(storagePath, vcfContent, { contentType: 'text/vcard', upsert: true });

            if (uploadError) {
                console.error('Direct VCF Temp Upload Error:', uploadError);
                return res.status(500).send('Error generating VCF.');
            }
            
            // 5. Stream and Delete
            
            // Get the public URL for streaming (or use internal streaming if Supabase allows)
            const { data: publicUrlData } = supabase.storage
                .from(VCF_BUCKET_NAME)
                .getPublicUrl(storagePath);

            // Set headers and redirect/stream
            res.setHeader('Content-Type', 'text/vcard');
            res.setHeader('Content-Disposition', `attachment; filename="${fileNameSuffix}"`);
            
            // Simple approach: Delete the temporary file asynchronously after sending headers
            res.on('finish', async () => {
                await supabase.storage
                    .from(VCF_BUCKET_NAME)
                    .remove([storagePath]);
                console.log(`Ephemeral VCF deleted: ${storagePath}`);
            });

            // Redirect to the public URL to initiate download
            return res.redirect(publicUrlData.publicUrl);
        }

    } catch (error) {
        console.error('Download API Error:', error);
        return res.status(500).send('Internal server error during VCF download process.');
    }
});

module.exports = router;


/**
 * Helper function to update status and run cleanup for GENERAL groups.
 */
async function updateDownloadStatusAndCleanup(groupIdNum, user_id, maxMembers, vcfStoragePath) {
    // 1. Mark the user as having downloaded the VCF
    const { error: memberUpdateError } = await supabase
        .from('group_members')
        .update({ has_downloaded_vcf: true })
        .eq('group_id', groupIdNum)
        .eq('user_id', user_id)
        .eq('has_downloaded_vcf', false); // Only update if not already downloaded

    if (memberUpdateError) {
        console.error('Failed to mark member as downloaded:', memberUpdateError);
        return; 
    }
    
    // 2. Update the total download count for the group
    const { error: groupIncrementError } = await supabase.rpc('increment_members_downloaded', { group_id_param: groupIdNum });

    if (groupIncrementError) {
        console.error('Failed to increment group download count:', groupIncrementError);
        return;
    }
    
    // NOTE: For this RPC to work, you must create the following Supabase function:
    /*
    -- Supabase RPC Function to safely increment and check for cleanup
    CREATE OR REPLACE FUNCTION increment_members_downloaded(group_id_param INT)
    RETURNS VOID AS $$
    DECLARE
        v_current_downloads INT;
        v_max_members INT;
    BEGIN
        -- Atomically increment and return new count/max members
        UPDATE groups
        SET members_downloaded = members_downloaded + 1
        WHERE group_id = group_id_param
        RETURNING members_downloaded, max_members INTO v_current_downloads, v_max_members;

        -- Check if all members have now downloaded (for cleanup)
        IF v_current_downloads >= v_max_members THEN
            -- Delete all member records (the final cleanup action)
            DELETE FROM group_members WHERE group_id = group_id_param;
            
            -- Optionally: Delete the VCF file from storage here (or leave it as an archive)
            -- For now, we leave the VCF file in storage to match your previous logic, 
            -- but delete the records as requested.
            
            -- Set group to completed and inactive
            UPDATE groups
            SET is_completed_and_inactive = TRUE
            WHERE group_id = group_id_param;
            
        END IF;
    END;
    $$ LANGUAGE plpgsql;
    */

    // 3. Final Check and Cleanup (Deletion of records)
    // The RPC function is now responsible for the deletion of group_members records.
}

