require('dotenv').config(); 

const express = require('express');
const { createClient } = require('@supabase/supabase-js'); 
const cors = require('cors'); 
const path = require('path'); 
const cookieParser = require('cookie-parser');
const fs = require('fs');
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
async function requireAdminAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('Admin access denied: Missing or invalid Authorization header.');
        return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const token = authHeader.split(' ')[1];
    
    try {
        // Use the Admin API to verify the token is valid
        const { data: { user }, error: authError } = await supabase.auth.admin.getUser(token);

        if (authError || !user) {
            console.warn('Admin access denied: Token failed validation.', authError?.message);
             return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
        }
        
        // You can add a role check here if your admin users have a specific role flag.
        
        req.user = user;
        next();
    } catch (e) {
        console.error('Admin Auth Check Fatal Error:', e.message);
        return res.status(500).json({ success: false, message: 'Internal authentication error.' });
    }
}
// --- END NEW MIDDLEWARE ---

// --- VCF Generation Utility (Unchanged) ---

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

// --- NEW HELPER FUNCTION: CLUSTER STATS CALCULATION (Finalized) ---

function calculateClusterStats(members, userCountry) {
    if (!members || members.length === 0) {
        return { 
            total_members: 0, 
            avg_age: 0, 
            min_age: 0,
            max_age: 0,
            geographic_mix: {}, 
            gender_mix: {}, 
            profession_mix: {},
            looking_for_mix: {},
            available_for_mix: {},
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
            continue; // Skip unknown countries from the Local/Abroad calculation
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
// --- END NEW HELPER FUNCTION ---


// --- REWRITTEN DATABASE SERVICE FUNCTION: GET COHORT STATUS (Includes Synchronization Fixes) ---

async function getCohortStatus(cluster_id, user_id) {
    console.log(`[DB] Fetching status for Cluster: ${cluster_id}, User: ${user_id.substring(0, 8)}...`);
    
    try {
        let cohort_id, current_members = 0, is_full = false, user_is_member = false, vcf_uploaded = false, max_members = 5, cluster_name = '', vcf_file_name = null;
        let clusterMeta;

        // Step 1: Get Metadata from cluster_metadata (the state table)
        const { data: existingMeta, error: metaError } = await supabase
            .from('cluster_metadata') 
            .select('active_cohort_id, vcf_uploaded, vcf_file_name, max_members, cluster_name, vcf_download_count, current_members') 
            .eq('cluster_id', cluster_id)
            .limit(1)
            .maybeSingle();

        if (metaError) throw metaError;
        
        if (existingMeta) {
            clusterMeta = existingMeta;
        } else {
            // --- CRITICAL FIX: SYNCHRONIZATION LOGIC (from previous fix) ---
            console.log(`[DB] Metadata missing for Cluster ID ${cluster_id}. Attempting synchronization from dynamic_clusters.`);

            // 1. Check dynamic_clusters for the definition (the source of truth for existence)
            const { data: dynamicCluster, error: dynamicError } = await supabase
                .from('dynamic_clusters')
                .select('id, name, max_members')
                .eq('id', cluster_id)
                .limit(1)
                .maybeSingle();
                
            if (dynamicError) throw dynamicError;

            if (!dynamicCluster) {
                // Not found in either table. This is a genuine "not found" error.
                return { success: false, message: `Cluster ID ${cluster_id} not found in dynamic_clusters.` };
            }
            
            // 2. Found in dynamic_clusters, so create a default row in cluster_metadata
            const initialMetadata = {
                cluster_id: dynamicCluster.id,
                cluster_name: dynamicCluster.name,
                max_members: dynamicCluster.max_members,
                vcf_uploaded: false,
                vcf_download_count: 0,
                active_cohort_id: null,
                // NOTE: cluster_category_id is required by schema, defaulting to 1
                cluster_category_id: 1, 
                current_members: 0, 
                is_ready_for_deletion: false, 
            };
            
            const { data: newMeta, error: insertError } = await supabase
                .from('cluster_metadata')
                .insert([initialMetadata])
                .select('active_cohort_id, vcf_uploaded, vcf_file_name, max_members, cluster_name, vcf_download_count, current_members')
                .single();
                
            if (insertError) throw insertError;
            
            clusterMeta = newMeta;
            console.log(`[DB] Successfully synchronized and created metadata for Cluster ID ${cluster_id}.`);
            // --- END CRITICAL FIX ---
        }
        
        // --- Continue processing with clusterMeta (which is now guaranteed to exist) ---

        const target_cohort_id = clusterMeta.active_cohort_id;
        vcf_uploaded = clusterMeta.vcf_uploaded || false; 
        vcf_file_name = clusterMeta.vcf_file_name || null;
        max_members = clusterMeta.max_members || 5; 
        cluster_name = clusterMeta.cluster_name || `Cluster ${cluster_id}`;
        const vcf_downloads_count = clusterMeta.vcf_download_count || 0;
        let persisted_member_count = clusterMeta.current_members || 0; // The count currently in the DB


        if (target_cohort_id) {
            
            // Step 2: Check Membership and Count
            // NOTE: We only query for members in the *active* cohort ID
            const { data: members, count: calculated_member_count, error: membersError } = await supabase
                .from('cluster_cohort_members') 
                .select('user_id', { count: 'exact' }) 
                .eq('cluster_id', cluster_id)
                // FIX: Corrected typo from target_cohort_cohort_id to target_cohort_id
                .eq('cohort_id', target_cohort_id); 

            if (membersError) throw membersError;
            
            current_members = calculated_member_count || 0;
            is_full = current_members >= max_members;

            // Check membership by fetching a single row with user_id
            const { data: userMembership, error: userMemberError } = await supabase
                .from('cluster_cohort_members') 
                .select('user_id') 
                .eq('cluster_id', cluster_id)
                .eq('user_id', user_id)
                .limit(1)
                .maybeSingle();

            if (userMemberError) throw userMemberError;
            
            // FIX: This now accurately checks if the user is a member of this cluster
            user_is_member = !!userMembership; 
            cohort_id = target_cohort_id;
            
            // --- NEW FIX: PROACTIVE STATE PERSISTENCE ---
            // If the calculated count doesn't match the persisted count, update the DB.
            if (persisted_member_count !== current_members) {
                 const { error: countUpdateError } = await supabase
                    .from('cluster_metadata')
                    .update({ 
                        current_members: current_members,
                        last_updated: new Date().toISOString()
                    })
                    .eq('cluster_id', cluster_id);
                
                if (countUpdateError) {
                    console.error(`Warning: Failed to update current_members count for cluster ${cluster_id}`, countUpdateError.message);
                } else {
                     console.log(`Updated cluster_metadata.current_members for ${cluster_id} to ${current_members}.`);
                }
            }


        } else {
            // Cluster is open
            cohort_id = `C_OPEN_${cluster_id}`;
            current_members = 0;
            is_full = false;
        }

        // CRITICAL LOGIC: If VCF is uploaded, force is_full to true to maintain pause state
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
            vcf_file_name,
            max_members,
            cluster_name,
            vcf_downloads_count, 
            message: "Cohort status retrieved successfully deep. "
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

// --- HELPER FUNCTION: INJECT SUPABASE CONFIGURATION (CLEANED AND FIXED) ---
function injectSupabaseConfig(templatePath, res) {
    const filePathFull = path.join(__dirname, '..', templatePath);
    
    fs.readFile(filePathFull, 'utf8', (err, html) => {
        if (err) {
            console.error(`File Read Error for ${templatePath}:`, err);
            console.error(`Expected path: ${filePathFull}`); 
            return res.status(500).send(`Internal Server Error: Could not read HTML template file: ${templatePath}.`);
        }

        let injectedHtml = html
            // ONLY REPLACE YOUR DEFINED PLACEHOLDERS
            .replace(/__SUPABASE_URL_INJECTION__/g, supabaseUrl)
            .replace(/__SUPABASE_ANON_KEY_INJECTION__/g, supabaseAnonKey);
            
        // CRITICAL FIX: REMOVED the faulty .replace() calls that were corrupting your hardcoded keys.
            
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
    injectSupabaseConfig('leaderboard_template.html', res);
});

// Route for the new cohort page (cohort.html) - USES INJECTION
app.get('/cohort.html', (req, res) => {
    injectSupabaseConfig('cohort_template.html', res);
});

// Dedicated page for password reset/update - USES INJECTION
app.get('/update-password.html', (req, res) => {
    injectSupabaseConfig('update-password_template.html', res);
});

// Route for the Admin Console - INJECTION REQUIRED
app.get('/admin.html', (req, res) => {
    injectSupabaseConfig('admin.html', res);
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
        // Attempt to sign in the user using the Anon Key client 
        const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
            email,
            password,
        });

        if (signInError || !signInData.session) {
            console.warn(`Admin login failed for ${email}:`, signInError?.message || 'Invalid credentials.');
            return res.status(401).json({ success: false, message: 'Login failed: Invalid credentials or user is not an active admin.' });
        }
        
        const session = signInData.session;
        
        // Return the access token (which the admin.html client will store)
        return res.status(200).json({ 
            success: true, 
            message: 'Admin login successful.', 
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

    // NOTE: If dynamic_clusters is the source of truth, this POST should ideally target dynamic_clusters 
    // and rely on the synchronization logic in getCohortStatus. 
    // Since this endpoint only targets cluster_metadata, we will assume it is for manual admin creation
    // of the *state* row, not the definition row.
    
    if (!cluster_name || !cluster_region || !max_members) {
        return res.status(400).json({ success: false, message: 'Missing cluster name, region, or max members.' });
    }
    
    const clusterToInsert = {
        cluster_name,
        cluster_region,
        max_members: parseInt(max_members),
        // FIX CONFIRMED: Initializing with singular 'vcf_download_count'
        vcf_download_count: 0,
        // Default cluster_category_id as required by schema
        cluster_category_id: 1,
        // Ensure current_members is explicitly set
        current_members: 0
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
// API ENDPOINT: GET ALL CLUSTERS WITH USER DOWNLOAD STATUS (Goal 1)
// ----------------------------------------------------
app.get('/api/clusters', async (req, res) => {
    const { user_id } = req.query;

    // If no user_id is provided, we still return the list, but without specific download status checks
    if (!user_id) {
        const { data: allClusters, error: allError } = await supabase
            .from('cluster_metadata')
            .select('*')
            .order('cluster_id', { ascending: true });

        if (allError) {
            console.error('Error fetching all cluster metadata (unauthenticated):', allError.message);
            return res.status(500).json({ success: false, message: 'Failed to fetch cluster data.' });
        }
        
        // Map to include download status as false by default
        const clusters = allClusters.map(cluster => ({
            ...cluster,
            user_has_downloaded: false,
        }));
        
        return res.status(200).json({ success: true, clusters });
    }

    try {
        // Core logic for Goal 1: JOIN public.cluster_metadata with public.cluster_cohort_members
        // This query fetches metadata for ALL clusters, AND conditionally joins the user's cohort member status
        // NOTE: The `inner` join filter ensures we only get rows from cluster_cohort_members where user_id matches.
        const { data, error } = await supabase
            .from('cluster_metadata')
            .select(`
                *,
                cluster_cohort_members!inner (
                    vcf_downloaded_at
                )
            `)
            .eq('cluster_cohort_members.user_id', user_id)
            .order('cluster_id', { ascending: true });

        if (error) throw error;

        // Process the results: map and add user_has_downloaded property
        const clusters = data.map(cluster => {
            // cohortMember will be an array of objects from the join, containing vcf_downloaded_at
            const cohortMember = cluster.cluster_cohort_members?.[0];
            const vcfDownloadedAt = cohortMember?.vcf_downloaded_at;
            
            // Remove the raw join artifact before sending to the client
            delete cluster.cluster_cohort_members;

            return {
                ...cluster,
                // user_has_downloaded is true if vcf_downloaded_at is NOT null
                user_has_downloaded: !!vcfDownloadedAt,
            };
        });

        return res.status(200).json({ success: true, clusters });
        
    } catch (e) {
        console.error('SECURE GET CLUSTERS (Goal 1) ERROR:', e.message);
        return res.status(500).json({ success: false, message: 'Failed to fetch personal cluster list.' });
    }
});
// ----------------------------------------------------
// END API ENDPOINT: GET ALL CLUSTERS WITH USER DOWNLOAD STATUS
// ----------------------------------------------------


// ----------------------------------------------------
// API ENDPOINT: TRACK DOWNLOAD (Goal 2)
// ----------------------------------------------------
app.post('/api/track-download', async (req, res) => {
    const { cluster_id, user_id } = req.body;

    if (!cluster_id || !user_id) {
        return res.status(400).json({ success: false, message: 'Missing cluster_id or user_id.' });
    }
    
    const clusterIdNum = parseInt(cluster_id);
    const downloadTimestamp = new Date().toISOString();

    try {
        // 1. Per-User Update: Set vcf_downloaded_at to the current timestamp
        // This tracks that the specific user downloaded the VCF for this cluster.
        const { error: userUpdateError } = await supabase
            .from('cluster_cohort_members')
            .update({ 
                vcf_downloaded_at: downloadTimestamp
            })
            .eq('cluster_id', clusterIdNum)
            .eq('user_id', user_id);

        if (userUpdateError) {
            console.error('Per-User Download Track Error:', userUpdateError.message);
            // This is critical, we report failure here
            throw new Error(`Failed to update user status: ${userUpdateError.message}`);
        }
        
        // 2. Aggregate Update: Increment vcf_download_count
        // NOTE: The instructions assume a standard update fallback since no RPC was provided.
        // If an RPC called 'increment_vcf_download' existed, the call would be:
        // const { error: rpcError } = await supabase.rpc('increment_vcf_download', { cluster_id_param: clusterIdNum });
        
        // --- Standard Update Fallback: Read-then-update ---
        let newCount = 1; 
        const { data: current, error: fetchError } = await supabase
            .from('cluster_metadata')
            .select('vcf_download_count')
            .eq('cluster_id', clusterIdNum)
            .single();

        if (fetchError || !current) {
            console.warn(`Failed to fetch current download count for cluster ${clusterIdNum}. Assuming count is 1.`);
        } else {
            newCount = (current.vcf_download_count || 0) + 1;
        }

        const { error: countUpdateError } = await supabase
            .from('cluster_metadata')
            .update({ 
                vcf_download_count: newCount,
                last_updated: downloadTimestamp // Update timestamp to show activity
            })
            .eq('cluster_id', clusterIdNum);
        
        if (countUpdateError) {
             console.error('Aggregate Download Track Error:', countUpdateError.message);
             // Non-fatal, but logged
        } else {
             console.log(`Successfully tracked download for user ${user_id.substring(0, 8)}... on cluster ${clusterIdNum}. New count: ${newCount}.`);
        }
        // --- End Standard Update Fallback ---


        return res.status(200).json({ success: true, message: 'Download tracked successfully.' });

    } catch (e) {
        console.error('FATAL DOWNLOAD TRACKING ERROR:', e.message);
        return res.status(500).json({ success: false, message: 'Internal server error during download tracking.' });
    }
});
// ----------------------------------------------------
// END API ENDPOINT: TRACK DOWNLOAD
// ----------------------------------------------------


// ----------------------------------------------------
// SECURE API ENDPOINT: GET COHORT STATUS (Unchanged Endpoint, Uses Updated Function)
// ----------------------------------------------------
app.get('/api/cohort-status', async (req, res) => {
    const { cluster_id, user_id } = req.query;

    if (!cluster_id || !user_id) {
        return res.status(400).json({ success: false, message: 'Missing cluster_id or user_id query parameters.' });
    }

    const clusterIdNum = parseInt(cluster_id);
    if (isNaN(clusterIdNum)) {
         return res.status(400).json({ success: false, message: 'Invalid cluster_id provided.' });
    }

    const result = await getCohortStatus(clusterIdNum, user_id);

    if (result.success) {
        res.status(200).json(result);
    } else {
        // NOTE: The status code might need adjustment depending on the error message, 
        // but 500 is a safe default for a server-side DB/logic issue.
        res.status(500).json(result);
    }
});
// ----------------------------------------------------
// END COHORT STATUS API ENDPOINT
// ----------------------------------------------------

// ----------------------------------------------------
// NEW SECURE API ENDPOINT: GET CLUSTER STATS (Finalized)
// ----------------------------------------------------
app.get('/api/cluster-stats', async (req, res) => {
    const { cluster_id, user_country } = req.query;

    if (!cluster_id || !user_country) {
        return res.status(400).json({ success: false, message: 'Missing cluster_id or user_country query parameter.' });
    }

    const clusterIdNum = parseInt(cluster_id);
    if (isNaN(clusterIdNum)) {
         return res.status(400).json({ success: false, message: 'Invalid cluster_id provided.' });
    }

    try {
        // 1. Get the active cohort ID and cluster name
        // NOTE: This uses cluster_metadata. If the metadata is missing, this will fail.
        // We rely on getCohortStatus being called first to ensure metadata exists.
        const { data: clusterMeta, error: metaError } = await supabase
            .from('cluster_metadata')
            .select('active_cohort_id, cluster_name')
            .eq('cluster_id', clusterIdNum)
            .limit(1)
            .maybeSingle();

        if (metaError) throw metaError;

        const clusterName = clusterMeta?.cluster_name || `Cluster ${clusterIdNum}`;
        const activeCohortId = clusterMeta?.active_cohort_id;
        
        if (!activeCohortId) {
            return res.status(200).json({
                success: true,
                cluster_name: clusterName,
                cohort_members: [],
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
                cluster_stats: calculateClusterStats([], user_country)
            });
        }

        // 3. Fetch full user profiles 
        const { data: profiles, error: profilesError } = await supabase
            .from('user_profiles')
            .select('user_id, nickname, age, country, profession, gender, friend_reasons, services') 
            .in('user_id', userIds);

        if (profilesError) throw profilesError;

        // 4. Combine member flags with profile data for the final list
        const combinedMembers = cohortMembersRaw.map(memberRaw => {
            const profile = profiles.find(p => p.user_id === memberRaw.user_id);
            return {
                user_id: memberRaw.user_id,
                nickname: profile?.nickname || 'Unknown User',
                profession: profile?.profession || 'N/A',
                country: profile?.country || 'N/A',
                age: profile?.age || null,
                gender: profile?.gender || 'N/A', 
                friend_reasons: profile?.friend_reasons || [], 
                services: profile?.services || [], 
                display_profession: memberRaw.display_profession,
            };
        });

        // 5. Calculate statistics using the combined data
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
// REWRITTEN SECURE API ENDPOINT: JOIN CLUSTER (Includes State Persistence Fix)
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
        // --- STEP 1: INITIAL STATUS CHECK AND PREP (Will now sync if metadata is missing) ---
        const initialStatus = await getCohortStatus(clusterIdNum, userId);

        if (!initialStatus.success) {
            // This is critical: if getCohortStatus fails (e.g., cluster ID truly not found 
            // even in dynamic_clusters), we must stop.
            return res.status(500).json(initialStatus);
        }

        // Check if user is already a member (fixed by the getCohortStatus update)
        if (initialStatus.user_is_member) {
            // Return status 409 (Conflict) to indicate the resource already exists.
            return res.status(409).json({ 
                success: false, 
                message: 'User is already joined to this cluster cohort. Reloading page may fix display.',
                user_is_member: true
            });
        }

        // Check if VCF is already uploaded (the PAUSE STATE)
        if (initialStatus.vcf_uploaded) {
             return res.status(409).json({ 
                success: false, 
                message: 'Cluster is currently full and waiting for download/reset. Cannot join a full cluster.', 
                vcf_uploaded: true,
                vcf_file_name: initialStatus.vcf_file_name 
            });
        }
        
        
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
                    vcf_uploaded: false,
                    vcf_file_name: null,
                    vcf_download_count: 0,
                    current_members: 0, // Reset count to 0 when starting a new cohort
                    last_updated: new Date().toISOString()
                }) 
                .eq('cluster_id', clusterIdNum);

            if (metaUpdateError) throw metaUpdateError;
            activeCohortId = newCohortId;
            
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
             // The most common error here is PK violation (user already a member).
             if (insertError.code === '23505') { 
                  return res.status(409).json({ success: false, message: 'User is already joined to this cluster cohort.' });
             }
             return res.status(500).json({ success: false, message: `Failed to join cluster: ${insertError.message}` });
        }
        
        const newMemberCount = currentMembers + 1;
        isFullAfterJoin = newMemberCount >= maxMembers;

        // --- NEW FIX: REACTIVE STATE PERSISTENCE ---
        // Update current_members in cluster_metadata immediately after successful join
        const { error: countUpdateError } = await supabase
            .from('cluster_metadata') 
            .update({ 
                current_members: newMemberCount,
                last_updated: new Date().toISOString()
            }) 
            .eq('cluster_id', clusterIdNum);

        if (countUpdateError) {
             console.error('WARNING: Failed to update current_members after join.', countUpdateError);
             // Non-fatal error, we continue.
        }
        // --- END REACTIVE STATE PERSISTENCE ---

        // --- STEP 3: HANDLE COHORT COMPLETION (VCF Generation/PAUSE STATE) ---
        if (isFullAfterJoin) {
            console.log(`COHORT ${newCohortId} IS FULL (${newMemberCount}/${maxMembers}). Triggering VCF exchange process.`);

            let vcfUploadSuccessful = false;
            let vcfContacts = [];
            const vcfFileName = `Cluster_Contacts_${newCohortId}.vcf`;

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

                const { error: statusUpdateError } = await supabase
                    .from('cluster_metadata') 
                    .update({ 
                        vcf_uploaded: true,
                        vcf_file_name: vcfFileName,
                        vcf_download_count: 0,
                        last_updated: new Date().toISOString()
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
                    vcf_uploaded: true,
                    vcf_file_name: vcfFileName,
                    message: `Success! Cohort ${newCohortId} is complete and VCF is ready for download. Cluster is paused.` 
                });
                
            } else {
                // VCF upload failed. Keep the cluster full but mark as non-ready.
                console.warn(`VCF upload FAILED for ${newCohortId}. Cluster left in FULL state, vcf_uploaded=false.`);

                const { error: statusUpdateError } = await supabase
                    .from('cluster_metadata') 
                    .update({ 
                        vcf_uploaded: false,
                        vcf_file_name: null,
                        last_updated: new Date().toISOString()
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
// NEW SECURE API ENDPOINT: RESET CLUSTER (Confirmed Fix for vcf_download_count)
// ----------------------------------------------------
app.post('/api/reset-cluster', async (req, res) => {
    const { cluster_id, cohort_id } = req.body;
    
    if (!cluster_id || !cohort_id) {
        return res.status(400).json({ success: false, message: 'Missing cluster ID or cohort ID for reset.' });
    }
    
    const clusterIdNum = parseInt(cluster_id);
    
    try {
        console.log(`Client requested reset for Cohort ID: ${cohort_id}, Cluster ID: ${clusterIdNum}`);

        // 1. Delete the completed cohort from the membership table
        const { error: deleteError } = await supabase
            .from('cluster_cohort_members')
            .delete()
            .eq('cohort_id', cohort_id)
            .eq('cluster_id', clusterIdNum); 

        if (deleteError) {
            console.error(`FAILURE: Failed to delete raw data for ${cohort_id}.`, deleteError);
        } else {
             console.log(`Raw data for ${cohort_id} securely deleted.`);
        }
        
        // 2. Update Metadata to open the cluster for the next group
        const { error: statusUpdateError } = await supabase
            .from('cluster_metadata') 
            .update({ 
                vcf_uploaded: false,
                vcf_file_name: null,
                active_cohort_id: null,
                vcf_download_count: 0,
                current_members: 0, // Reset member count
                last_updated: new Date().toISOString()
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

// --- NEW HELPER FUNCTION: Extract Cluster ID from VCF file name ---
function extractClusterIdFromFileName(fileName) {
    // Expected format: Cluster_Contacts_C_{cluster_id}_{uuid}.vcf
    // Match the number following 'C_' and preceding the next underscore '_'
    const match = fileName.match(/C_(\d+)_/);
    if (match && match[1]) {
        return parseInt(match[1], 10);
    }
    return null;
}
// --- END NEW HELPER FUNCTION ---

// ----------------------------------------------------
// API ENDPOINT: DOWNLOAD VCF (Download only - Tracking logic moved to /api/track-download)
// ----------------------------------------------------
app.get('/api/download-contacts', async (req, res) => {
    const fileName = req.query.file_name;

    if (!fileName) {
        return res.status(400).json({ success: false, message: 'Missing file name for download.' });
    }
    
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
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        
        // Convert Blob to ArrayBuffer and then to Buffer for Express stream
        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // --- LOGIC: Download Count Increment REMOVED. Now handled by /api/track-download ---

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
    
    const { email, password, nickname, ...otherProfileFields } = submissionData;

    let newUser;
    
    try {
        // --- STEP 1: CREATE USER IN AUTH.USERS ---
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
        nickname: nickname,
        referrals: 0, 
        ...otherProfileFields
    };
    
    try {
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
        
        // 1. Sign in using the newly created credentials
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
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax'
        };
        
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
