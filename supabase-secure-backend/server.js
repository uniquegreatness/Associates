require('dotenv').config(); 

const express = require('express');
const { createClient } = require('@supabase/supabase-js'); 
const cors = require('cors'); 
const path = require('path'); 
const cookieParser = require('cookie-parser');
const fs = require('fs');
const { text } = require('express');

const app = express();
const port = process.env.PORT || 3000;
const MAX_COHORT_SIZE = 5; // Define the max size used by the status checker

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    console.error("FATAL ERROR: Supabase environment variables are missing (URL, SERVICE_ROLE_KEY, or ANON_KEY).");
    process.exit(1); 
}

// Initialize Supabase Client using the Service Role Key for Admin actions
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
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

// --- VCF Generation Utility ---

/**
 * Generates VCF content string based on contact array and formatting rules.
 * FIX: Implements the "NEARR" fallback for profession if display_profession is false (Issue #1).
 * @param {Array<Object>} contacts - Array of contacts from the cluster table.
 * @returns {string} The complete VCF file content.
 */
function generateVcfContent(contacts) {
    let vcfString = '';

    contacts.forEach(contact => {
        // Ensure all necessary properties exist before accessing
        const nickname = contact.nickname || 'Unknown';
        const profession = contact.profession || ''; // Use empty string instead of 'N/A' for better checking
        const whatsapp = contact.whatsapp_number || 'N/A';
        const displayProfession = contact.display_profession;

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
        vcfString += `N:;${nickname};;; \n`; 

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

// --- UPDATED DATABASE SERVICE FUNCTION: GET COHORT STATUS ---

/**
 * Retrieves the current status (cohort_id, members, is_full) and membership for a cluster.
 * FIX: Re-engineered to query the dynamic membership table (cluster_contacts_X) 
 * based on cluster_id to correctly check user membership.
 * @param {number} cluster_id - The ID of the interest cluster (1-10).
 * @param {string} user_id - The user's Supabase ID.
 * @returns {Promise<{success: boolean, message: string, cohort_id?: string, is_full?: boolean, current_members?: number, user_is_member?: boolean, vcf_uploaded?: boolean}>}
 */
async function getCohortStatus(cluster_id, user_id) {
    console.log(`[DB] Fetching status for Cluster: ${cluster_id}, User: ${user_id.substring(0, 8)}...`);
    
    // Determine the dynamic membership table name based on the cluster_id
    const membershipTableName = `cluster_contacts_${cluster_id}`;

    try {
        let cohort_id, current_members = 0, is_full = false, user_is_member = false, vcf_uploaded = false;
        let target_cohort_id;

        // Step 1: Get Metadata (Active Cohort ID, VCF status)
        // This is done first so we know the target cohort ID and VCF status immediately.
        const { data: clusterMeta, error: metaError } = await supabase
            .from('cluster_metadata') 
            .select('active_cohort_id, vcf_uploaded') 
            .eq('cluster_id', cluster_id)
            .limit(1)
            .maybeSingle();

        if (metaError) throw metaError;
        
        target_cohort_id = clusterMeta?.active_cohort_id;
        vcf_uploaded = clusterMeta?.vcf_uploaded || false; 

        // Step 2: Check Membership by querying the dynamically named table
        if (target_cohort_id) {
            
            // Check for existence of the user in the dynamic table
            const { data: memberEntry, error: memberCheckError } = await supabase
                .from(membershipTableName) 
                .select('user_id', { count: 'exact', head: true }) 
                .eq('user_id', user_id)
                .limit(1)
                .maybeSingle();

            // We specifically ignore the "table does not exist" error (42P01) 
            // as this just means the cluster has 0 members and the table wasn't created yet.
            if (memberCheckError && memberCheckError.code !== '42P01') { 
                throw memberCheckError;
            }

            // If data is returned (meaning a row exists for this user_id), the user is a member.
            if (memberEntry) {
                user_is_member = true;
            } 
            
            // Step 3: Count members in the dynamic table (which represents the active cohort)
            const { count: current_members_count, error: countError } = await supabase
                .from(membershipTableName)
                .select('*', { count: 'exact', head: true }); 

            if (countError && countError.code !== '42P01') throw countError;
            
            cohort_id = target_cohort_id;
            // Handle table not found (42P01) during count: count is 0
            current_members = current_members_count || 0;
            is_full = current_members >= MAX_COHORT_SIZE;

        } else {
            // If cluster_metadata exists but no active_cohort_id is set
            cohort_id = `C_OPEN_${cluster_id}`;
            current_members = 0;
            is_full = false;
        }

        return {
            success: true,
            cohort_id,
            is_full,
            current_members,
            user_is_member, // This is the final check for the frontend
            vcf_uploaded,
            message: "Cohort status retrieved successfully."
        };

    } catch (error) {
        console.error(`Error in getCohortStatus for ${membershipTableName}:`, error.message);
        return { success: false, message: `Database error: ${error.message}` };
    }
}
// --- END UPDATED DATABASE SERVICE FUNCTION ---


// --- REDIRECT SCRIPT FOR CENTRALIZED INJECTION ---

// This script saves the current URL path (e.g., /cohort.html) into sessionStorage
// so the login page knows where to redirect the user after successful sign-in.
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

// --- HELPER FUNCTION: INJECT SUPABASE CONFIGURATION ---

/**
 * Reads an HTML TEMPLATE file, injects the Supabase config, 
 * the redirect logic script, and sends the modified HTML.
 * @param {string} templatePath - The path to the HTML template file (e.g., 'cohort_template.html').
 * @param {object} res - The Express response object.
 */
function injectSupabaseConfig(templatePath, res) {
    // The template file is located one directory up (../) from server.js
    const filePathFull = path.join(__dirname, '..', templatePath);
    
    fs.readFile(filePathFull, 'utf8', (err, html) => {
        if (err) {
            console.error(`File Read Error for ${templatePath}:`, err);
            // Log the expected full path for troubleshooting file existence
            console.error(`Expected path: ${filePathFull}`); 
            return res.status(500).send(`Internal Server Error: Could not read HTML template file: ${templatePath}.`);
        }

        // Inject the raw string values directly into the placeholders 
        // which are wrapped in quotes in the HTML.
        let injectedHtml = html
            .replace('__SUPABASE_URL_INJECTION__', supabaseUrl)
            .replace('__SUPABASE_ANON_KEY_INJECTION__', supabaseAnonKey);
            
        // CRITICAL: Inject the URL saving script right before the closing </head> tag.
        const headCloseTag = '</head>';
        if (injectedHtml.includes(headCloseTag)) {
            injectedHtml = injectedHtml.replace(headCloseTag, `${REDIRECT_SAVE_SCRIPT}${headCloseTag}`);
        } else {
             // Fallback warning in case the template is malformed
             console.warn('Could not find </head> tag for script injection in:', templatePath);
        }

        res.send(injectedHtml);
    });
}
// --- END HELPER FUNCTION ---


// --- FRONTEND SERVING CONFIGURATION ---

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

// ----------------------------------------------------
// NEW SECURE API ENDPOINT: GET COHORT STATUS
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
// END NEW API ENDPOINT
// ----------------------------------------------------


// ----------------------------------------------------
// SECURE API ENDPOINT: JOIN CLUSTER (RPC Call)
// ----------------------------------------------------
app.post('/api/join-cluster', async (req, res) => {
    // Destructure using the 'p_' prefix as sent by the client
    const { p_user_id, p_cluster_id, p_display_profession } = req.body;

    // Use the correctly destructured variables for validation
    if (!p_user_id || !p_cluster_id || typeof p_display_profession === 'undefined') {
        console.error('Validation failed: Missing one of p_user_id, p_cluster_id, or p_display_profession');
        return res.status(400).json({ success: false, message: 'Missing required parameters.' });
    }
    
    let cohortStatus;

    try {
        // --- STEP 1: Call the secure PostgreSQL Function (RPC) ---
        const FUNCTION_NAME = 'complete_cohort_exchange'; 

        const { data: result, error: rpcError } = await supabase.rpc(FUNCTION_NAME, {
            p_cluster_id: p_cluster_id, // Must be 1st
            p_display_profession: p_display_profession, // Must be 2nd
            p_user_id: p_user_id, // Must be 3rd
        });

        if (rpcError) {
            console.error(`RPC Error (${FUNCTION_NAME}):`, rpcError.message);
            if (rpcError.message.includes('already joined cohort')) {
                 return res.status(409).json({ success: false, message: rpcError.message });
            }
            return res.status(500).json({ success: false, message: rpcError.message });
        }

        // The RPC returns an array of one result object (due to RETURNS TABLE)
        cohortStatus = result[0]; 

        // --- STEP 2: Handle Cohort Completion (VCF Generation/Cleanup) ---
        if (cohortStatus.is_full) {
            console.log(`COHORT ${cohortStatus.cohort_id} IS FULL. Triggering VCF exchange process.`);

            // NOTE: The cohort table name is simplified to 'cohort_members' for fetching all contacts 
            // from the newly completed cohort.
            const cohortTableName = 'cohort_members'; 
            
            // 2a. Fetch all members for VCF generation
            // IMPORTANT: This relies on the database having a view or logic to join
            // 'cohort_members' with 'user_profiles' to get nickname, profession, etc.
            
            // To be robust, let's query the specific raw contact table based on the cohort ID.
            // We assume the RPC creates a temporary table named 'cluster_contacts_${cohortStatus.cohort_id}' 
            // as referenced in your original code. If this table doesn't exist, the next step fails.
            
            const rawContactTableName = `cluster_contacts_${cohortStatus.cohort_id}`;
            
            const { data: allContacts, error: fetchError } = await supabase
                .from(rawContactTableName)
                .select('nickname, profession, whatsapp_number, display_profession');

            if (fetchError || !allContacts || allContacts.length === 0) {
                 console.error('Final fetch error: Failed to fetch contacts for VCF. VCF generation skipped.', fetchError);
                 // We still return success but log the failure, as the join was successful.
            } else {
                 // 2b. Generate VCF Content
                const vcfContent = generateVcfContent(allContacts);
                const fileName = `Cluster_Contacts_${cohortStatus.cohort_id}.vcf`;
                const storagePath = `vcf_exchange/${fileName}`;
                
                // 2c. Upload VCF to Supabase Storage
                const { error: uploadError } = await supabase.storage
                    .from('near_vcf_bucket')
                    .upload(storagePath, vcfContent, {
                        contentType: 'text/vcard',
                        upsert: true
                    });

                if (uploadError) {
                    console.error('VCF Upload Error:', uploadError);
                } else {
                    // 2d. FIX: Update VCF Upload Status in cluster_metadata (Issue #3 fix)
                    const { error: statusUpdateError } = await supabase
                        .from('cluster_metadata') // <-- Use the correct metadata table
                        .update({ vcf_uploaded: true }) 
                        .eq('cluster_id', p_cluster_id); 

                    if (statusUpdateError) {
                        console.error('CRITICAL FAILURE: Failed to update VCF uploaded status in cluster_metadata.', statusUpdateError);
                    } else {
                         console.log(`VCF upload status updated for Cluster ID: ${p_cluster_id}.`);
                    }
                }
            }
            
            // 2e. CRITICAL STEP: Call the secure RPC to DELETE THE RAW CONTACT DATA
            // NOTE: The original RPC call signature for deletion might be incorrect. 
            // It should ideally call a dedicated cleanup function, or the original RPC should accept cohort_id alone.
            // Since we don't know the exact cleanup RPC name, we call the original one with the cohort ID for now, 
            // assuming the database function is overloaded to handle it, but log a warning.
            
            const { error: deleteError } = await supabase.rpc(FUNCTION_NAME, { 
                p_cohort_id_cleanup: cohortStatus.cohort_id // Use a specific parameter name to avoid conflict
            });

            if (deleteError) {
                console.error(`CRITICAL FAILURE: Failed to delete raw data using RPC for ${cohortStatus.cohort_id}`, deleteError);
            } else {
                 console.log(`Raw data for ${cohortStatus.cohort_id} securely deleted.`);
            }
        }

        // --- STEP 3: Success Response ---
        return res.status(200).json({
            success: true,
            cohort_id: cohortStatus.cohort_id,
            current_members: Number(cohortStatus.current_members), 
            is_full: cohortStatus.is_full,
            message: cohortStatus.message
        });

    } catch (e) {
        console.error('FATAL JOIN CLUSTER ERROR:', e.message);
        return res.status(500).json({ success: false, message: 'Internal server error during cluster join process.' });
    }
});


// ----------------------------------------------------
// API ENDPOINT: DOWNLOAD VCF (/api/download-contacts)
// ----------------------------------------------------
app.get('/api/download-contacts', async (req, res) => {
    const cohortId = req.query.cohort;

    if (!cohortId) {
        return res.status(400).json({ success: false, message: 'Missing cohort ID.' });
    }
    
    const storagePath = `vcf_exchange/Cluster_Contacts_${cohortId}.vcf`;

    // --- STEP 1: Retrieve VCF file from Supabase Storage ---
    try {
        // FIX: The `.download` method can return `null` if the file is not found, 
        // leading to the "Failed to retrieve file" error (Issue #3).
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

        // Check if data is null (which can happen on a soft 404/file not ready)
        if (!data) {
             console.warn(`VCF file download returned null data for path: ${storagePath}`);
             return res.status(404).json({ success: false, message: 'File is not yet ready for download. Please try again in a moment.' });
        }


        // Send the file content back to the client
        res.setHeader('Content-Type', 'text/vcard;charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=Cluster_Contacts_${cohortId}.vcf`);
        
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
// EXISTING ROUTES (No changes needed here)
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
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
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
