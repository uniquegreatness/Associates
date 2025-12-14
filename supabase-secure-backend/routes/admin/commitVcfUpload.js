// routes/admin/commitVcfUpload.js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 
const { requireAdminAuth } = require('../../middleware/authMiddleware');
const { extractClusterIdFromFileName } = require('../../utils/cohortUtils');

const supabase = supabaseAdmin;

/**
 * Endpoint 11: Commit VCF Upload (Admin Only)
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
    
    const fileClusterId = extractClusterIdFromFileName(file_name);
    if (fileClusterId !== clusterIdNum) {
        console.warn(`VCF Commit Mismatch: URL ID ${clusterIdNum} does not match file ID ${fileClusterId}`);
    }

    try {
        const { data: updatedMeta, error: updateError } = await supabase
            .from('cluster_metadata')
            .update({
                vcf_uploaded: true,
                vcf_file_name: file_name,
                current_members: supabase.select_cast('current_members'), 
                last_updated: new Date().toISOString(),
            })
            .eq('cluster_id', clusterIdNum)
            .select('cluster_id')
            .single();

        if (updateError) throw updateError;
        
        return res.json({ 
            success: true, 
            message: 'VCF file name committed to database. Cluster status locked.' 
        });

    } catch (error) {
        console.error(`Error committing VCF upload for cluster ${cluster_id}:`, error.message);
        return res.status(500).json({ success: false, message: `Database commit failed: ${error.message}` });
    }
});

module.exports = router;

