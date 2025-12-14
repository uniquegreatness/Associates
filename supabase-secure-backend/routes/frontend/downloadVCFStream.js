// routes/frontend/downloadVCFStream.js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 
const { getCohortStatus } = require('../../services/cohortService');

const supabase = supabaseAdmin; 

/**
 * FIX: USER DOWNLOAD (Matches cohort_template.html)
 * Route: /api/download-contacts?file_name=X&user_id=Y&cluster_id=Z
 */
router.get('/download-contacts', async (req, res) => {
    const { file_name, user_id, cluster_id } = req.query;

    if (!user_id || !file_name || !cluster_id) return res.status(400).send("Missing parameters.");

    try {
        const status = await getCohortStatus(parseInt(cluster_id, 10), user_id);
        if (!status.user_is_member) {
            return res.status(403).json({message: "You must be a member to download."});
        }

        const { data, error } = await supabase.storage
            .from('vcf_files')
            .createSignedUrl(file_name, 60);

        if (error || !data) throw new Error("Could not generate download link.");

        const fileResponse = await fetch(data.signedUrl);
        if (!fileResponse.ok) throw new Error("Storage file not found.");
        
        const fileBuffer = await fileResponse.arrayBuffer();
        
        res.setHeader('Content-Type', 'text/vcard');
        res.setHeader('Content-Disposition', `attachment; filename="${file_name}"`);
        res.send(Buffer.from(fileBuffer));

    } catch (error) {
        console.error("Download Error:", error.message);
        res.status(500).json({ message: "Failed to retrieve file." });
    }
});

module.exports = router;

