// routes/admin/requestVcfUpload.js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 
const { requireAdminAuth } = require('../../middleware/authMiddleware');
const { generateVcfContent } = require('../../utils/cohortUtils');
const { getCohortStatus } = require('../../services/cohortService');

const supabase = supabaseAdmin; 

/**
 * Endpoint 10: Request VCF Upload URL (Admin Only)
 */
router.post('/cohorts/:cluster_id/vcf-upload-request', requireAdminAuth, async (req, res) => {
    const { cluster_id } = req.params;
    const clusterIdNum = parseInt(cluster_id, 10);
    
    try {
        const status = await getCohortStatus(clusterIdNum, req.user.id);
        if (!status.success || !status.cohort_id) {
             return res.status(404).json({ success: false, message: 'Active cohort not found for VCF generation.' });
        }
        
        const { data: members, error } = await supabase
            .from('cluster_cohort_members') 
            .select(`
                user_profiles (
                    nickname, 
                    profession, 
                    display_profession,
                    whatsapp_number
                )
            `)
            .eq('cluster_id', clusterIdNum)
            .eq('cohort_id', status.cohort_id); 
            
        if (error) throw error;
        
        const combinedContacts = members.map(member => member.user_profiles);
        
        if (combinedContacts.length === 0) {
            return res.status(400).json({ success: false, message: 'Cannot generate VCF: No members found in the cohort.' });
        }

        const vcfContent = generateVcfContent(combinedContacts);

        const uuid = Math.random().toString(36).substring(2, 10);
        const fileName = `Cluster_Contacts_C_${clusterIdNum}_${uuid}.vcf`;
        
        const { data: uploadData, error: uploadUrlError } = await supabase.storage
            .from('vcf_files')
            .createSignedUploadUrl(fileName);

        if (uploadUrlError) throw uploadUrlError;
        
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

module.exports = router;

