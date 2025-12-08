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
// NOTE: MAX_COHORT_SIZE constant is now obsolete. The limit is read dynamically 
// from cluster_metadata.max_members in the database.

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

// --- REWRITTEN DATABASE SERVICE FUNCTION: GET COHORT STATUS ---

/**
 * Retrieves the current status (cohort_id, members, is_full) and membership for a cluster.
 * REWRITTEN to use stable tables: cluster_metadata and cluster_cohort_members.
 * @param {number} cluster_id - The ID of the interest cluster.
 * @param {string} user_id - The user's Supabase ID.
 * @returns {Promise<{success: boolean, message: string, cohort_id?: string, is_full?: boolean, current_members?: number, user_is_member?: boolean, vcf_uploaded?: boolean, max_members?: number, cluster_name?: string}>}
 */
async function getCohortStatus(cluster_id, user_id) {
    console.log(`[DB] Fetching status for Cluster: ${cluster_id}, User: ${user_id.substring(0, 8)}...`);
    
    try {
        let cohort_id, current_members = 0, is_full = false, user_is_member = false, vcf_uploaded = false, max_members = 5, cluster_name = '';

        // Step 1: Get Metadata (Active Cohort ID, VCF status, Max Size, Name)
        const { data: clusterMeta, error: metaError } = await supabase
            .from('cluster_metadata') 
            .select('active_cohort_id, vcf_uploaded, max_members, cluster_name') 
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

        return {
            success: true,
            cohort_id,
            is_full,
            current_members,
            user_is_member, 
            vcf_uploaded,
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
// SECURE API ENDPOINT: GET COHORT STATUS (Uses Rewritten Function)
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
// REWRITTEN SECURE API ENDPOINT: JOIN CLUSTER 
// ----------------------------------------------------
app.post('/api/join-cluster', async (req, res) => {
    const { p_user_id, p_cluster_id, p_display_profession } = req.body;

    if (!p_user_id || !p_cluster_id || typeof p_display_profession === 'undefined') {
        console.error('Validation failed: Missing one of p_user_id, p_cluster_id, or p_display_profession');
        return res.status(400).json({ success: false, message: 'Missing required parameters.' });
    }
    
    const clusterIdNum = parseInt(p_cluster_id);
    const userId = p_user_id;

    let cohortStatus = {};
    let newCohortId; // The ID we use for insertion

    try {
        // --- STEP 1: INITIAL STATUS CHECK AND PREP ---
        const initialStatus = await getCohortStatus(clusterIdNum, userId);

        if (!initialStatus.success) {
            return res.status(500).json(initialStatus);
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
                    vcf_uploaded: false // Ensure status is reset for new cohort
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

        // --- STEP 3: HANDLE COHORT COMPLETION (VCF Generation/Cleanup) ---
        if (isFullAfterJoin) {
            console.log(`COHORT ${newCohortId} IS FULL (${newMemberCount}/${maxMembers}). Triggering VCF exchange process.`);

            // NEW: Flag to track if VCF upload succeeded
            let vcfUploadSuccessful = false;
            let vcfContacts = [];

            // 3a. Robust Two-Step Fetch for VCF Data
            // Step 3a.1: Get all user_ids and display_profession flags for the completed cohort
            const { data: cohortMembers, error: membersFetchError } = await supabase
                .from('cluster_cohort_members')
                .select('user_id, display_profession')
                .eq('cluster_id', clusterIdNum)
                .eq('cohort_id', newCohortId);

            if (membersFetchError || !cohortMembers || cohortMembers.length === 0) {
                 console.error('Final fetch error: Failed to get user IDs from cohort.', membersFetchError);
            } else {
                const userIds = cohortMembers.map(m => m.user_id);

                // Step 3a.2: Fetch detailed profile data for all members using IN clause
                const { data: profiles, error: profilesFetchError } = await supabase
                    .from('user_profiles')
                    .select('user_id, nickname, profession, whatsapp_number')
                    .in('user_id', userIds);
                
                if (profilesFetchError || !profiles || profiles.length === 0) {
                    console.error('Final fetch error: Failed to fetch user profiles for VCF.', profilesFetchError);
                } else {
                    // Combine profile data with display_profession preference
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
                const fileName = `Cluster_Contacts_${newCohortId}.vcf`;
                const storagePath = `vcf_exchange/${fileName}`;
                
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
                    vcfUploadSuccessful = true; // Set flag to true
                }
            }
            
            // --- NEW: 3d. & 3e. ATOMIC CLEANUP AND RESET ---
            if (vcfUploadSuccessful) {
                console.log(`VCF succeeded. Starting atomic cleanup for cohort ${newCohortId}.`);

                // 3d. CRITICAL CLEANUP: Delete the completed cohort from the membership table
                const { error: deleteError } = await supabase
                    .from('cluster_cohort_members')
                    .delete()
                    .eq('cohort_id', newCohortId)
                    .eq('cluster_id', clusterIdNum); 

                if (deleteError) {
                    // Log error but the state is still okay (full, but VCF exists)
                    console.error(`CRITICAL FAILURE: Failed to delete raw data for ${newCohortId}. Cluster left in full state.`, deleteError);
                } else {
                     console.log(`Raw data for ${newCohortId} securely deleted.`);
                
                    // 3e. CRITICAL: Update Metadata to open the cluster for the next group
                    const { error: statusUpdateError } = await supabase
                        .from('cluster_metadata') 
                        .update({ 
                            vcf_uploaded: true, 
                            active_cohort_id: null // Open the cluster for the next group
                        }) 
                        .eq('cluster_id', clusterIdNum); 

                    if (statusUpdateError) {
                        console.error('CRITICAL FAILURE: Failed to open cluster for new cohort.', statusUpdateError);
                    } else {
                         console.log(`Cluster ID ${clusterIdNum} successfully opened.`);
                    }
                }
            } else {
                // If VCF upload failed, keep the cluster full and mark vcf_uploaded as false
                console.warn(`VCF upload FAILED for ${newCohortId}. Cleanup SKIPPED. Cluster left in FULL state.`);

                const { error: statusUpdateError } = await supabase
                    .from('cluster_metadata') 
                    .update({ 
                        vcf_uploaded: false, // Explicitly set to false to indicate failure
                    }) 
                    .eq('cluster_id', clusterIdNum); 
                
                if (statusUpdateError) {
                    console.error('WARNING: Failed to set vcf_uploaded=false after failure.', statusUpdateError);
                }
            }

            // Determine the final response message based on VCF success
            const responseMessage = vcfUploadSuccessful 
                ? `Success! Cohort ${newCohortId} is complete and VCF is ready for download.` 
                : `Error: Cohort ${newCohortId} is full, but VCF generation failed. Cluster temporarily locked.`;
            
            // Return here since the state transition is complete
            return res.status(200).json({
                success: true, 
                cohort_id: newCohortId,
                current_members: newMemberCount, 
                is_full: isFullAfterJoin,
                message: responseMessage
            });
        }

        // --- STEP 4: Success Response (For Non-Full Cohorts) ---
        return res.status(200).json({
            success: true,
            cohort_id: newCohortId,
            current_members: newMemberCount, 
            is_full: isFullAfterJoin,
            message: `Success! Joined cohort ${newCohortId}. Waiting for more members.`
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
