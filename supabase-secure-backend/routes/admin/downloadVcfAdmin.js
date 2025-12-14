// routes/admin/downloadVcfAdmin.js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 
const { requireAdminAuth } = require('../../middleware/authMiddleware');

const supabase = supabaseAdmin; 

/**
 * Endpoint 6: Download VCF (Admin Only)
 */
router.get('/cohorts/:cluster_id/download-vcf', requireAdminAuth, async (req, res) => {
    const { cluster_id } = req.params;
    const clusterIdNum = parseInt(cluster_id, 10);

    try {
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
        
        const { data, error: urlError } = await supabase.storage
            .from('vcf_files')
            .createSignedUrl(fileName, 60);

        if (urlError) throw urlError;
        
         const { error: countError } = await supabase
            .from('cluster_metadata')
            .update({ 
                vcf_download_count: supabase.select_cast('vcf_download_count + 1'),
                last_downloaded_at: new Date().toISOString()
            })
            .eq('cluster_id', clusterIdNum);
            
        if (countError) {
             console.error(`Warning: Failed to increment VCF download count for cluster ${clusterIdNum}:`, countError.message);
        }
        
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

module.exports = router;

