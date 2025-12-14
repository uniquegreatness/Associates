// routes/admin/getVcfStatusAdmin.js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 
const { requireAdminAuth } = require('../../middleware/authMiddleware');

const supabase = supabaseAdmin; 

/**
 * Endpoint 7: Check VCF Upload Status (Admin Only)
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

module.exports = router;
