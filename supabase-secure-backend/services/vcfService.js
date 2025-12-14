/**
 * Extracted VCF Content Generation Utility
 * Location: Should be in your VCF utility service file (e.g., vcfService.js or similar).
 */
function generateVcfContent(contacts) {
    let vcfString = '';

    contacts.forEach(contact => {
        const nickname = contact.nickname || 'Unknown';
        const profession = contact.profession || ''; 
        const whatsapp = contact.whatsapp_number || 'N/A';
        const displayProfession = contact.display_profession; // Flag from cluster_cohort_members

        let formattedName;
        if (displayProfession && profession) {
            formattedName = `${nickname} (${profession})`;
        } else {
            formattedName = `${nickname} NEARR`; // Defaulting to 'NEARR' if no profession is displayed
        }

        vcfString += 'BEGIN:VCARD\n';
        vcfString += 'VERSION:3.0\n';
        vcfString += `FN:${formattedName}\n`;
        vcfString += `N:;${formattedName};;; \n`; 
        vcfString += `TEL;TYPE=cell;TYPE=VOICE;X-WAID:${whatsapp}\n`; 
        
        if (displayProfession && profession) {
             vcfString += `ORG:${profession}\n`; // Include organization/profession
        }
        
        vcfString += 'END:VCARD\n';
    });

    return vcfString.trim();
}

