const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 
const { getCohortStatus } = require('../../services/cohortService');

const supabase = supabaseAdmin; 

/**
 * Utility function to generate VCF content string from contacts array.
 * This implementation creates a VCF 3.0 string based on the fetched profile data.
 * @param {Array<Object>} contacts - Array of contact objects (user_id, nickname, profession, whatsapp_number, display_profession)
 * @returns {string} The complete VCF file content.
 */
function generateVcfContent(contacts) {
    let vcfContent = '';

    contacts.forEach(contact => {
        // Use display_profession (which might be null/undefined) or fallback to profession, or a default
        const profession = contact.display_profession || contact.profession || 'Professional Contact';
        const name = contact.nickname || `User ${contact.user_id.substring(0, 8)}`;
        const phone = contact.whatsapp_number || '';

        vcfContent += 'BEGIN:VCARD\n';
        vcfContent += 'VERSION:3.0\n';
        
        // FN: Formatted Name (Including profession for clarity)
        vcfContent += `FN:${name} (${profession})\n`;
        
        // N: Structured Name (Surname;Given;Middle;Prefix;Suffix) - Using FN content for simplicity
        vcfContent += `N:${name};;;\n`; 
        
        // TITLE: Profession/Title
        vcfContent += `TITLE:${profession}\n`;
        
        // TEL: Telephone Number (TYPE=CELL for mobile)
        if (phone) {
            // Clean phone number for VCF standards
            const cleanPhone = phone.replace(/[^0-9+]/g, ''); 
            vcfContent += `TEL;TYPE=CELL:${cleanPhone}\n`;
        }
        vcfContent += 'END:VCARD\n';
    });

    return vcfContent;
}


/**
 * Handles the logic for VCF generation, upload to Storage, and database status updates
 * when a cohort reaches its maximum capacity.
 * @returns {string | null} The generated VCF filename if successful, otherwise null.
 */
async function handleCohortCompletionAndVCF(clusterIdNum, cohortId, maxMembers, supabase) {
    console.log(`COHORT ${cohortId} IS FULL (${maxMembers}/${maxMembers}). Triggering VCF exchange process.`);

    let vcfUploadSuccessful = false;
    let vcfContacts = [];
    const vcfFileName = `Cluster_Contacts_${cohortId}.vcf`;
    let returnedVcfFileName = null; // New variable to store the final filename

    // 1. Robust Two-Step Fetch for VCF Data
    const { data: cohortMembers, error: membersFetchError } = await supabase
        .from('cluster_cohort_members')
        .select('user_id, display_profession') // Fetches the user's specific profession choice for this cohort
        .eq('cohort_id', cohortId);
    
    if (membersFetchError || !cohortMembers || cohortMembers.length === 0) {
        console.error('VCF Error: Failed to get user IDs from cohort.', membersFetchError);
    } else {
        const userIds = cohortMembers.map(m => m.user_id);
        
        // Fetch full user profiles
        const { data: profiles, error: profilesFetchError } = await supabase
            .from('user_profiles')
            .select('user_id, nickname, profession, whatsapp_number')
            .in('user_id', userIds);
        
        if (profilesFetchError || !profiles || profiles.length === 0) {
            console.error('VCF Error: Failed to fetch user profiles for VCF.', profilesFetchError);
        } else {
            // Combine cohort-specific profession with profile data
            vcfContacts = cohortMembers.map(member => {
                const profile = profiles.find(p => p.user_id === member.user_id);
                return profile ? {
                    ...profile,
                    display_profession: member.display_profession 
                } : null;
            }).filter(c => c !== null); 
        }
    }
    
    // 2. Generate VCF and Upload
    if (vcfContacts.length === maxMembers) { 
        
        const vcfContent = generateVcfContent(vcfContacts); 
        const storagePath = `vcf_exchange/${vcfFileName}`;
        
        // Upload VCF to Supabase Storage (near_vcf_bucket assumed from your extracted code)
        const { error: uploadError } = await supabase.storage
            .from('near_vcf_bucket') 
            .upload(storagePath, vcfContent, {
                contentType: 'text/vcard',
                upsert: true
            });

        if (uploadError) {
            console.error('VCF Upload Error:', uploadError);
        } else {
            console.log(`VCF uploaded successfully for Cohort ID: ${cohortId}.`);
            vcfUploadSuccessful = true; 
            returnedVcfFileName = vcfFileName; // Store the successful name
        }
    } else {
         console.warn(`VCF generation skipped due to incorrect contact count: ${vcfContacts.length}/${maxMembers}. Expected ${maxMembers}.`);
    }
    
    // 3. CRITICAL: Update Cohort Status and Metadata to PAUSE/FULL state
    const cohortUpdatePayload = {
        is_full: true,
        vcf_uploaded: vcfUploadSuccessful,
        vcf_file_name: returnedVcfFileName, // Use the stored successful name
    };
    
    // Update cluster_cohorts table (Primary source of truth for VCF filename)
    const { error: cohortUpdateError } = await supabase
        .from('cluster_cohorts')
        .update(cohortUpdatePayload)
        .eq('cohort_id', cohortId);
        
    if (cohortUpdateError) {
         console.error(`Failed to update cluster_cohorts status: ${cohortUpdateError.message}`);
    }

    // Update cluster_metadata table (To reflect the latest VCF availability for the entire cluster category)
    if (vcfUploadSuccessful) {
        console.log(`VCF succeeded. Updating cluster_metadata to PAUSE state for cluster ${clusterIdNum}.`);

        const { error: metadataUpdateError } = await supabase
            .from('cluster_metadata') 
            .update({ 
                vcf_uploaded: true,
                vcf_file_name: returnedVcfFileName, // Use the stored successful name
                vcf_download_count: 0,
                last_updated: new Date().toISOString()
            }) 
            .eq('cluster_id', clusterIdNum); 
        
        if (metadataUpdateError) {
             console.error(`Failed to update cluster_metadata status: ${metadataUpdateError.message}`);
        }
    }
    
    return returnedVcfFileName; // Return the VCF filename to the caller
}


/**
 * POST /api/join-cluster
 * The merged API endpoint.
 */
router.post('/join-cluster', async (req, res) => {
    const { p_cluster_id, p_user_id, p_display_profession, p_ref_code } = req.body; 
    
    const user_id = p_user_id;
    const cluster_id = p_cluster_id;

    if (!user_id || !cluster_id) {
        return res.status(400).json({ success: false, message: 'User ID and Cluster ID required.' });
    }
    
    const clusterIdNum = parseInt(cluster_id, 10);
    // Variable to hold the VCF name if it's generated during this API call
    let generatedVcfFileName = null; 

    try {
        // 1. Check current status before attempting to join
        let status = await getCohortStatus(clusterIdNum, user_id);
        
        if (status.user_is_member) {
            return res.json({ 
                success: true, 
                message: 'Already a member.',
                ...status 
            });
        }
        if (status.is_full) {
            return res.status(409).json({ success: false, message: 'Cluster is full.' });
        }
        
        // 2. Prepare and execute the insert payload for cluster_cohort_members
        const newMember = {
            cluster_id: clusterIdNum,
            cohort_id: status.cohort_id, // Use the cohort_id returned from getCohortStatus
            user_id: user_id,
            display_profession: p_display_profession || status.user_profession // Store their chosen profession for this cohort
        };

        const { error: insertError } = await supabase
            .from('cluster_cohort_members')
            .insert([newMember]);

        if (insertError) {
            if (insertError.code === '23505') { 
                 console.warn(`Attempted duplicate join for user ${user_id} on cluster ${cluster_id}.`);
                 return res.status(409).json({ success: false, message: 'You have already joined this cluster.' });
            }
            throw insertError;
        }

        // 3. Update user profile's preference (for future cohorts/default)
        if (p_display_profession !== undefined) {
             await supabase.from('user_profiles').update({ display_profession: p_display_profession }).eq('user_id', user_id);
        }
        
        // 4. Optionally process referral code
        if (p_ref_code) {
             console.log(`Tracking referral code ${p_ref_code} for user ${user_id} joining cluster ${cluster_id}.`);
        }

        // === HANDLE COHORT COMPLETION AND VCF GENERATION ===
        const { count: currentMembersAfterInsert } = await supabase
            .from('cluster_cohort_members')
            .select('*', { count: 'exact' })
            .eq('cohort_id', status.cohort_id);
            
        const maxMembers = status.max_members || 5; 

        if (currentMembersAfterInsert >= maxMembers) {
            // Trigger the robust VCF generation, upload, and database status updates
            // CRITICAL FIX: Capture the returned VCF filename
            generatedVcfFileName = await handleCohortCompletionAndVCF(clusterIdNum, status.cohort_id, maxMembers, supabase);
        }
        // ===============================================================

        // 5. Fetch and return the FINAL updated status
        const updatedStatus = await getCohortStatus(clusterIdNum, user_id);
        
        // CRITICAL FIX: Ensure the VCF file name is included in the response, 
        // overwriting any stale data from getCohortStatus if generation just completed
        const finalResponseStatus = { 
            ...updatedStatus, 
            user_is_member: true, 
        };
        
        if (generatedVcfFileName) {
            finalResponseStatus.vcf_file_name = generatedVcfFileName;
            finalResponseStatus.vcf_uploaded = true;
            finalResponseStatus.is_full = true;
        }


        return res.json({ 
            success: true, 
            ...finalResponseStatus,
        });

    } catch (error) {
        console.error(`Join Error:`, error.message);
        return res.status(500).json({ success: false, message: `Server error during join: ${error.message}` });
    }
});

module.exports = router;

