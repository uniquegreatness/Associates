// routes/frontend/trackDownload.js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 

const supabase = supabaseAdmin; 

/**
 * FIX: TRACK DOWNLOAD (Matches cohort_template.html)
 * Route: /api/track-download
 */
router.post('/track-download', async (req, res) => {
    const { cluster_id } = req.body;
    
    try {
        const { data, error } = await supabase
            .from('cluster_metadata')
            .update({ 
                vcf_download_count: supabase.select_cast('vcf_download_count + 1'),
                last_downloaded_at: new Date().toISOString()
            })
            .eq('cluster_id', cluster_id)
            .select('vcf_download_count')
            .single();

        return res.json({ 
            success: true, 
            vcf_download_count: data ? data.vcf_download_count : 0 
        });

    } catch (e) {
        console.error("Tracking Error:", e);
        return res.status(500).json({ success: false });
    }
});

module.exports = router;

