// utils/cohortUtils.js
// Contains helper functions for VCF generation, cluster statistics calculation, 
// frontend template injection, and now, CRITICALLY, cohort status lookup.
const path = require('path');
const fs = require('fs');
// Assuming the keys are correctly read from environment variables here:
const { supabaseUrl, supabaseAnonKey } = require('../config/supabase'); 

// --- 1. VCF Generation Utility ---

/**
 * Generates VCF content string from a list of contact objects.
 * @param {Array<Object>} contacts - Array of contact objects containing profile data.
 * @returns {string} The formatted VCF string content.
 */
function generateVcfContent(contacts) {
    let vcfString = '';

    contacts.forEach(contact => {
        const nickname = contact.nickname || 'Unknown';
        const profession = contact.profession || ''; 
        const whatsapp = contact.whatsapp_number || 'N/A';
        const displayProfession = contact.display_profession;

        let formattedName;
        if (displayProfession && profession) {
            formattedName = `${nickname} (${profession})`;
        } else {
            formattedName = `${nickname} NEARR`;
        }

        vcfString += 'BEGIN:VCARD\n';
        vcfString += 'VERSION:3.0\n';
        vcfString += `FN:${formattedName}\n`;
        vcfString += `N:;${formattedName};;; \n`; 
        vcfString += `TEL;TYPE=cell;TYPE=VOICE;X-WAID:${whatsapp}\n`; 
        
        if (displayProfession && profession) {
             vcfString += `ORG:${profession}\n`;
        }
        
        vcfString += 'END:VCARD\n';
    });

    return vcfString.trim();
}


// --- 2. Cluster Stats Calculation Utility ---

/**
 * Calculates demographic and interest statistics for a cohort cluster.
 * @param {Array<Object>} members - Combined profile and cohort membership data.
 * @param {string} userCountry - The country of the user requesting the stats (for Local/Abroad mix).
 * @returns {Object} Calculated statistics object.
 */
function calculateClusterStats(members, userCountry) {
    if (!members || members.length === 0) {
        return { 
            total_members: 0, avg_age: 0, min_age: 0, max_age: 0,
            geographic_mix: {}, gender_mix: {}, profession_mix: {},
            looking_for_mix: {}, available_for_mix: {},
        };
    }

    let totalAge = 0;
    let minAge = Infinity; 
    let maxAge = -Infinity; 

    const countryCounts = {};
    const professionCounts = {};
    const genderCounts = {}; 
    const lookingForCounts = {}; 
    const availableForCounts = {}; 
    const total_members = members.length;
    const cleanUserCountry = userCountry ? userCountry.toLowerCase() : '';

    members.forEach(member => {
        // Age calculation
        if (member.age && typeof member.age === 'number') {
            totalAge += member.age;
            minAge = Math.min(minAge, member.age); 
            maxAge = Math.max(maxAge, member.age); 
        }

        // Country distribution
        const country = member.country || 'Unknown';
        countryCounts[country] = (countryCounts[country] || 0) + 1;

        // Gender distribution
        const gender = member.gender || 'Not Specified';
        genderCounts[gender] = (genderCounts[gender] || 0) + 1;
        
        // Profession distribution
        if (member.display_profession) {
            const profession = member.profession || 'Not Specified';
            professionCounts[profession] = (professionCounts[profession] || 0) + 1;
        }

        // Looking For Distribution (friend_reasons)
        const friendReasons = member.friend_reasons || [];
        if (Array.isArray(friendReasons)) {
            friendReasons.forEach(item => {
                const cleanItem = item ? item.trim() : '';
                if (cleanItem) {
                    lookingForCounts[cleanItem] = (lookingForCounts[cleanItem] || 0) + 1;
                }
            });
        }

        // Available For Distribution (services)
        const services = member.services || [];
        if (Array.isArray(services)) {
            services.forEach(item => {
                const cleanItem = item ? item.trim() : '';
                if (cleanItem) {
                    availableForCounts[cleanItem] = (availableForCounts[cleanItem] || 0) + 1;
                }
            });
        }
    });

    const avg_age = total_members > 0 ? Math.round(totalAge / total_members) : 0;
    const min_age = minAge === Infinity ? 0 : minAge;
    const max_age = maxAge === -Infinity ? 0 : maxAge;

    // --- Calculate Mixes (Percentages) ---
    
    // Geographic Mix (User Country vs. Abroad)
    const geographic_mix = {};
    let userCountryCount = 0;
    let abroadCount = 0;
    
    for (const country in countryCounts) {
        if (country === 'Unknown' || !country) {
            continue;
        }
        
        if (cleanUserCountry && country.toLowerCase() === cleanUserCountry) {
            userCountryCount = countryCounts[country];
        } else {
            abroadCount += countryCounts[country];
        }
    }
    
    const knownCountryMembers = userCountryCount + abroadCount;
    
    if (userCountryCount > 0) {
        const userCountryPercentage = knownCountryMembers > 0 ? (userCountryCount / knownCountryMembers) * 100 : 0;
        geographic_mix[userCountry || 'Local'] = Math.round(userCountryPercentage);
    }
    
    if (abroadCount > 0) {
        const abroadPercentage = knownCountryMembers > 0 ? (abroadCount / knownCountryMembers) * 100 : 0;
        geographic_mix['Abroad'] = Math.round(abroadPercentage);
    } else if (userCountryCount > 0) {
         // If all members are from the user's country, ensure Abroad is explicitly 0
        geographic_mix['Abroad'] = geographic_mix['Abroad'] || 0;
    }


    // Gender Mix
    const gender_mix = {};
    for (const gender in genderCounts) {
        const percentage = total_members > 0 ? (genderCounts[gender] / total_members) * 100 : 0;
        gender_mix[gender] = Math.round(percentage); 
    }

    // Profession Mix
    const profession_mix = {};
    const totalDisplayedProfessions = Object.values(professionCounts).reduce((a, b) => a + b, 0);

    for (const profession in professionCounts) {
        const percentage = totalDisplayedProfessions > 0 ? (professionCounts[profession] / totalDisplayedProfessions) * 100 : 0;
        profession_mix[profession] = Math.round(percentage); 
    }

    // Looking For Mix
    const looking_for_mix = {};
    const totalLookingForEntries = Object.values(lookingForCounts).reduce((a, b) => a + b, 0);

    for (const item in lookingForCounts) {
        const percentage = totalLookingForEntries > 0 ? (lookingForCounts[item] / totalLookingForEntries) * 100 : 0;
        looking_for_mix[item] = Math.round(percentage); 
    }

    // Available For Mix
    const available_for_mix = {};
    const totalAvailableForEntries = Object.values(availableForCounts).reduce((a, b) => a + b, 0);

    for (const item in availableForCounts) {
        const percentage = totalAvailableForEntries > 0 ? (availableForCounts[item] / totalAvailableForEntries) * 100 : 0;
        available_for_mix[item] = Math.round(percentage); 
    }

    return {
        total_members,
        avg_age,
        min_age,
        max_age,
        geographic_mix,
        gender_mix,
        profession_mix,
        looking_for_mix,
        available_for_mix,
    };
}


// ----------------------------------------------------------------------------------
// --- 3. Frontend Template Injection Helper ---
// ----------------------------------------------------------------------------------

const REDIRECT_SAVE_SCRIPT = `
<script>
    // Only save the URL if we are *not* currently on a login-related page.
    const currentPath = window.location.pathname;
    if (!currentPath.includes('login.html') && !currentPath.includes('update-password.html')) {
        try {
            // Use sessionStorage to store the intended destination path
            sessionStorage.setItem('intended_destination', currentPath);
            console.log('Intended destination saved for post-login redirect:', currentPath);
        } catch (e) {
            console.error('Failed to save intended destination URL:', e);
        }
    }
</script>
`;

/**
 * Reads an HTML template, injects Supabase configuration using string replacement, 
 * and adds a redirect script.
 * @param {string} templatePath - The path to the HTML template relative to the root.
 * @param {Object} res - Express response object.
 * @param {string} projectRoot - The project root directory name for path resolution (passed from server.js).
 */
function injectSupabaseConfig(templatePath, res, projectRoot) {
    // Use the projectRoot passed from server.js to ensure correct path
    const filePathFull = path.join(projectRoot, templatePath);
    
    fs.readFile(filePathFull, 'utf8', (err, html) => {
        if (err) {
            console.error(`File Read Error for ${templatePath}:`, err);
            console.error(`Expected path: ${filePathFull}`); 
            return res.status(500).send(`Internal Server Error: Could not read HTML template file: ${templatePath}.`);
        }
        
        let injectedHtml = html;
        
        // 1. PERFORM THE ORIGINAL PLACEHOLDER REPLACEMENT
        injectedHtml = injectedHtml
            .replace(/__SUPABASE_URL_INJECTION__/g, supabaseUrl)
            .replace(/__SUPABASE_ANON_KEY_INJECTION__/g, supabaseAnonKey);

        // 2. Inject the REDIRECT script before the closing head tag
        const headCloseTag = '</head>';
        if (injectedHtml.includes(headCloseTag)) {
            // Inject the REDIRECT script right before the closing head tag
            injectedHtml = injectedHtml.replace(headCloseTag, `${REDIRECT_SAVE_SCRIPT}${headCloseTag}`);
        } else {
             console.warn('Could not find </head> tag for script injection in:', templatePath);
        }

        // 3. Send the final, corrected HTML
        res.send(injectedHtml);
    });
}


// --- 4. Misc Helpers ---

/**
 * Extracts the Cluster ID from the VCF file name string.
 * @param {string} fileName - The VCF file name (e.g., Cluster_Contacts_C_101_abcd1234.vcf).
 * @returns {number|null} The extracted cluster ID number.
 */
function extractClusterIdFromFileName(fileName) {
    // Expected format: Cluster_Contacts_C_{cluster_id}_{uuid}.vcf
    // Match the number following 'C_' and preceding the next underscore '_'
    const match = fileName.match(/C_(\d+)_/);
    if (match && match[1]) {
        return parseInt(match[1], 10);
    }
    return null;
}

// ----------------------------------------------------------------------------------
// --- 5. CRITICAL FIX: COHORT STATUS LOOKUP (Assumes server passes Supabase client) ---
// --- FIXED: Updated table names to align with cohortService.js data model. ---
// ----------------------------------------------------------------------------------

/**
 * Retrieves the current status of a cluster, CRITICALLY focusing on the user's specific cohort.
 * This function should be called by the server's /api/cohort-status endpoint.
 *
 * @param {Object} supabase - The initialized Supabase client instance (MUST BE PASSED BY SERVER).
 * @param {number} clusterId - The ID of the cluster being checked.
 * @param {string} userId - The ID of the user performing the check.
 * @returns {Promise<Object>} Status object including current_members and is_full.
 */
async function getClusterCohortStatus(supabase, clusterId, userId) {
    let status = {
        cohort_id: null,
        is_full: false,
        current_members: 0,
        vcf_uploaded: false,
        vcf_file_name: null,
        vcf_download_count: 0,
        max_members: 5, // Default
        user_is_member: false,
        user_has_downloaded: false,
    };

    // 1. Get Cluster Configuration (from cluster_metadata which now holds max_members and VCF info)
    const { data: clusterData, error: clusterError } = await supabase
        .from('cluster_metadata') // Using cluster_metadata for max_members and VCF data
        .select('max_members, vcf_uploaded, vcf_file_name, vcf_download_count')
        .eq('cluster_id', clusterId)
        .single();

    if (clusterError) {
        console.error(`DB Error fetching cluster metadata ${clusterId} config:`, clusterError);
    } else if (clusterData) {
        status.max_members = clusterData.max_members || status.max_members;
        status.vcf_uploaded = clusterData.vcf_uploaded || false;
        status.vcf_file_name = clusterData.vcf_file_name || null;
        status.vcf_download_count = clusterData.vcf_download_count || 0;
    }
    
    // 2. Find the user's current membership for this cluster to get their cohort_id
    // FIX: Using 'cluster_cohort_members' table name for consistency with service layer
    const { data: membershipData, error: membershipError } = await supabase
        .from('cluster_cohort_members') 
        .select('cohort_id, vcf_downloaded_at')
        .eq('user_id', userId)
        .eq('cluster_id', clusterId)
        .single();
    
    if (membershipData) {
        status.user_is_member = true;
        status.cohort_id = membershipData.cohort_id;
        status.user_has_downloaded = !!membershipData.vcf_downloaded_at; // Check for timestamp existence

        // 3. Count members ONLY in the user's specific cohort
        // FIX: Using 'cluster_cohort_members' table name
        const { count: currentMembersCount, error: countError } = await supabase
            .from('cluster_cohort_members')
            .select('*', { count: 'exact', head: true })
            .eq('cohort_id', status.cohort_id);
            
        if (countError) {
            console.error("DB Error counting cohort members:", countError);
        } else {
            status.current_members = currentMembersCount;
            status.is_full = currentMembersCount >= status.max_members;
        }

        // Note: VCF status fetching (Step 4 in original) is now handled in Step 1 using cluster_metadata
        
    } else if (membershipError && membershipError.code !== 'PGRST116') { // PGRST116 = No Rows Found (Expected when not a member)
         console.error("DB Error checking membership (not expected, but logged):", membershipError);
    }
    
    return status;
}


// Export all utility functions
module.exports = {
    generateVcfContent,
    calculateClusterStats,
    injectSupabaseConfig, 
    extractClusterIdFromFileName,
    getClusterCohortStatus, // <<-- NEW FUNCTION EXPORT
};
