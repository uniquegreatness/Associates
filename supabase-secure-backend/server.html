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
const adminEmail = process.env.SUPABASE_ADMIN_EMAIL; // <-- NEW: Use environment variable for admin email

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    console.error("FATAL ERROR: Supabase environment variables are missing (URL, SERVICE_ROLE_KEY, or ANON_KEY).");
    process.exit(1); 
}
if (!adminEmail) {
    console.warn("WARNING: SUPABASE_ADMIN_EMAIL is not set in environment variables. Admin functionality may fail.");
}


// Initialize Supabase Client using the Service Role Key for Admin actions
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
});

// Initialize a standard Supabase client for client-side Auth operations (like sign-in, which uses ANON_KEY)
const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey); 


// --- CORE MIDDLEWARE ---

app.use(express.json());
// Allow all origins for CORS to handle frontend access
app.use(cors()); 
app.use(cookieParser());

// --- RESTORED STATIC FILE SERVING ---
// Assuming '..' points to the root directory where your HTML files reside
app.use(express.static(path.join(__dirname, '..'))); 
// --- END RESTORED STATIC FILE SERVING ---


// ----------------------------------------------------
// 🚀 NEW ADMIN SECURITY UTILITY
// ----------------------------------------------------

/**
 * Checks if the given user_id is designated as an administrator.
 * NOTE: For robust security, this assumes you have an 'is_admin' column 
 * on your 'user_profiles' table or a similar mechanism.
 * @param {string} userId - The Supabase user ID to check.
 * @returns {Promise<boolean>}
 */
async function isAdmin(userId) {
    if (!userId) return false;
    
    // Simplest check: See if their profile email matches the admin email.
    // BEST PRACTICE: Use a dedicated 'is_admin: true' flag in user_profiles.
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('email, is_admin') // Assuming 'is_admin' column exists
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        if (!data) return false;

        // Check 1: Dedicated Admin Flag (Highly Recommended)
        if (data.is_admin === true) return true;

        // Check 2: Email Match (Fallback or Secondary Check)
        if (adminEmail && data.email === adminEmail) return true;
        
        return false;

    } catch (error) {
        console.error('Error checking admin role for user:', userId, error.message);
        return false;
    }
}

/**
 * Middleware to protect admin API routes.
 * It checks the session token passed in the Authorization header.
 */
async function requireAdminAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Unauthorized: Missing or invalid token.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Use the Service Key client to verify the token (server-side check)
        const { data: { user }, error: verifyError } = await supabase.auth.getUser(token);

        if (verifyError || !user) {
            console.error('Token verification failed:', verifyError?.message);
            return res.status(401).json({ success: false, message: 'Unauthorized: Invalid session.' });
        }
        
        // Final check: Does the authenticated user have admin privileges?
        const isUserAdmin = await isAdmin(user.id);

        if (!isUserAdmin) {
            return res.status(403).json({ success: false, message: 'Forbidden: User is not an administrator.' });
        }

        // Attach user info to the request for logging/further use
        req.user = user;
        next();
        
    } catch (e) {
        console.error('Admin Auth Middleware Error:', e.message);
        return res.status(500).json({ success: false, message: 'Internal server error during authentication.' });
    }
}
// ----------------------------------------------------
// 🛑 END ADMIN SECURITY UTILITY
// ----------------------------------------------------


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

// --- NEW HELPER FUNCTION: CLUSTER STATS CALCULATION (Unchanged) ---
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
        if (member.age && typeof member.age === 'number') {
            totalAge += member.age;
            minAge = Math.min(minAge, member.age); 
            maxAge = Math.max(maxAge, member.age); 
        }

        const country = member.country || 'Unknown';
        countryCounts[country] = (countryCounts[country] || 0) + 1;

        const gender = member.gender || 'Not Specified';
        genderCounts[gender] = (genderCounts[gender] || 0) + 1;
        
        if (member.display_profession) {
            const profession = member.profession || 'Not Specified';
            professionCounts[profession] = (professionCounts[profession] || 0) + 1;
        }

        const friendReasons = member.friend_reasons || [];
        if (Array.isArray(friendReasons)) {
            friendReasons.forEach(item => {
                const cleanItem = item ? item.trim() : '';
                if (cleanItem) {
                    lookingForCounts[cleanItem] = (lookingForCounts[cleanItem] || 0) + 1;
                }
            });
        }

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

    const geographic_mix = {};
    let userCountryCount = 0;
    let abroadCount = 0;
    
    for (const country in countryCounts) {
        if (country === 'Unknown') {
            continue;
        }
        
        if (cleanUserCountry && country.toLowerCase() === cleanUserCountry) {
            userCountryCount = countryCounts[country];
        } else {
            abroadCount += countryCounts[country];
        }
    }

    const userCountryDisplay = userCountry || 'Unknown (Detail Unavailable)';
    
    if (userCountryCount > 0 || total_members === 0) {
        const userCountryPercentage = total_members > 0 ? (userCountryCount / total_members) * 100 : 0;
        geographic_mix[userCountryDisplay] = Math.round(userCountryPercentage);
    }
    
    if (abroadCount > 0) {
        const abroadPercentage = total_members > 0 ? (abroadCount / total_members) * 100 : 0;
        geographic_mix['Abroad'] = Math.round(abroadPercentage);
    } else if (total_members > 0 && userCountryCount > 0) {
        if (!geographic_mix['Abroad'] && userCountryCount === total_members) {
             geographic_mix['Abroad'] = 0;
        }
    }

    const gender_mix = {};
    for (const gender in genderCounts) {
        const percentage = total_members > 0 ? (genderCounts[gender] / total_members) * 100 : 0;
        gender_mix[gender] = Math.round(percentage); 
    }

    const profession_mix = {};
    const totalDisplayedProfessions = Object.values(professionCounts).reduce((a, b) => a + b, 0);

    for (const profession in professionCounts) {
        const percentage = totalDisplayedProfessions > 0 ? (professionCounts[profession] / totalDisplayedProfessions) * 100 : 0;
        profession_mix[profession] = Math.round(percentage); 
    }

    const looking_for_mix = {};
    const totalLookingForEntries = Object.values(lookingForCounts).reduce((a, b) => a + b, 0);

    for (const item in lookingForCounts) {
        const percentage = totalLookingForEntries > 0 ? (lookingForCounts[item] / totalLookingForEntries) * 100 : 0;
        looking_for_mix[item] = Math.round(percentage); 
    }

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


// --- REWRITTEN DATABASE SERVICE FUNCTION: GET COHORT STATUS (Unchanged) ---
async function getCohortStatus(cluster_id, user_id) {
    console.log(`[DB] Fetching status for Cluster: ${cluster_id}, User: ${user_id.substring(0, 8)}...`);
    
    try {
        let cohort_id, current_members = 0, is_full = false, user_is_member = false, vcf_uploaded = false, max_members = 5, cluster_name = '', vcf_file_name = null;

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
        
        const target_cohort_id = clusterMeta.active_cohort_id;
        vcf_uploaded = clusterMeta.vcf_uploaded || false; 
        vcf_file_name = clusterMeta.vcf_file_name || null;
        max_members = clusterMeta.max_members || 5; 
        cluster_name = clusterMeta.cluster_name || `Cluster ${cluster_id}`;

        if (target_cohort_id) {
            
            const { data: members, count: current_members_count, error: membersError } = await supabase
                .from('cluster_cohort_members') 
                .select('user_id', { count: 'exact' }) 
                .eq('cluster_id', cluster_id)
                .eq('cohort_id', target_cohort_id); 

            if (membersError) throw membersError;
            
            current_members = current_members_count || 0;
            is_full = current_members >= max_members;

            user_is_member = members.some(member => member.user_id === user_id);
            cohort_id = target_cohort_id;

        } else {
            cohort_id = `C_OPEN_${cluster_id}`;
            current_members = 0;
            is_full = false;
        }

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
    if (!currentPath.includes('login.html') && !currentPath.includes('update-password.html') && !currentPath.includes('admin.html')) {
        try {
            sessionStorage.setItem('intended_destination', currentPath);
            console.log('Intended destination saved for post-login redirect:', currentPath);
        } catch (e) {
            console.error('Failed to save intended destination URL:', e);
        }
    }
</script>
`;
// --- END REDIRECT SCRIPT ---

// --- HELPER FUNCTION: INJECT SUPABASE CONFIGURATION (Updated to include admin.html) ---
function injectSupabaseConfig(templatePath, res) {
    const filePathFull = path.join(__dirname, '..', templatePath);
    
    fs.readFile(filePathFull, 'utf8', (err, html) => {
        if (err) {
            console.error(`File Read Error for ${templatePath}:`, err);
            console.error(`Expected path: ${filePathFull}`); 
            return res.status(500).send(`Internal Server Error: Could not read HTML template file: ${templatePath}.`);
        }

        let injectedHtml = html
            .replace('__SUPABASE_URL_INJECTION__', supabaseUrl)
            .replace('__SUPABASE_ANON_KEY_INJECTION__', supabaseAnonKey);
            
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


// --- FRONTEND SERVING CONFIGURATION (Updated to include admin.html) ---

app.get('/', (req, res) => {
    res.redirect('/leaderboard.html');
});

app.get('/login.html', (req, res) => {
    injectSupabaseConfig('login_template.html', res);
});

app.get('/leaderboard.html', (req, res) => {
    injectSupabaseConfig('leaderboard_template.html', res);
});

app.get('/cohort.html', (req, res) => {
    injectSupabaseConfig('cohort_template.html', res);
});

app.get('/update-password.html', (req, res) => {
    injectSupabaseConfig('update-password_template.html', res);
});

// 💡 NEW: Route for Admin Dashboard (must be injected)
app.get('/admin.html', (req, res) => {
    injectSupabaseConfig('admin.html', res);
});


// ----------------------------------------------------
// 🚀 NEW SECURE API ENDPOINT: ADMIN LOGIN (Authentication)
// ----------------------------------------------------
app.post('/api/admin-login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    try {
        // Step 1: Sign in the user using the ANONYMOUS client
        const { data, error: signInError } = await supabaseAnon.auth.signInWithPassword({
            email,
            password
        });

        if (signInError) {
            console.error('Admin Sign-In Error:', signInError.message);
            return res.status(401).json({ success: false, message: 'Invalid credentials or account not confirmed.' });
        }
        
        const user = data.user;
        
        // Step 2: Check if the authenticated user is an admin
        const isUserAdmin = await isAdmin(user.id);

        if (!isUserAdmin) {
            // Log out the non-admin user immediately for security
            await supabaseAnon.auth.signOut({ scope: 'local' });
            return res.status(403).json({ success: false, message: 'Forbidden: Account does not have admin privileges.' });
        }
        
        // Step 3: Admin check successful - return tokens for client-side session management
        // Supabase JS client handles setting cookies, so we just return the session data
        res.status(200).json({ 
            success: true, 
            message: 'Admin login successful.', 
            user: user,
            session: data.session,
            // The client will use this access_token for subsequent admin API calls
            access_token: data.session.access_token 
        });

    } catch (e) {
        console.error('FATAL ADMIN LOGIN ERROR:', e.message);
        return res.status(500).json({ success: false, message: 'Internal server error during login.' });
    }
});

// ----------------------------------------------------
// 🚀 NEW SECURE API ENDPOINTS: CLUSTER CRUD (Requires Admin Auth)
// ----------------------------------------------------

// 1. READ: Get All Dynamic Clusters
app.get('/api/admin/clusters', requireAdminAuth, async (req, res) => {
    try {
        // Select all fields from the cluster_metadata table, ordered by ID
        const { data, error } = await supabase
            .from('cluster_metadata') 
            .select('*')
            .order('cluster_id', { ascending: true });

        if (error) throw error;

        res.status(200).json({ success: true, clusters: data });
    } catch (e) {
        console.error('Admin READ Clusters Error:', e.message);
        res.status(500).json({ success: false, message: 'Failed to fetch clusters.' });
    }
});

// 2. CREATE: Add a New Cluster
app.post('/api/admin/clusters', requireAdminAuth, async (req, res) => {
    const { cluster_name, cluster_region, max_members } = req.body;

    if (!cluster_name || !cluster_region || !max_members) {
        return res.status(400).json({ success: false, message: 'Missing cluster_name, cluster_region, or max_members.' });
    }
    
    // Ensure max_members is a safe integer
    const capacity = parseInt(max_members);
    if (isNaN(capacity) || capacity < 1) {
         return res.status(400).json({ success: false, message: 'Invalid capacity value.' });
    }

    try {
        // Insert the new cluster metadata
        const { data, error } = await supabase
            .from('cluster_metadata') 
            .insert([
                { 
                    cluster_name, 
                    cluster_region, 
                    max_members: capacity,
                    // Set sensible defaults for a new cluster
                    active_cohort_id: null,
                    vcf_uploaded: false,
                    vcf_file_name: null 
                }
            ])
            .select() // Return the created row
            .single();

        if (error) throw error;

        res.status(201).json({ success: true, message: 'Cluster created successfully.', cluster: data });
    } catch (e) {
        console.error('Admin CREATE Cluster Error:', e.message);
        res.status(500).json({ success: false, message: 'Failed to create cluster.' });
    }
});

// 3. DELETE: Delete a Cluster
app.delete('/api/admin/clusters/:id', requireAdminAuth, async (req, res) => {
    const clusterId = parseInt(req.params.id);

    if (isNaN(clusterId)) {
        return res.status(400).json({ success: false, message: 'Invalid cluster ID.' });
    }

    try {
        // WARNING: Deleting from cluster_metadata requires subsequent cleanup
        // of related records in cluster_cohort_members (for RLS to work properly).

        // Step 1: Delete associated members first (soft cleanup)
        const { error: membersError } = await supabase
            .from('cluster_cohort_members')
            .delete()
            .eq('cluster_id', clusterId);
        
        if (membersError) console.warn(`Soft warning: Failed to delete associated members for cluster ${clusterId}.`, membersError.message);


        // Step 2: Delete the cluster itself
        const { error: metaError } = await supabase
            .from('cluster_metadata')
            .delete()
            .eq('cluster_id', clusterId);

        if (metaError) throw metaError;

        // NOTE: We don't delete the VCF file from storage here; that's a manual cleanup step.

        res.status(200).json({ success: true, message: `Cluster ID ${clusterId} and associated members deleted.` });
    } catch (e) {
        console.error('Admin DELETE Cluster Error:', e.message);
        res.status(500).json({ success: false, message: 'Failed to delete cluster.' });
    }
});

// ----------------------------------------------------
// END NEW SECURE API ENDPOINTS: CLUSTER CRUD
// ----------------------------------------------------


// ----------------------------------------------------
// Existing API Endpoints (Unchanged logic)
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
        res.status(500).json(result);
    }
});

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

        const { data: profiles, error: profilesError } = await supabase
            .from('user_profiles')
            .select('user_id, nickname, age, country, profession, gender, friend_reasons, services') 
            .in('user_id', userIds);

        if (profilesError) throw profilesError;

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

        const calculatedStats = calculateClusterStats(combinedMembers, user_country);

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

app.post('/api/join-cluster', async (req, res) => {
    const { p_user_id, p_cluster_id, p_display_profession } = req.body;

    if (!p_user_id || !p_cluster_id || typeof p_display_profession === 'undefined') {
        console.error('Validation failed: Missing one of p_user_id, p_cluster_id, or p_display_profession');
        return res.status(400).json({ success: false, message: 'Missing required parameters.' });
    }
    
    const clusterIdNum = parseInt(p_cluster_id);
    const userId = p_user_id;

    let newCohortId;

    try {
        const initialStatus = await getCohortStatus(clusterIdNum, userId);

        if (!initialStatus.success) {
            return res.status(500).json(initialStatus);
        }

        if (initialStatus.vcf_uploaded) {
             return res.status(409).json({ 
                success: false, 
                message: 'Cluster is currently full and waiting for download/reset. Cannot join a full cluster.', 
                vcf_uploaded: true, 
                vcf_file_name: initialStatus.vcf_file_name 
            });
        }
        
        if (initialStatus.user_is_member) {
            return res.status(409).json({ success: false, message: 'User is already joined to this cluster cohort.' });
        }
        
        const maxMembers = initialStatus.max_members;
        const currentMembers = initialStatus.current_members;
        let isFullAfterJoin = false;
        
        let activeCohortId = initialStatus.cohort_id;
        
        if (activeCohortId.startsWith('C_OPEN_')) {
            newCohortId = `C_${clusterIdNum}_${crypto.randomUUID().substring(0, 8)}`; 
            
            const { error: metaUpdateError } = await supabase
                .from('cluster_metadata') 
                .update({ 
                    active_cohort_id: newCohortId,
                    vcf_uploaded: false, 
                    vcf_file_name: null 
                }) 
                .eq('cluster_id', clusterIdNum);

            if (metaUpdateError) throw metaUpdateError;
            activeCohortId = newCohortId; 
            
        } else {
            newCohortId = activeCohortId;
        }

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

        if (isFullAfterJoin) {
            console.log(`COHORT ${newCohortId} IS FULL (${newMemberCount}/${maxMembers}). Triggering VCF exchange process.`);

            let vcfUploadSuccessful = false;
            let vcfContacts = [];
            const vcfFileName = `Cluster_Contacts_${newCohortId}.vcf`;

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
            
            if (vcfContacts.length === 0) {
                 console.error('VCF generation skipped due to zero valid contacts fetched.');
            } else {
                
                const vcfContent = generateVcfContent(vcfContacts);
                const storagePath = `vcf_exchange/${vcfFileName}`;
                
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
            
            if (vcfUploadSuccessful) {
                console.log(`VCF succeeded. Entering PAUSE state for cohort ${newCohortId}.`);

                const { error: statusUpdateError } = await supabase
                    .from('cluster_metadata') 
                    .update({ 
                        vcf_uploaded: true, 
                        vcf_file_name: vcfFileName, 
                    }) 
                    .eq('cluster_id', clusterIdNum); 

                if (statusUpdateError) {
                    console.error('CRITICAL FAILURE: Failed to set PAUSE state (vcf_uploaded=true).', statusUpdateError);
                } else {
                     console.log(`Cluster ID ${clusterIdNum} successfully entered PAUSE state.`);
                }
                
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
                console.warn(`VCF upload FAILED for ${newCohortId}. Cluster left in FULL state, vcf_uploaded=false.`);

                const { error: statusUpdateError } = await supabase
                    .from('cluster_metadata') 
                    .update({ 
                        vcf_uploaded: false, 
                        vcf_file_name: null 
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

app.post('/api/reset-cluster', async (req, res) => {
    const { cluster_id, cohort_id } = req.body;
    
    if (!cluster_id || !cohort_id) {
        return res.status(400).json({ success: false, message: 'Missing cluster ID or cohort ID for reset.' });
    }
    
    const clusterIdNum = parseInt(cluster_id);
    
    try {
        console.log(`Client requested reset for Cohort ID: ${cohort_id}, Cluster ID: ${clusterIdNum}`);

        const { error: deleteError } = await supabase
            .from('cluster_cohort_members')
            .delete()
            .eq('cohort_id', cohort_id)
            .eq('cluster_id', clusterIdNum); 

        if (deleteError) {
            console.warn(`Soft warning: Failed to delete raw data for ${cohort_id}.`, deleteError);
        } else {
             console.log(`Raw data for ${cohort_id} securely deleted.`);
        }
        
        const { error: statusUpdateError } = await supabase
            .from('cluster_metadata') 
            .update({ 
                vcf_uploaded: false,        
                vcf_file_name: null,        
                active_cohort_id: null      
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

app.get('/api/download-contacts', async (req, res) => {
    const fileName = req.query.file_name;

    if (!fileName) {
        return res.status(400).json({ success: false, message: 'Missing file name for download.' });
    }
    
    const storagePath = `vcf_exchange/${fileName}`;

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


        res.setHeader('Content-Type', 'text/vcard;charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        
        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        res.send(buffer);

    } catch (e) {
        console.error('FATAL DOWNLOAD CONTACTS ERROR:', e.message);
        return res.status(500).json({ success: false, message: 'Internal server error during file download.' });
    }
});


app.post('/api/waitlist', async (req, res) => {
    const submissionData = req.body;
    
    if (!submissionData.email || !submissionData.password || !submissionData.whatsapp_number || !submissionData.nickname) {
        return res.status(400).json({ error: 'Missing required fields: email, password, nickname, or whatsapp_number.' });
    }
    
    const { email, password, nickname, ...otherProfileFields } = submissionData;

    let newUser;
    
    try {
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
            
            await supabase.auth.admin.deleteUser(newUser.id); 
            
            return res.status(500).json({ 
                error: 'Database profile creation failed. User account cleaned up.', 
                details: profileError.message
            });
        }
        
        const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (signInError || !signInData.session) {
             console.error('CRITICAL ERROR: Failed to reliably sign in newly created user.', signInError?.message);
             return res.status(201).json({ 
                message: 'Successfully joined the waitlist, but please log in manually due to session error.', 
                user_id: newUser.id 
             });
        }
        
        const session = signInData.session;

        const cookieOptions = { 
            maxAge: 1000 * 60 * 60 * 60 * 24 * 7, 
            httpOnly: false, 
            secure: process.env.NODE_ENV === 'production', 
            sameSite: 'Lax' 
        };
        
        res.cookie('sb-access-token', session.access_token, cookieOptions); 
        res.cookie('sb-refresh-token', session.refresh_token, cookieOptions);

        console.log('SUCCESS: Profile created and instant session established!');
        res.status(201).json({ 
            message: 'Successfully joined the waitlist and session established!', 
            user_id: newUser.id 
        });

    } catch (e) {
        console.error('SERVER ERROR during Profile Creation/Session Setup:', e.message);
        if (newUser && newUser.id) {
             await supabase.auth.admin.deleteUser(newUser.id);
        }
        return res.status(500).json({ error: 'Server failed during finalization steps.' });
    }
});

app.get('/api/secure-data', async (req, res) => {
    
    const { data, error } = await supabase
        .from('user_profiles') 
        .select('user_id, nickname, gender, referrals, referral_code') 
        .order('referrals', { ascending: false }); 

    if (error) {
        console.error('Supabase query error for leaderboard:', error.message);
        return res.status(500).json({ 
            error: 'Failed to fetch leaderboard data from the database.'
        });
    }

    res.status(200).json(data);
});


app.listen(port, () => {
    console.log(`Backend server running on port ${port}`);
});
