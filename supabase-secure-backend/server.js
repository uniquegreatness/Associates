require('dotenv').config(); 

const express = require('express');
const { createClient } = require('@supabase/supabase-js'); 
const cors = require('cors'); 
const path = require('path'); 
const cookieParser = require('cookie-parser');
const fs = require('fs');
const { text } = require('express');
const crypto = require('crypto'); // Used for generating unique cohort IDs

const app = express();
const port = process.env.PORT || 3000;

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    console.error("FATAL ERROR: Supabase environment variables are missing (URL, SERVICE_ROLE_KEY, or ANON_KEY).");
    process.exit(1); 
}

// Initialize Supabase Client using the Service Role Key for Admin actions (server-side operations)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
});

// Initialize Supabase Client using the Anon Key for client-side authentication/session creation
// This is used internally by the server-side login to mimic client behavior.
const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
});

// --- CORE MIDDLEWARE ---

app.use(express.json());
// Allow all origins for CORS to handle frontend access
app.use(cors()); 
app.use(cookieParser());

// --- RESTORED STATIC FILE SERVING ---
app.use(express.static(path.join(__dirname, '..'))); 
// --- END RESTORED STATIC FILE SERVING ---

// --- NEW MIDDLEWARE: Admin Authentication Check ---
/**
 * Middleware to check for a valid admin session token.
 * NOTE: This is a placeholder. A robust implementation requires a JWT validation 
 * or a server-side session check. For now, it relies on the token being present.
 */
async function requireAdminAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('Admin access denied: Missing or invalid Authorization header.');
        return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const token = authHeader.split(' ')[1];
    
    try {
        // Use the Admin API to verify the token is valid (optional but robust check)
        // NOTE: This is resource intensive. A better approach is using JWT secret verification.
        const { data: { user }, error: authError } = await supabase.auth.admin.getUser(token);

        if (authError || !user) {
            console.warn('Admin access denied: Token failed validation.', authError?.message);
             return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
        }
        
        // CRITICAL CHECK: Ensure the user has the admin role flag (if implemented)
        // Since you don't have a role check, we skip this, but it is highly recommended.
        
        req.user = user;
        next();
    } catch (e) {
        console.error('Admin Auth Check Fatal Error:', e.message);
        return res.status(500).json({ success: false, message: 'Internal authentication error.' });
    }
}
// --- END NEW MIDDLEWARE ---

// --- VCF Generation Utility (Unchanged) ---

/**
 * Generates VCF content string based on contact array and formatting rules.
 * @param {Array<Object>} contacts - Array of contacts from the cluster table.
 * @returns {string} The complete VCF file content.
 */
function generateVcfContent(contacts) {
    let vcfString = '';

    contacts.forEach(contact => {
        // Ensure all necessary properties exist before accessing
        const nickname = contact.nickname || 'Unknown';
        const profession = contact.profession || ''; 
        const whatsapp = contact.whatsapp_number || 'N/A';
        const displayProfession = contact.display_profession; // The flag from cluster_cohort_members

        let formattedName;
        // Logic: Nickname (Profession) OR Nickname NEARR
        if (displayProfession && profession) {
            formattedName = `${nickname} (${profession})`;
        } else {
            formattedName = `${nickname} NEARR`;
        }

        vcfString += 'BEGIN:VCARD\n';
        vcfString += 'VERSION:3.0\n';
        vcfString += `FN:${formattedName}\n`;
        // FIX: Use the full formattedName in the Structured Name (N) field.
        // This ensures the custom profession/NEARR text is used by the phone's contact app for sorting/display.
        vcfString += `N:;${formattedName};;; \n`; 

        // Use TEL with X-WAID for WhatsApp compatibility (common practice)
        vcfString += `TEL;TYPE=cell;TYPE=VOICE;X-WAID:${whatsapp}\n`; 
        
        // Only include ORG if profession is displayed and exists
        if (displayProfession && profession) {
             vcfString += `ORG:${profession}\n`;
        }
        
        vcfString += 'END:VCARD\n';
    });

    return vcfString.trim();
}

// --- NEW HELPER FUNCTION: CLUSTER STATS CALCULATION (Unchanged) ---

/**
 * Calculates aggregate statistics from the list of cohort members, including
 * Geographic, Gender, and Profession Mixes.
 * * FIX: Added userCountry parameter to enable the Geographic Mix 'Abroad' calculation.
 * FIX: Added min_age and max_age calculation for 'Age Range' display.
 * * @param {Array<Object>} members - Array of combined member/profile objects.
 * @param {string} [userCountry] - The country of the requesting user (used for 'Abroad' grouping).
 * @returns {Object} Calculated cluster statistics.
 */
function calculateClusterStats(members, userCountry) {
    if (!members || members.length === 0) {
        // Return structured zero values for clean frontend handling
        return { 
            total_members: 0, 
            avg_age: 0, 
            min_age: 0, // FIX: Added
            max_age: 0, // FIX: Added
            geographic_mix: {}, 
            gender_mix: {}, 
            profession_mix: {},
            looking_for_mix: {}, // FIX: Added
            available_for_mix: {}, // FIX: Added
        };
    }

    let totalAge = 0;
    // FIX: Initialize min/max age trackers
    let minAge = Infinity; 
    let maxAge = -Infinity; 

    const countryCounts = {};
    const professionCounts = {};
    const genderCounts = {}; 
    const lookingForCounts = {}; // Counter for looking_for (friend_reasons)
    const availableForCounts = {}; // Counter for available_for (services)
    const total_members = members.length;
    const cleanUserCountry = userCountry ? userCountry.toLowerCase() : '';

    members.forEach(member => {
        // Age calculation
        if (member.age && typeof member.age === 'number') {
            totalAge += member.age;
            // FIX: Update min/max age
            minAge = Math.min(minAge, member.age); 
            maxAge = Math.max(maxAge, member.age); 
        }

        // Country distribution (FIX: Now counts actual country names)
        const country = member.country || 'Unknown';
        countryCounts[country] = (countryCounts[country] || 0) + 1;

        // Gender distribution (FIX: Tracks gender data)
        const gender = member.gender || 'Not Specified';
        genderCounts[gender] = (genderCounts[gender] || 0) + 1;
        
        // Profession distribution (only count if display_profession is true)
        // Profession is now correctly sourced from the profile fetch.
        if (member.display_profession) {
            const profession = member.profession || 'Not Specified';
            professionCounts[profession] = (professionCounts[profession] || 0) + 1;
        }

        // FIX START: Corrected Logic for Looking For Distribution (Source: friend_reasons column, which is an array)
        // Frontend "Looking for" gets its details from "friend_reasons"
        const friendReasons = member.friend_reasons || [];
        // Iterate over the array elements
        if (Array.isArray(friendReasons)) {
            friendReasons.forEach(item => {
                const cleanItem = item ? item.trim() : '';
                if (cleanItem) {
                    lookingForCounts[cleanItem] = (lookingForCounts[cleanItem] || 0) + 1;
                }
            });
        }
        // FIX END

        // FIX START: Corrected Logic for Available For Distribution (Source: services column, which is an array)
        // Frontend "Available for" gets its details from "services"
        const services = member.services || [];
        // Iterate over the array elements
        if (Array.isArray(services)) {
            services.forEach(item => {
                const cleanItem = item ? item.trim() : '';
                if (cleanItem) {
                    availableForCounts[cleanItem] = (availableForCounts[cleanItem] || 0) + 1;
                }
            });
        }
        // FIX END
    });

    // Calculate average age and round it to a whole number
    const avg_age = total_members > 0 ? Math.round(totalAge / total_members) : 0;
    // FIX: Determine final min/max age for the return object
    const min_age = minAge === Infinity ? 0 : minAge;
    const max_age = maxAge === -Infinity ? 0 : maxAge;

    // --- Calculate Mixes (Percentages) ---
    
    // FIX: Implement User Country vs. Abroad grouping
    const geographic_mix = {};
    let userCountryCount = 0;
    let abroadCount = 0;
    
    // 1. Calculate user country count and combined abroad count
    for (const country in countryCounts) {
        // FIX START: This is the correction to prevent 'Unknown' countries (where data is missing)
        // from being incorrectly added to the 'Abroad' count, which was causing the 0% local / 100% abroad bug.
        if (country === 'Unknown') {
            continue;
        }
        // FIX END
        
        if (cleanUserCountry && country.toLowerCase() === cleanUserCountry) {
            userCountryCount = countryCounts[country];
        } else {
            abroadCount += countryCounts[country];
        }
    }

    // 2. Calculate percentages and format the output
    const userCountryDisplay = userCountry || 'Unknown (Detail Unavailable)';
    
    // Total members used for percentage calculation includes Unknowns.
    // If the requirement is that Local + Abroad = 100%, we should use the sum of local and abroad counts
    // as the denominator, but since the previous logic included 'Unknown' in the total (which is what leads
    // to the total_members denominator), we proceed with the total_members denominator but ensure
    // local/abroad are correctly counted.
    
    if (userCountryCount > 0 || total_members === 0) { // Display user country if found or if no members exist
        const userCountryPercentage = total_members > 0 ? (userCountryCount / total_members) * 100 : 0;
        geographic_mix[userCountryDisplay] = Math.round(userCountryPercentage);
    }
    
    // The abroad count now only includes confirmed foreign countries (not 'Unknown').
    if (abroadCount > 0) {
        const abroadPercentage = total_members > 0 ? (abroadCount / total_members) * 100 : 0;
        geographic_mix['Abroad'] = Math.round(abroadPercentage);
    } else if (total_members > 0 && userCountryCount > 0) {
        // If all members with known countries are from the user's country, Abroad should be 0.
        if (!geographic_mix['Abroad'] && userCountryCount === total_members) {
             geographic_mix['Abroad'] = 0;
        }
    }

    // If the percentages don't add up to 100% (due to 'Unknown' members), 
    // the difference is simply the percentage of members with missing country data.
    // For the Geographic Mix display, we return the two known categories.

    // Gender Mix (Correctly calculated in the original code)
    const gender_mix = {};
    for (const gender in genderCounts) {
        const percentage = total_members > 0 ? (genderCounts[gender] / total_members) * 100 : 0;
        gender_mix[gender] = Math.round(percentage); 
    }

    // Profession Mix (Correctly calculated in the original code)
    const profession_mix = {};
    const totalDisplayedProfessions = Object.values(professionCounts).reduce((a, b) => a + b, 0);

    for (const profession in professionCounts) {
        // Calculate percentage only among those who chose to display profession
        const percentage = totalDisplayedProfessions > 0 ? (professionCounts[profession] / totalDisplayedProfessions) * 100 : 0;
        profession_mix[profession] = Math.round(percentage); 
    }

    // FIX START: Calculate Looking For Mix (Percentages)
    const looking_for_mix = {};
    const totalLookingForEntries = Object.values(lookingForCounts).reduce((a, b) => a + b, 0);

    for (const item in lookingForCounts) {
        // Calculate percentage based on the total count of 'looking_for' entries made
        const percentage = totalLookingForEntries > 0 ? (lookingForCounts[item] / totalLookingForEntries) * 100 : 0;
        looking_for_mix[item] = Math.round(percentage); 
    }
    // FIX END

    // FIX START: Calculate Available For Mix (Percentages)
    const available_for_mix = {};
    const totalAvailableForEntries = Object.values(availableForCounts).reduce((a, b) => a + b, 0);

    for (const item in availableForCounts) {
        // Calculate percentage based on the total count of 'available_for' entries made
        const percentage = totalAvailableForEntries > 0 ? (availableForCounts[item] / totalAvailableForEntries) * 100 : 0;
        available_for_mix[item] = Math.round(percentage); 
    }
    // FIX END

    return {
        total_members,
        avg_age,
        min_age, // FIX: Added min age
        max_age, // FIX: Added max age
        geographic_mix, // FIX: Now returns User Country vs. Abroad breakdown
        gender_mix,     // Confirmed: Gender breakdown is included
        profession_mix, // Confirmed: Profession breakdown is included
        looking_for_mix, // FIX: Added
        available_for_mix, // FIX: Added
    };
}
// --- END NEW HELPER FUNCTION ---


// --- REWRITTEN DATABASE SERVICE FUNCTION: GET COHORT STATUS (Unchanged) ---

/**
 * Retrieves the current status (cohort_id, members, is_full) and membership for a cluster.
 * NOW INCLUDES vcf_file_name and logic to maintain the PAUSE STATE.
 * @param {number} cluster_id - The ID of the interest cluster.
 * @param {string} user_id - The user's Supabase ID.
 * @returns {Promise<{success: boolean, message: string, cohort_id?: string, is_full?: boolean, current_members?: number, user_is_member?: boolean, vcf_uploaded?: boolean, vcf_file_name?: string, max_members?: number, cluster_name?: string}>}
 */
async function getCohortStatus(cluster_id, user_id) {
    console.log(`[DB] Fetching status for Cluster: ${cluster_id}, User: ${user_id.substring(0, 8)}...`);
    
    try {
        // NOTE: vcf_file_name is initialized here
        let cohort_id, current_members = 0, is_full = false, user_is_member = false, vcf_uploaded = false, max_members = 5, cluster_name = '', vcf_file_name = null;

        // Step 1: Get Metadata (Active Cohort ID, VCF status, Max Size, Name, VCF File Name)
        // FIX: Include vcf_file_name in the select query
        const { data: clusterMeta, error: metaError } = await supabase
            .from('cluster_metadata') 
            .select('active_cohort_id, vcf_uploaded, vcf_file_name, max_members, cluster_name') 
            .eq('cluster_id', cluster_id)
            .limit(1)
            .maybeSingle();

        if (metaError) throw metaError;

        if (!clusterMeta) {
            return { success: false, message: `Cluster ID ${cluster_id} not found.` };
        }
        
        // Set dynamic properties from metadata
        const target_cohort_id = clusterMeta.active_cohort_id;
        vcf_uploaded = clusterMeta.vcf_uploaded || false; 
        // FIX: Retrieve vcf_file_name
        vcf_file_name = clusterMeta.vcf_file_name || null;
        max_members = clusterMeta.max_members || 5; // Use 5 as a safe fallback
        cluster_name = clusterMeta.cluster_name || `Cluster ${cluster_id}`;

        if (target_cohort_id) {
            
            // Step 2: Check Membership and Count in the fixed cluster_cohort_members table
            const { data: members, count: current_members_count, error: membersError } = await supabase
                .from('cluster_cohort_members') 
                .select('user_id', { count: 'exact' }) 
                .eq('cluster_id', cluster_id)
                .eq('cohort_id', target_cohort_id); 

            if (membersError) throw membersError;
            
            current_members = current_members_count || 0;
            is_full = current_members >= max_members;

            // Check if the current user is in the fetched list of members
            user_is_member = members.some(member => member.user_id === user_id);
            cohort_id = target_cohort_id;

        } else {
            // Cluster is open and ready for a new cohort
            cohort_id = `C_OPEN_${cluster_id}`;
            current_members = 0;
            is_full = false;
        }

        // CRITICAL LOGIC: If VCF is uploaded, force is_full to true to maintain pause state
        // This ensures the client shows the "VCF Ready" state until the client triggers reset.
        if (vcf_uploaded) {
            is_full = true;
        }

        return {
            success: true,
            cohort_id,
            is_full,
            current_members,
            user_is_member, 
            vcf_uploaded,
            vcf_file_name, // FIX: Return file name
            max_members,
            cluster_name,
            message: "Cohort status retrieved successfully."
        };

    } catch (error) {
        console.error(`Error in getCohortStatus for Cluster ${cluster_id}:`, error.message);
        return { success: false, message: `Database error: ${error.message}` };
    }
}
// --- END REWRITTEN DATABASE SERVICE FUNCTION ---


// --- REDIRECT SCRIPT FOR CENTRALIZED INJECTION (Unchanged) ---
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
// --- END REDIRECT SCRIPT ---

// --- HELPER FUNCTION: INJECT SUPABASE CONFIGURATION (Updated to use Anon Key for client) ---
function injectSupabaseConfig(templatePath, res) {
    const filePathFull = path.join(__dirname, '..', templatePath);
    
    fs.readFile(filePathFull, 'utf8', (err, html) => {
        if (err) {
            console.error(`File Read Error for ${templatePath}:`, err);
            console.error(`Expected path: ${filePathFull}`); 
            return res.status(500).send(`Internal Server Error: Could not read HTML template file: ${templatePath}.`);
        }

        let injectedHtml = html
            // CRITICAL FIX: Inject the ANON KEY, NOT the service role key, for the client-side Supabase object.
            .replace(/__SUPABASE_URL_INJECTION__/g, supabaseUrl)
            .replace(/__SUPABASE_ANON_KEY_INJECTION__/g, supabaseAnonKey)
            .replace(/jtnnyfxdjqhtqddisrvp\.supabase\.co/g, supabaseUrl.split('//')[1].split(':')[0])
            .replace(/fFy_Z36VFHwOpZnSwR2WWlR_2b3hBrfEFXDp2EnAS9A/g, supabaseAnonKey); // Replace hardcoded key in admin.html template (if present)
            
        const headCloseTag = '</head>';
        if (injectedHtml.includes(headCloseTag)) {
            injectedHtml = injectedHtml.replace(headCloseTag, `${REDIRECT_SAVE_SCRIPT}${headCloseTag}`);
        } else {
             console.warn('Could not find </head> tag for script injection in:', templatePath);
        }

        res.send(injectedHtml);
    });
}
// --- END HELPER FUNCTION ---


// --- FRONTEND SERVING CONFIGURATION (Updated for admin.html) ---

// Root path redirects to the secure leaderboard
app.get('/', (req, res) => {
    res.redirect('/leaderboard.html');
});

// Route for the login page - USES INJECTION
app.get('/login.html', (req, res) => {
    injectSupabaseConfig('login_template.html', res);
});

// Route for the leaderboard (secure dashboard) - USES INJECTION
app.get('/leaderboard.html', (req, res) => {
    // Uses the template file to ensure injection runs
    injectSupabaseConfig('leaderboard_template.html', res);
});

// Route for the new cohort page (cohort.html) - USES INJECTION
app.get('/cohort.html', (req, res) => {
    // Uses the template file to ensure injection runs
    injectSupabaseConfig('cohort_template.html', res);
});

// Dedicated page for password reset/update - USES INJECTION
app.get('/update-password.html', (req, res) => {
    // Uses the template file to ensure injection runs
    injectSupabaseConfig('update-password_template.html', res);
});

// Route for the Admin Console - INJECTION REQUIRED
app.get('/admin.html', (req, res) => {
    injectSupabaseConfig('admin.html', res); // Assume admin.html is the file name
});

// ----------------------------------------------------
// NEW CRITICAL API ENDPOINT: ADMIN LOGIN (Authentication)
// ----------------------------------------------------
app.post('/api/admin-login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    try {
        // Step 1: Attempt to sign in the user using the Anon Key client (like a normal client)
        // This is a reliable way to get a session if the credentials are correct.
        const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
            email,
            password,
        });

        if (signInError || !signInData.session) {
            console.warn(`Admin login failed for ${email}:`, signInError?.message || 'Invalid credentials.');
            return res.status(401).json({ success: false, message: 'Login failed: Invalid credentials or user is not an active admin.' });
        }
        
        const session = signInData.session;
        
        // Step 2 (Optional but recommended): Verify the user is actually an admin
        // Since you don't have roles, we rely on the user existing.
        // A better check would be: if (session.user.app_metadata.roles?.includes('admin')) { ... }

        // Step 3: Return the access token (which the admin.html client will store)
        // The client must manage the session, as server-side auth is complex with Express.
        return res.status(200).json({ 
            success: true, 
            message: 'Admin login successful.', 
            // Return the session tokens for the frontend to manage the session state
            access_token: session.access_token,
            refresh_token: session.refresh_token,
        });

    } catch (e) {
        console.error('FATAL ADMIN LOGIN ERROR:', e.message);
        return res.status(500).json({ success: false, message: 'Internal server error during login.' });
    }
});
// ----------------------------------------------------
// END ADMIN LOGIN API ENDPOINT
// ----------------------------------------------------


// ----------------------------------------------------
// ADMIN CLUSTER CRUD ENDPOINTS (Service Role Key Required)
// ----------------------------------------------------

// GET all clusters (Read) - Requires Auth
app.get('/api/admin/clusters', requireAdminAuth, async (req, res) => {
    try {
        const { data: clusters, error } = await supabase
            .from('cluster_metadata')
            .select('*')
            .order('cluster_id', { ascending: true });

        if (error) throw error;

        return res.status(200).json({ success: true, clusters });
    } catch (e) {
        console.error('ADMIN GET CLUSTERS ERROR:', e.message);
        return res.status(500).json({ success: false, message: 'Failed to fetch cluster list.' });
    }
});

// POST new cluster (Create) - Requires Auth
app.post('/api/admin/clusters', requireAdminAuth, async (req, res) => {
    const { cluster_name, cluster_region, max_members } = req.body;

    if (!cluster_name || !cluster_region || !max_members) {
        return res.status(400).json({ success: false, message: 'Missing cluster name, region, or max members.' });
    }
    
    // NOTE: active_cohort_id, vcf_uploaded, and vcf_file_name are set to null/false by default
    const clusterToInsert = {
        cluster_name,
        cluster_region,
        max_members: parseInt(max_members)
    };

    try {
        const { data, error } = await supabase
            .from('cluster_metadata')
            .insert([clusterToInsert])
            .select()
            .single();

        if (error) throw error;

        return res.status(201).json({ success: true, message: 'Cluster created successfully.', cluster: data });
    } catch (e) {
        console.error('ADMIN CREATE CLUSTER ERROR:', e.message);
        return res.status(500).json({ success: false, message: 'Failed to create cluster.' });
    }
});

// PUT update cluster (Update) - Requires Auth
app.put('/api/admin/clusters/:id', requireAdminAuth, async (req, res) => {
    const clusterId = req.params.id;
    const { cluster_name, cluster_region, max_members } = req.body;
    
    const updatePayload = {};
    if (cluster_name) updatePayload.cluster_name = cluster_name;
    if (cluster_region) updatePayload.cluster_region = cluster_region;
    if (max_members) updatePayload.max_members = parseInt(max_members);

    if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ success: false, message: 'No fields provided for update.' });
    }

    try {
        const { error } = await supabase
            .from('cluster_metadata')
            .update(updatePayload)
            .eq('cluster_id', clusterId);

        if (error) throw error;

        return res.status(200).json({ success: true, message: `Cluster ${clusterId} updated successfully.` });
    } catch (e) {
        console.error('ADMIN UPDATE CLUSTER ERROR:', e.message);
        return res.status(500).json({ success: false, message: 'Failed to update cluster.' });
    }
});

// DELETE cluster (Delete) - Requires Auth
app.delete('/api/admin/clusters/:id', requireAdminAuth, async (req, res) => {
    const clusterId = req.params.id;

    try {
        // Also delete all associated cohort members for cleanup
        await supabase
            .from('cluster_cohort_members')
            .delete()
            .eq('cluster_id', clusterId);

        const { error } = await supabase
            .from('cluster_metadata')
            .delete()
            .eq('cluster_id', clusterId);

        if (error) throw error;

        return res.status(200).json({ success: true, message: `Cluster ${clusterId} deleted successfully.` });
    } catch (e) {
        console.error('ADMIN DELETE CLUSTER ERROR:', e.message);
        return res.status(500).json({ success: false, message: 'Failed to delete cluster.' });
    }
});

// ----------------------------------------------------
// END ADMIN CLUSTER CRUD ENDPOINTS
// ----------------------------------------------------


// ----------------------------------------------------
// SECURE API ENDPOINT: GET COHORT STATUS (Unchanged Endpoint, Uses Updated Function)
// ----------------------------------------------------
app.get('/api/cohort-status', async (req, res) => {
    const { cluster_id, user_id } = req.query;

    if (!cluster_id || !user_id) {
        return res.status(400).json({ success: false, message: 'Missing cluster_id or user_id query parameters.' });
    }

    // Convert cluster_id to number
    const clusterIdNum = parseInt(cluster_id);
    if (isNaN(clusterIdNum)) {
         return res.status(400).json({ success: false, message: 'Invalid cluster_id provided.' });
    }

    const result = await getCohortStatus(clusterIdNum, user_id);

    if (result.success) {
        res.status(200).json(result);
    } else {
        res.status(500).json(result);
    }
});
// ----------------------------------------------------
// END COHORT STATUS API ENDPOINT
// ----------------------------------------------------

// ----------------------------------------------------
// NEW SECURE API ENDPOINT: GET CLUSTER STATS (Unchanged)
// ----------------------------------------------------
app.get('/api/cluster-stats', async (req, res) => {
    // FIX: Added user_country as a required query parameter for Geographic Mix calculation
    const { cluster_id, user_country } = req.query;

    if (!cluster_id || !user_country) {
        // FIX: user_country is now required for accurate geographic stats
        return res.status(400).json({ success: false, message: 'Missing cluster_id or user_country query parameter.' });
    }

    const clusterIdNum = parseInt(cluster_id);
    if (isNaN(clusterIdNum)) {
         return res.status(400).json({ success: false, message: 'Invalid cluster_id provided.' });
    }

    try {
        // 1. Get the active cohort ID and cluster name
        const { data: clusterMeta, error: metaError } = await supabase
            .from('cluster_metadata')
            .select('active_cohort_id, cluster_name')
            .eq('cluster_id', clusterIdNum)
            .limit(1)
            .maybeSingle();

        if (metaError) throw metaError;

        const clusterName = clusterMeta?.cluster_name || `Cluster ${clusterIdNum}`;
        const activeCohortId = clusterMeta?.active_cohort_id;
        
        // If no active cohort, return empty stats
        if (!activeCohortId) {
            return res.status(200).json({
                success: true,
                cluster_name: clusterName,
                cohort_members: [],
                // FIX: Pass user_country to calculateClusterStats
                cluster_stats: calculateClusterStats([], user_country) 
            });
        }

        // 2. Fetch all members and their display_profession flag for the active cohort
        const { data: cohortMembersRaw, error: membersError } = await supabase
            .from('cluster_cohort_members')
            .select('user_id, display_profession')
            .eq('cluster_id', clusterIdNum)
            .eq('cohort_id', activeCohortId);

        if (membersError) throw membersError;

        const userIds = cohortMembersRaw.map(m => m.user_id);

        if (userIds.length === 0) {
             return res.status(200).json({
                success: true,
                cluster_name: clusterName,
                cohort_members: [],
                // FIX: Pass user_country to calculateClusterStats
                cluster_stats: calculateClusterStats([], user_country)
            });
        }

        // 3. Fetch full user profiles 
        // FIX: Selecting the correct array columns: friend_reasons (for looking_for) and services (for available_for)
        const { data: profiles, error: profilesError } = await supabase
            .from('user_profiles')
            .select('user_id, nickname, age, country, profession, gender, friend_reasons, services') 
            .in('user_id', userIds);

        if (profilesError) throw profilesError;

        // 4. Combine member flags with profile data for the final list (cohort_members)
        const combinedMembers = cohortMembersRaw.map(memberRaw => {
            const profile = profiles.find(p => p.user_id === memberRaw.user_id);
            return {
                // Return cleaned and default values
                user_id: memberRaw.user_id,
                nickname: profile?.nickname || 'Unknown User',
                profession: profile?.profession || 'N/A',
                country: profile?.country || 'N/A',
                age: profile?.age || null,
                gender: profile?.gender || 'N/A', 
                // FIX: Map the fetched columns to the combined object using the correct column names
                friend_reasons: profile?.friend_reasons || [], 
                services: profile?.services || [], 
                display_profession: memberRaw.display_profession,
            };
        });

        // 5. Calculate statistics using the combined data (uses the fixed function)
        // FIX: Pass user_country to the stats calculation function
        const calculatedStats = calculateClusterStats(combinedMembers, user_country);

        // 6. Return response
        res.status(200).json({
            success: true,
            cluster_name: clusterName,
            cohort_members: combinedMembers,
            cluster_stats: calculatedStats
        });

    } catch (e) {
        console.error('FATAL GET CLUSTER STATS ERROR:', e.message);
        return res.status(500).json({ success: false, message: 'Internal server error during cluster stats retrieval.' });
    }
});
// ----------------------------------------------------
// END GET CLUSTER STATS API ENDPOINT
// ----------------------------------------------------


// ----------------------------------------------------
// REWRITTEN SECURE API ENDPOINT: JOIN CLUSTER (Unchanged)
// ----------------------------------------------------
app.post('/api/join-cluster', async (req, res) => {
    const { p_user_id, p_cluster_id, p_display_profession } = req.body;

    if (!p_user_id || !p_cluster_id || typeof p_display_profession === 'undefined') {
        console.error('Validation failed: Missing one of p_user_id, p_cluster_id, or p_display_profession');
        return res.status(400).json({ success: false, message: 'Missing required parameters.' });
    }
    
    const clusterIdNum = parseInt(p_cluster_id);
    const userId = p_user_id;

    let newCohortId; // The ID we use for insertion

    try {
        // --- STEP 1: INITIAL STATUS CHECK AND PREP ---
        const initialStatus = await getCohortStatus(clusterIdNum, userId);

        if (!initialStatus.success) {
            return res.status(500).json(initialStatus);
        }

        // NEW BLOCK: Check if VCF is already uploaded (the PAUSE STATE) - Cannot join a full, paused cluster
        if (initialStatus.vcf_uploaded) {
             return res.status(409).json({ 
                success: false, 
                message: 'Cluster is currently full and waiting for download/reset. Cannot join a full cluster.', 
                vcf_uploaded: true, // Use the proper key name for consistency
                vcf_file_name: initialStatus.vcf_file_name 
            });
        }
        
        if (initialStatus.user_is_member) {
            return res.status(409).json({ success: false, message: 'User is already joined to this cluster cohort.' });
        }
        
        // Use the initial status for max_members and current_members
        const maxMembers = initialStatus.max_members;
        const currentMembers = initialStatus.current_members;
        let isFullAfterJoin = false;
        
        let activeCohortId = initialStatus.cohort_id;
        
        // Check if the cluster is OPEN and needs a new cohort ID assigned
        if (activeCohortId.startsWith('C_OPEN_')) {
            // Generate a secure, unique ID for the new cohort
            newCohortId = `C_${clusterIdNum}_${crypto.randomUUID().substring(0, 8)}`; 
            
            // 1a. CRITICAL: Update cluster_metadata to lock in the new cohort ID
            const { error: metaUpdateError } = await supabase
                .from('cluster_metadata') 
                .update({ 
                    active_cohort_id: newCohortId,
                    vcf_uploaded: false, // Ensure status is reset for new cohort
                    vcf_file_name: null // FIX: Ensure file name is clear for new cohort
                }) 
                .eq('cluster_id', clusterIdNum);

            if (metaUpdateError) throw metaUpdateError;
            activeCohortId = newCohortId; // Use the newly set ID
            
        } else {
            // Cluster is active, use the existing cohort ID
            newCohortId = activeCohortId;
        }

        // --- STEP 2: INSERT MEMBER INTO CLUSTER_COHORT_MEMBERS ---
        const memberToInsert = {
            user_id: userId,
            cluster_id: clusterIdNum,
            cohort_id: newCohortId,
            display_profession: p_display_profession
        };

        const { error: insertError } = await supabase
            .from('cluster_cohort_members')
            .insert([memberToInsert]);

        if (insertError) {
             console.error('Insert Error:', insertError.message);
             return res.status(500).json({ success: false, message: `Failed to join cluster: ${insertError.message}` });
        }
        
        const newMemberCount = currentMembers + 1;
        isFullAfterJoin = newMemberCount >= maxMembers;

        // --- STEP 3: HANDLE COHORT COMPLETION (VCF Generation/PAUSE STATE) ---
        if (isFullAfterJoin) {
            console.log(`COHORT ${newCohortId} IS FULL (${newMemberCount}/${maxMembers}). Triggering VCF exchange process.`);

            let vcfUploadSuccessful = false;
            let vcfContacts = [];
            const vcfFileName = `Cluster_Contacts_${newCohortId}.vcf`; // Define file name here

            // 3a. Robust Two-Step Fetch for VCF Data
            const { data: cohortMembers, error: membersFetchError } = await supabase
                .from('cluster_cohort_members')
                .select('user_id, display_profession')
                .eq('cluster_id', clusterIdNum)
                .eq('cohort_id', newCohortId);

            if (membersFetchError || !cohortMembers || cohortMembers.length === 0) {
                 console.error('Final fetch error: Failed to get user IDs from cohort.', membersFetchError);
            } else {
                const userIds = cohortMembers.map(m => m.user_id);

                const { data: profiles, error: profilesFetchError } = await supabase
                    .from('user_profiles')
                    .select('user_id, nickname, profession, whatsapp_number')
                    .in('user_id', userIds);
                
                if (profilesFetchError || !profiles || profiles.length === 0) {
                    console.error('Final fetch error: Failed to fetch user profiles for VCF.', profilesFetchError);
                } else {
                    vcfContacts = cohortMembers.map(member => {
                        const profile = profiles.find(p => p.user_id === member.user_id);
                        return {
                            ...profile,
                            display_profession: member.display_profession
                        };
                    });
                }
            }
            
            // --- 3b. & 3c. Generate VCF and Upload ---
            if (vcfContacts.length === 0) {
                 console.error('VCF generation skipped due to zero valid contacts fetched.');
            } else {
                
                const vcfContent = generateVcfContent(vcfContacts);
                const storagePath = `vcf_exchange/${vcfFileName}`;
                
                // Upload VCF to Supabase Storage
                const { error: uploadError } = await supabase.storage
                    .from('near_vcf_bucket')
                    .upload(storagePath, vcfContent, {
                        contentType: 'text/vcard',
                        upsert: true
                    });

                if (uploadError) {
                    console.error('VCF Upload Error:', uploadError);
                } else {
                    console.log(`VCF uploaded for Cohort ID: ${newCohortId}.`);
                    vcfUploadSuccessful = true; 
                }
            }
            
            // --- 3d. CRITICAL: Update Metadata to PAUSE the cluster (New Logic) ---
            if (vcfUploadSuccessful) {
                console.log(`VCF succeeded. Entering PAUSE state for cohort ${newCohortId}.`);

                // FIX: Update the metadata to signal VCF success and store the file name.
                // WE DO NOT DELETE MEMBERS OR RESET active_cohort_id: null HERE.
                const { error: statusUpdateError } = await supabase
                    .from('cluster_metadata') 
                    .update({ 
                        vcf_uploaded: true, // Signal client to show download button
                        vcf_file_name: vcfFileName, // Provide the file name for download
                        // active_cohort_id remains the same (locked)
                    }) 
                    .eq('cluster_id', clusterIdNum); 

                if (statusUpdateError) {
                    console.error('CRITICAL FAILURE: Failed to set PAUSE state (vcf_uploaded=true).', statusUpdateError);
                } else {
                     console.log(`Cluster ID ${clusterIdNum} successfully entered PAUSE state.`);
                }
                
                // Return success immediately to the client.
                return res.status(200).json({
                    success: true, 
                    cohort_id: newCohortId,
                    current_members: newMemberCount, 
                    is_full: isFullAfterJoin,
                    vcf_uploaded: true, // Crucial for client state
                    vcf_file_name: vcfFileName, // Crucial for client download
                    message: `Success! Cohort ${newCohortId} is complete and VCF is ready for download. Cluster is paused.` 
                });
                
            } else {
                // VCF upload failed. Keep the cluster full but mark as non-ready.
                console.warn(`VCF upload FAILED for ${newCohortId}. Cluster left in FULL state, vcf_uploaded=false.`);

                const { error: statusUpdateError } = await supabase
                    .from('cluster_metadata') 
                    .update({ 
                        vcf_uploaded: false, // Explicitly set to false to indicate failure
                        vcf_file_name: null // FIX: Clear any potential stale file name
                    }) 
                    .eq('cluster_id', clusterIdNum); 
                
                if (statusUpdateError) {
                    console.error('WARNING: Failed to set vcf_uploaded=false after failure.', statusUpdateError);
                }
                
                return res.status(500).json({
                    success: false, 
                    cohort_id: newCohortId,
                    current_members: newMemberCount, 
                    is_full: isFullAfterJoin,
                    vcf_uploaded: false,
                    message: `Error: Cohort ${newCohortId} is full, but VCF generation failed. Cluster temporarily locked.`
                });
            }
        }

        // --- STEP 4: Success Response (For Non-Full Cohorts) ---
        return res.status(200).json({
            success: true,
            cohort_id: newCohortId,
            current_members: newMemberCount, 
            is_full: isFullAfterJoin,
            vcf_uploaded: false,
            message: `Success! Joined cohort ${newCohortId}. Waiting for more members.`
        });

    } catch (e) {
        console.error('FATAL JOIN CLUSTER ERROR:', e.message);
        return res.status(500).json({ success: false, message: 'Internal server error during cluster join process.' });
    }
});
// ----------------------------------------------------
// END REWRITTEN JOIN CLUSTER API ENDPOINT
// ----------------------------------------------------

// ----------------------------------------------------
// NEW SECURE API ENDPOINT: RESET CLUSTER (Unchanged)
// ----------------------------------------------------
app.post('/api/reset-cluster', async (req, res) => {
    const { cluster_id, cohort_id } = req.body;
    
    if (!cluster_id || !cohort_id) {
        return res.status(400).json({ success: false, message: 'Missing cluster ID or cohort ID for reset.' });
    }
    
    const clusterIdNum = parseInt(cluster_id);
    
    try {
        console.log(`Client requested reset for Cohort ID: ${cohort_id}, Cluster ID: ${clusterIdNum}`);

        // 1. Delete the completed cohort from the membership table (Cleanup raw data)
        const { error: deleteError } = await supabase
            .from('cluster_cohort_members')
            .delete()
            .eq('cohort_id', cohort_id)
            .eq('cluster_id', clusterIdNum); 

        if (deleteError) {
            console.error(`FAILURE: Failed to delete raw data for ${cohort_id}.`, deleteError);
            // We proceed with the metadata reset anyway to unlock the cluster.
        } else {
             console.log(`Raw data for ${cohort_id} securely deleted.`);
        }
        
        // 2. Update Metadata to open the cluster for the next group
        const { error: statusUpdateError } = await supabase
            .from('cluster_metadata') 
            .update({ 
                vcf_uploaded: false,        // Reset VCF status
                vcf_file_name: null,        // Clear VCF file name
                active_cohort_id: null      // Open the cluster for the next group
            }) 
            .eq('cluster_id', clusterIdNum); 

        if (statusUpdateError) {
            console.error('CRITICAL FAILURE: Failed to open cluster for new cohort.', statusUpdateError);
            return res.status(500).json({ success: false, message: 'Database failure during cluster reset.' });
        }
        
        console.log(`Cluster ID ${clusterIdNum} successfully reset and opened.`);
        
        return res.status(200).json({ 
            success: true, 
            message: 'Cluster successfully reset and ready for new cohort.' 
        });

    } catch (e) {
        console.error('FATAL RESET CLUSTER ERROR:', e.message);
        return res.status(500).json({ success: false, message: 'Internal server error during cluster reset.' });
    }
});
// ----------------------------------------------------
// END NEW SECURE API ENDPOINT: RESET CLUSTER
// ----------------------------------------------------

// ----------------------------------------------------
// API ENDPOINT: DOWNLOAD VCF (Unchanged)
// ----------------------------------------------------
app.get('/api/download-contacts', async (req, res) => {
    // FIX: Expect file_name from the client
    const fileName = req.query.file_name;

    if (!fileName) {
        return res.status(400).json({ success: false, message: 'Missing file name for download.' });
    }
    
    // FIX: Use the specific file name in the storage path
    const storagePath = `vcf_exchange/${fileName}`;

    // --- STEP 1: Retrieve VCF file from Supabase Storage ---
    try {
        const { data, error } = await supabase.storage
            .from('near_vcf_bucket')
            .download(storagePath);

        if (error) {
            console.error('VCF Download Error:', error);
            if (error.statusCode === '404') {
                return res.status(404).json({ success: false, message: 'Contact file not yet generated or found.' });
            }
            throw new Error('Failed to retrieve file from storage.');
        }

        if (!data) {
             console.warn(`VCF file download returned null data for path: ${storagePath}`);
             return res.status(404).json({ success: false, message: 'File is not yet ready for download. Please try again in a moment.' });
        }


        // Send the file content back to the client
        res.setHeader('Content-Type', 'text/vcard;charset=utf-8');
        // FIX: Use the specific file name in the Content-Disposition header
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        
        // Convert Blob to ArrayBuffer and then to Buffer for Express stream
        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        res.send(buffer);

    } catch (e) {
        console.error('FATAL DOWNLOAD CONTACTS ERROR:', e.message);
        return res.status(500).json({ success: false, message: 'Internal server error during file download.' });
    }
});


// ----------------------------------------------------
// EXISTING ROUTES (Waitlist and Leaderboard - Unchanged)
// ----------------------------------------------------

// SINGLE-STEP REGISTRATION ROUTE (/api/waitlist)
app.post('/api/waitlist', async (req, res) => {
    
    const submissionData = req.body;
    
    // 1. Input Validation: CHECK FOR ALL REQUIRED FIELDS, INCLUDING NICKNAME
    if (!submissionData.email || !submissionData.password || !submissionData.whatsapp_number || !submissionData.nickname) {
        return res.status(400).json({ error: 'Missing required fields: email, password, nickname, or whatsapp_number.' });
    }
    
    // Destructure specifically to ensure the nickname is ready for the profile
    const { email, password, nickname, ...otherProfileFields } = submissionData;

    let newUser;
    
    try {
        // --- STEP 1: CREATE USER IN AUTH.USERS (Requires SERVICE_ROLE_KEY) ---
        const { data: userData, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true 
        });

        if (authError) {
            console.error('Supabase AUTH Error:', authError.message);
            const details = authError.message.includes('already registered') 
                ? 'This email is already registered.' 
                : 'Account creation failed.';
            return res.status(400).json({ error: 'Registration failed.', details });
        }
        
        newUser = userData.user;
        
    } catch (e) {
        console.error('SERVER ERROR during Supabase Auth:', e.message);
        return res.status(500).json({ error: 'Server failed during user authentication step.' });
    }

    // --- STEP 2: CREATE PROFILE IN public.user_profiles ---
    const profileToInsert = {
        user_id: newUser.id,
        email: email, 
        nickname: nickname, // Explicitly include the nickname here
        referrals: 0, 
        ...otherProfileFields // Spread remaining fields (like whatsapp_number)
    };
    
    try {
        // The database trigger will automatically populate the 'referral_code' here.
        const { error: profileError } = await supabase
            .from('user_profiles') 
            .insert([profileToInsert]);

        if (profileError) {
            console.error('Supabase PROFILE INSERTION Error:', profileError.code, profileError.message);
            
            // 🛑 CRITICAL CLEANUP: Delete the user account if profile insertion fails
            await supabase.auth.admin.deleteUser(newUser.id); 
            
            return res.status(500).json({ 
                error: 'Database profile creation failed. User account cleaned up.', 
                details: profileError.message
            });
        }
        
        // ----------------------------------------------------------------------
        // ✅ STEP 3: ESTABLISH ACTIVE SESSION 
        // ----------------------------------------------------------------------
        
        // 1. Sign in using the newly created credentials (using the standard client API)
        const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (signInError || !signInData.session) {
             console.error('CRITICAL ERROR: Failed to reliably sign in newly created user.', signInError?.message);
             // We still confirm success but warn that a manual login might be needed
             return res.status(201).json({ 
                message: 'Successfully joined the waitlist, but please log in manually due to session error.', 
                user_id: newUser.id 
             });
        }
        
        const session = signInData.session;

        // 2. Set the required Supabase authentication cookies on the browser
        const cookieOptions = { 
            maxAge: 1000 * 60 * 60 * 60 * 24 * 7, // 7 days
            httpOnly: false, // Must be false for Supabase JS client on the frontend to read
            secure: process.env.NODE_ENV === 'production', // Use secure in production
            sameSite: 'Lax'  // Recommended for modern browsers
        };
        
        // Set the access token and refresh token cookies
        res.cookie('sb-access-token', session.access_token, cookieOptions); 
        res.cookie('sb-refresh-token', session.refresh_token, cookieOptions);

        // Final Success
        console.log('SUCCESS: Profile created and instant session established!');
        res.status(201).json({ 
            message: 'Successfully joined the waitlist and session established!', 
            user_id: newUser.id 
        });

    } catch (e) {
        console.error('SERVER ERROR during Profile Creation/Session Setup:', e.message);
        // Ensure cleanup is attempted if the error occurred after user creation
        if (newUser && newUser.id) {
             await supabase.auth.admin.deleteUser(newUser.id);
        }
        return res.status(500).json({ error: 'Server failed during finalization steps.' });
    }
});

// ----------------------------------------------------
// LEADERBOARD DATA ROUTE (/api/secure-data)
// ----------------------------------------------------
app.get('/api/secure-data', async (req, res) => {
    
    // Fetch data from the public.user_profiles table
    const { data, error } = await supabase
        .from('user_profiles') 
        .select('user_id, nickname, gender, referrals, referral_code') 
        .order('referrals', { ascending: false }); // Order by referrals DESC for ranking

    if (error) {
        console.error('Supabase query error for leaderboard:', error.message);
        return res.status(500).json({ 
            error: 'Failed to fetch leaderboard data from the database.'
        });
    }

    // Send the fetched data back to the frontend
    res.status(200).json(data);
});


app.listen(port, () => {
    console.log(`Backend server running on port ${port}`);
});
