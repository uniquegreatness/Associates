const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 
const { getCohortStatus } = require('../../services/cohortService');

const supabase = supabaseAdmin; 

/**
 * FIX: USER DOWNLOAD (Matches cohort_template.html)
 * Route: /api/download-contacts?file_name=X&user_id=Y&cluster_id=Z
 * * IMPLEMENTATION FIX: Replaced the memory-intensive approach (loading the full file 
 * into an ArrayBuffer/Buffer) with a direct streaming pipeline using response.body.pipe(res) 
 * to handle large files more efficiently.
 */
router.get('/download-contacts', async (req, res) => {
    const { file_name, user_id, cluster_id } = req.query;

    if (!user_id || !file_name || !cluster_id) {
        return res.status(400).send("Missing file_name, user_id, or cluster_id parameter.");
    }

    try {
        // 1. Authorization Check: Ensure the user is a member of the cluster
        const status = await getCohortStatus(parseInt(cluster_id, 10), user_id);
        if (!status.user_is_member) {
            return res.status(403).json({message: "You must be a member to download contacts for this cluster."});
        }

        // 2. Generate a temporary, time-limited signed URL for the VCF file
        const { data, error: signedUrlError } = await supabase.storage
            .from('vcf_files')
            .createSignedUrl(file_name, 60); // URL valid for 60 seconds

        if (signedUrlError || !data || !data.signedUrl) {
            console.error("Supabase Signed URL Error:", signedUrlError);
            throw new Error("Could not generate secure download link.");
        }

        // 3. Fetch the file content using the signed URL
        const fileResponse = await fetch(data.signedUrl);
        
        if (!fileResponse.ok) {
            console.error(`Storage Fetch Failed. Status: ${fileResponse.status}`);
            throw new Error("Storage file not found or access denied.");
        }
        
        // 4. Set Headers for Download and Stream the File
        // IMPORTANT: Set headers before piping the stream
        res.setHeader('Content-Type', 'text/vcard');
        res.setHeader('Content-Disposition', `attachment; filename="${file_name}"`);
        
        // Use streaming to pipe the response body directly to the Express response
        // This is highly efficient for binary data and avoids memory saturation.
        fileResponse.body.pipe(res);

    } catch (error) {
        console.error("Download Error:", error.message);
        // Ensure the response is handled cleanly if streaming hasn't started
        if (!res.headersSent) {
            res.status(500).json({ message: "Failed to retrieve file. " + error.message });
        } else {
            // If headers were sent, we rely on the stream to close the connection
            console.error("Error occurred after streaming started, connection may be interrupted.");
        }
    }
});

module.exports = router;
