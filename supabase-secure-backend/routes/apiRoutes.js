// routes/apiRoutes.js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase'); 
const { requireAdminAuth } = require('../middleware/authMiddleware');
const { 
    generateVcfContent, 
    calculateClusterStats, 
    extractClusterIdFromFileName 
} = require('../utils/cohortUtils');
const { getCohortStatus } = require('../services/cohortService');

// Use Admin client for all server-side operations
const supabase = supabaseAdmin; 

/**
 * Endpoint 1: Authenticate a user token (Standard Supabase Auth)
 * Used by the client after receiving a token from the auth flow.
 */
router.post('/auth/token-sign-in', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ success: false, message: 'Token is required' });
    }

    try {
        // Use the Admin API to get user info from the JWT
        const { data: { user }, error: authError } = await supabase.auth.admin.getUser(token);

        if (authError || !user) {
            console.error('Token validation failed:', authError?.message);
            return res.status(401).json({ success: false, message: 'Invalid token' });
        }
        
        // Return the user object (safe subset of info)
        return res.json({ success: true, user: { 
            id: user.id, 
            email: user.email, 
            user_metadata: user.user_metadata 
        } });

    } catch (e) {
        console.error('Error during token sign-in:', e.message);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});


/**
 * Endpoint 2: Get Cluster Status (Membership, VCF Upload State)
 */
router.get('/cohorts/:cluster_id/status', async (req, res) => {
    const { cluster_id } = req.params;
    const { user_id } = req.query; // User ID must be passed from the client

    if (!user_id) {
         return res.status(400).json({ success: false, message: 'user_id query parameter is required.' });
    }

    const clusterIdNum = parseInt(cluster_id, 10);
    if (isNaN(clusterIdNum)) {
        return res.status(400).json({ success: false, message: 'Invalid cluster ID format.' });
    }

    const result = await getCohortStatus(clusterIdNum, user_id);
    
    if (result.success) {
        return res.json(result);
    } else {
        // Use 404 if the message explicitly says 'not found'
        if (result.message.includes('not found')) {
             return res.status(404).json(result);
        }
        return res.status(500).json(result);
    }
});

/**
 * Endpoint 3: Join a Cluster
 * CRITICAL: This operation must be atomic and check for capacity before insertion.
 */
router.post('/cohorts/:cluster_id/join', async (req, res) => {
    const { cluster_id } = req.params;
    const { user_id, user_email } = req.body; 

    if (!user_id || !user_email) {
        return res.status(400).json({ success: false, message: 'user_id and user_email are required.' });
    }
    
    const clusterIdNum = parseInt(cluster_id, 10);
    if (isNaN(clusterIdNum)) {
        return res.status(400).json({ success: false, message: 'Invalid cluster ID format.' });
    }

    try {
        // Step 1: Get the current status and check capacity
        const status = await getCohortStatus(clusterIdNum, user_id);
        
        if (!status.success) {
            return res.status(404).json({ success: false, message: status.message });
        }

        if (status.user_is_member) {
            console.warn(`User ${user_id.substring(0, 8)}... attempted to join cluster ${clusterIdNum} but is already a member.`);
            return res.json({ success: true, message: 'Already a member.' });
        }
        
        if (status.is_full) {
            return res.status(409).json({ success: false, message: 'Cluster is full or VCF uploaded. Cannot join.' });
        }
        
        if (!status.cohort_id) {
             return res.status(500).json({ success: false, message: 'Could not determine active cohort ID.' });
        }
        
        // Step 2: Attempt to insert the new member (uses RLS bypass via Admin)
        const newMember = {
            cluster_id: clusterIdNum,
            cohort_id: status.cohort_id,
            user_id: user_id,
            email: user_email,
            // Include dynamic_clusters.name in the log for clarity
            cluster_name: status.cluster_name || `Cluster ${clusterIdNum}`, 
            // set joined_at timestamp automatically by DB
        };

        const { error: insertError } = await supabase
            .from('cluster_cohort_members')
            .insert([newMember]);

        if (insertError) {
             // Handle unique constraint violation (should be covered by status check, but good for safety)
            if (insertError.code === '23505') { 
                return res.json({ success: true, message: 'Already a member.' });
            }
            throw insertError;
        }

        // Step 3: Recalculate and update the member count immediately
        const updatedStatus = await getCohortStatus(clusterIdNum, user_id);
        
        console.log(`User ${user_id.substring(0, 8)}... successfully joined cluster ${clusterIdNum}. New count: ${updatedStatus.current_members}`);

        // Check if the cluster is now full (to trigger VCF generation logic on the client)
        const isNowFull = updatedStatus.current_members >= status.max_members;
        
        return res.json({ 
            success: true, 
            message: 'Successfully joined cluster.', 
            is_full: isNowFull,
            current_members: updatedStatus.current_members,
            max_members: status.max_members
        });

    } catch (error) {
        console.error(`Error joining cluster ${cluster_id}:`, error.message);
        return res.status(500).json({ success: false, message: `Database operation failed: ${error.message}` });
    }
});


/**
 * Endpoint 4: Leave a Cluster
 */
router.post('/cohorts/:cluster_id/leave', async (req, res) => {
    const { cluster_id } = req.params;
    const { user_id } = req.body; 

    if (!user_id) {
        return res.status(400).json({ success: false, message: 'user_id is required.' });
    }
    
    const clusterIdNum = parseInt(cluster_id, 10);
    if (isNaN(clusterIdNum)) {
        return res.status(400).json({ success: false, message: 'Invalid cluster ID format.' });
    }

    try {
        // Check if VCF is already uploaded (if so, prevent leaving unless admin)
        const status = await getCohortStatus(clusterIdNum, user_id);
        
        if (!status.success) {
            return res.status(404).json({ success: false, message: status.message });
        }
        
        if (status.vcf_uploaded) {
            // Non-admin users cannot leave once the cohort is 'locked' by VCF upload
            console.warn(`User ${user_id.substring(0, 8)}... attempted to leave cluster ${clusterIdNum} but VCF is already uploaded.`);
            return res.status(403).json({ success: false, message: 'Cannot leave after VCF has been generated and uploaded.' });
        }

        // Attempt to delete the member row (uses RLS bypass via Admin)
        const { count, error: deleteError } = await supabase
            .from('cluster_cohort_members')
            .delete({ count: 'exact' })
            .eq('cluster_id', clusterIdNum)
            .eq('user_id', user_id);

        if (deleteError) {
            throw deleteError;
        }
        
        if (count === 0) {
            return res.json({ success: true, message: 'User was not a member.' });
        }

        // Recalculate and update the member count immediately
        const updatedStatus = await getCohortStatus(clusterIdNum, user_id);
        
        console.log(`User ${user_id.substring(0, 8)}... successfully left cluster ${clusterIdNum}. New count: ${updatedStatus.current_members}`);
        
        return res.json({ 
            success: true, 
            message: 'Successfully left cluster.',
            current_members: updatedStatus.current_members,
        });

    } catch (error) {
        console.error(`Error leaving cluster ${cluster_id}:`, error.message);
        return res.status(500).json({ success: false, message: `Database operation failed: ${error.message}` });
    }
});

// =================================================================
//                      ADMIN/SECURE ENDPOINTS (requireAdminAuth)
// =================================================================

/**
 * Endpoint 5: Download VCF (Admin Only)
 */
router.get('/cohorts/:cluster_id/download-vcf', requireAdminAuth, async (req, res) => {
    const { cluster_id } = req.params;
    const clusterIdNum = parseInt(cluster_id, 10);

    try {
        // Step 1: Get metadata to find the file name
        const { data: meta, error: metaError } = await supabase
            .from('cluster_metadata') 
            .select('vcf_file_name, vcf_uploaded, cluster_name') 
            .eq('cluster_id', clusterIdNum)
            .maybeSingle();

        if (metaError) throw metaError;
        if (!meta || !meta.vcf_uploaded || !meta.vcf_file_name) {
            return res.status(404).json({ success: false, message: 'VCF file not uploaded or metadata missing.' });
        }

        const fileName = meta.vcf_file_name;
        
        // Step 2: Generate the public signed URL for download
        const { data, error: urlError } = await supabase.storage
            .from('vcf_files') // Assuming this is your storage bucket name
            .createSignedUrl(fileName, 60); // URL expires in 60 seconds

        if (urlError) throw urlError;
        
        // Step 3: Increment download count
         const { error: countError } = await supabase
            .from('cluster_metadata')
            .update({ 
                vcf_download_count: supabase.select_cast('vcf_download_count + 1'), // Safely increment in Supabase
                last_downloaded_at: new Date().toISOString()
            })
            .eq('cluster_id', clusterIdNum);
            
        if (countError) {
             console.error(`Warning: Failed to increment VCF download count for cluster ${clusterIdNum}:`, countError.message);
             // Continue execution despite warning
        }
        
        // Return the signed URL to the client
        return res.json({ 
            success: true, 
            download_url: data.signedUrl, 
            filename: fileName,
            message: `Signed URL generated for VCF download for ${meta.cluster_name}.` 
        });

    } catch (error) {
        console.error(`Error generating VCF download URL for cluster ${cluster_id}:`, error.message);
        return res.status(500).json({ success: false, message: `Server error during VCF download preparation: ${error.message}` });
    }
});


/**
 * Endpoint 6: Check VCF Upload Status (Admin Only, used by client-side admin tools)
 */
router.get('/cohorts/:cluster_id/vcf-upload-status', requireAdminAuth, async (req, res) => {
    const { cluster_id } = req.params;
    const clusterIdNum = parseInt(cluster_id, 10);
    
    try {
         const { data, error } = await supabase
            .from('cluster_metadata') 
            .select('vcf_uploaded, vcf_file_name, vcf_download_count, current_members, max_members') 
            .eq('cluster_id', clusterIdNum)
            .maybeSingle();

        if (error) throw error;
        
        if (!data) {
            return res.status(404).json({ success: false, message: 'Cluster metadata not found.' });
        }

        return res.json({ 
            success: true, 
            status: data.vcf_uploaded ? 'uploaded' : 'pending',
            vcf_file_name: data.vcf_file_name,
            vcf_download_count: data.vcf_download_count,
            current_members: data.current_members,
            max_members: data.max_members,
        });

    } catch (error) {
        console.error(`Error checking VCF upload status for cluster ${cluster_id}:`, error.message);
        return res.status(500).json({ success: false, message: `Server error: ${error.message}` });
    }
});


/**
 * Endpoint 7: Get Combined Member List (Admin Only)
 * Combines data from 'cluster_cohort_members' and 'profiles'
 */
router.get('/cohorts/:cluster_id/members', requireAdminAuth, async (req, res) => {
    const { cluster_id } = req.params;
    const clusterIdNum = parseInt(cluster_id, 10);
    
    try {
        // Step 1: Find the active cohort ID
        // Note: req.user.id is available from requireAdminAuth middleware
        const status = await getCohortStatus(clusterIdNum, req.user.id); 
        if (!status.success || !status.cohort_id) {
             return res.status(404).json({ success: false, message: status.message || 'Active cohort not found.' });
        }
        
        const active_cohort_id = status.cohort_id;
        
        // Step 2: Fetch members and their profile data (JOIN via RLS bypass)
        const { data: members, error } = await supabase
            .from('cluster_cohort_members') 
            .select(`
                user_id, 
                email, 
                joined_at,
                profiles (
                    nickname, 
                    age, 
                    gender, 
                    country, 
                    profession, 
                    display_profession,
                    whatsapp_number,
                    friend_reasons,
                    services
                )
            `)
            .eq('cluster_id', clusterIdNum)
            .eq('cohort_id', active_cohort_id); 

        if (error) throw error;

        // Flatten the data structure for easier consumption
        const combinedMembers = members.map(member => ({
            ...member.profiles, // Includes nickname, age, gender, etc.
            user_id: member.user_id,
            email: member.email,
            joined_at: member.joined_at,
        }));
        
        return res.json({ success: true, members: combinedMembers });

    } catch (error) {
        console.error(`Error fetching combined member list for cluster ${cluster_id}:`, error.message);
        return res.status(500).json({ success: false, message: `Server error: ${error.message}` });
    }
});


/**
 * Endpoint 8: Get Cluster Statistics (Admin Only)
 */
router.get('/cohorts/:cluster_id/stats', requireAdminAuth, async (req, res) => {
    const { cluster_id } = req.params;
    const { user_country } = req.query; // User's country for Local/Abroad mix calculation

    try {
        const clusterIdNum = parseInt(cluster_id, 10);
        // Note: req.user.id is available from requireAdminAuth middleware
        const status = await getCohortStatus(clusterIdNum, req.user.id); 
        if (!status.success || !status.cohort_id) {
             return res.status(404).json({ success: false, message: 'Active cohort not found.' });
        }
        
        // Fetch only the profile data needed for stats calculation
        const { data: members, error } = await supabase
            .from('cluster_cohort_members') 
            .select(`
                profiles (
                    age, gender, country, profession, display_profession, friend_reasons, services
                )
            `)
            .eq('cluster_id', clusterIdNum)
            .eq('cohort_id', status.cohort_id); 
            
        if (error) throw error;
        
        // Flatten the data structure
        const combinedMembers = members.map(member => member.profiles);

        // Calculate statistics using the utility function
        const stats = calculateClusterStats(combinedMembers, user_country);

        return res.json({ success: true, stats: stats });

    } catch (error) {
        console.error(`Error calculating cluster stats for ${cluster_id}:`, error.message);
        return res.status(500).json({ success: false, message: `Server error: ${error.message}` });
    }
});


/**
 * Endpoint 9: Request VCF Upload URL (Admin Only)
 * Step 1 of the VCF generation process: generates VCF content and signs an upload URL.
 */
router.post('/cohorts/:cluster_id/vcf-upload-request', requireAdminAuth, async (req, res) => {
    const { cluster_id } = req.params;
    const clusterIdNum = parseInt(cluster_id, 10);
    
    try {
        // Step 1: Check status and get cohort ID
        const status = await getCohortStatus(clusterIdNum, req.user.id);
        if (!status.success || !status.cohort_id) {
             return res.status(404).json({ success: false, message: 'Active cohort not found for VCF generation.' });
        }
        
        // Step 2: Fetch only the profile data required for VCF
        const { data: members, error } = await supabase
            .from('cluster_cohort_members') 
            .select(`
                profiles (
                    nickname, 
                    profession, 
                    display_profession,
                    whatsapp_number
                )
            `)
            .eq('cluster_id', clusterIdNum)
            .eq('cohort_id', status.cohort_id); 
            
        if (error) throw error;
        
        const combinedContacts = members.map(member => member.profiles);
        
        if (combinedContacts.length === 0) {
            return res.status(400).json({ success: false, message: 'Cannot generate VCF: No members found in the cohort.' });
        }

        // Step 3: Generate VCF content string
        const vcfContent = generateVcfContent(combinedContacts);

        // Step 4: Create a unique file name
        // Format: Cluster_Contacts_C_{cluster_id}_{uuid}.vcf
        const uuid = Math.random().toString(36).substring(2, 10);
        const fileName = `Cluster_Contacts_C_${clusterIdNum}_${uuid}.vcf`;
        
        // Step 5: Generate a signed upload URL (Supabase storage)
        const { data: uploadData, error: uploadUrlError } = await supabase.storage
            .from('vcf_files')
            .createSignedUploadUrl(fileName);

        if (uploadUrlError) throw uploadUrlError;
        
        // Return the VCF content and the signed URL
        return res.json({ 
            success: true, 
            upload_url: uploadData.signedUrl,
            file_path: fileName,
            vcf_content: vcfContent,
            message: 'VCF content and signed upload URL generated.'
        });

    } catch (error) {
        console.error(`Error requesting VCF upload URL for cluster ${cluster_id}:`, error.message);
        return res.status(500).json({ success: false, message: `Server error during VCF request: ${error.message}` });
    }
});


/**
 * Endpoint 10: Commit VCF Upload (Admin Only)
 * Step 2 of the VCF generation process: updates metadata after successful upload.
 */
router.post('/cohorts/:cluster_id/vcf-commit', requireAdminAuth, async (req, res) => {
    const { cluster_id } = req.params;
    const { file_name } = req.body; 

    if (!file_name) {
        return res.status(400).json({ success: false, message: 'file_name is required in the body.' });
    }
    
    const clusterIdNum = parseInt(cluster_id, 10);
    if (isNaN(clusterIdNum)) {
        return res.status(400).json({ success: false, message: 'Invalid cluster ID format.' });
    }
    
    // Optional check: Ensure the cluster_id in the URL matches the file_name 
    const fileClusterId = extractClusterIdFromFileName(file_name);
    if (fileClusterId !== clusterIdNum) {
        console.warn(`VCF Commit Mismatch: URL ID ${clusterIdNum} does not match file ID ${fileClusterId}`);
        // Continue execution but log the warning
    }

    try {
        // Update cluster_metadata to mark VCF as uploaded and store the filename
        const { data: updatedMeta, error: updateError } = await supabase
            .from('cluster_metadata')
            .update({
                vcf_uploaded: true,
                vcf_file_name: file_name,
                current_members: supabase.select_cast('current_members'), // ensure no race condition on count
                last_updated: new Date().toISOString(),
            })
            .eq('cluster_id', clusterIdNum)
            .select('cluster_id')
            .single();

        if (updateError) throw updateError;
        
        console.log(`VCF committed successfully for cluster ${clusterIdNum} with file: ${file_name}`);

        return res.json({ 
            success: true, 
            message: 'VCF file name committed to database. Cluster status locked.' 
        });

    } catch (error) {
        console.error(`Error committing VCF upload for cluster ${cluster_id}:`, error.message);
        return res.status(500).json({ success: false, message: `Database commit failed: ${error.message}` });
    }
});

/**
 * Endpoint 11: Get Member List for Display (Not Admin-gated, but sensitive data excluded)
 */
router.get('/cohorts/:cluster_id/members/display', async (req, res) => {
    const { cluster_id } = req.params;
    const clusterIdNum = parseInt(cluster_id, 10);
    const { user_id } = req.query; // Used for membership check

    if (!user_id) {
         return res.status(400).json({ success: false, message: 'user_id query parameter is required.' });
    }

    try {
        // Step 1: Check if the requesting user is a member of the cohort 
        const status = await getCohortStatus(clusterIdNum, user_id);
        if (!status.success || !status.cohort_id) {
             return res.status(404).json({ success: false, message: status.message || 'Active cohort not found.' });
        }
        
        // User must be a member to see the list
        if (!status.user_is_member) {
            return res.status(403).json({ success: false, message: 'Access denied. You must be a member of this cluster to view the member list.' });
        }

        const active_cohort_id = status.cohort_id;
        
        // Step 2: Fetch members and their public profile data 
        // CRITICAL: We only select public fields here (nickname, gender, country, profession, interests)
        const { data: members, error } = await supabase
            .from('cluster_cohort_members') 
            .select(`
                user_id, 
                joined_at,
                profiles (
                    nickname, 
                    gender, 
                    country, 
                    profession, 
                    display_profession,
                    friend_reasons,
                    services
                )
            `)
            .eq('cluster_id', clusterIdNum)
            .eq('cohort_id', active_cohort_id); 

        if (error) throw error;

        // Flatten the data structure
        const combinedMembers = members.map(member => ({
            ...member.profiles,
            user_id: member.user_id,
            joined_at: member.joined_at,
        }));
        
        return res.json({ success: true, members: combinedMembers });

    } catch (error) {
        console.error(`Error fetching display member list for cluster ${cluster_id}:`, error.message);
        return res.status(500).json({ success: false, message: `Server error: ${error.message}` });
    }
});


module.exports = router;
