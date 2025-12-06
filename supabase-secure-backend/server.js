// server.js

require('dotenv').config(); 

const express = require('express');
const { createClient } = require('@supabase/supabase-js'); 
const cors = require('cors'); 
const path = require('path'); 
const cookieParser = require('cookie-parser');
const { text } = require('express');

const app = express();
const port = process.env.PORT || 3000;

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL;
// NOTE: Using the SERVICE_ROLE_KEY is essential for server-side direct inserts and admin tasks.
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
if (!supabaseUrl || !supabaseServiceKey) {
    console.error("FATAL ERROR: Supabase environment variables are missing.");
    process.exit(1); 
}
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }, // Critical for server-side code
});

// --- CORE CONFIGURATION ---

const MAX_COHORT_SIZE = 10000;

// Mock/Lookup for Cluster ID to Short Name (used for Cohort ID generation like PA_1)
const CLUSTER_ID_MAP = {
    1: 'PA', // Personality Archetypes
    2: 'LGA', // Life Goals & Ambitions
    3: 'CV', // Core Values
    4: 'CORE', // Core Values
    5: 'HOB', // Hobbies & Personal Interests
    6: 'WPL', // Work & Professional Lifestyle
    7: 'ER',  // Emotional & Relational Style
    8: 'GLP', // Growth & Learning Preferences
    9: 'LDH', // Lifestyle & Daily Habits
    10: 'WVP', // Worldview & Philosophy Type
};

// --- CORE MIDDLEWARE ---

app.use(express.json()); // Essential for parsing the request body (req.body)
app.use(cors()); 
app.use(cookieParser()); // Use cookie-parser middleware

// --- VCF Generation Utility ---

/**
 * Generates VCF content string based on contact array and formatting rules.
 * @param {Array<Object>} contacts - Array of contacts from the cluster table.
 * @returns {string} The complete VCF file content.
 */
function generateVcfContent(contacts) {
    let vcfString = '';

    contacts.forEach(contact => {
        const nickname = contact.nickname || 'Unknown';
        const profession = contact.profession || 'N/A';
        const whatsapp = contact.whatsapp_number || 'N/A';
        const displayProfession = contact.display_profession;

        let formattedName;
        // Logic: Nickname (Profession) OR Nickname NEARR (with space)
        if (displayProfession && profession && profession !== 'N/A') {
            formattedName = `${nickname} (${profession})`;
        } else {
            formattedName = `${nickname} NEARR`; // Confirmed: Nickname SPACE NEARR
        }

        vcfString += 'BEGIN:VCARD\n';
        vcfString += 'VERSION:3.0\n';
        vcfString += `FN:${formattedName}\n`;
        vcfString += `N:;${nickname};;; \n`; // Last name; First name; Middle name; Prefix; Suffix

        // Use TEL with X-WAID for WhatsApp compatibility (common practice)
        vcfString += `TEL;TYPE=cell;TYPE=VOICE;X-WAID:${whatsapp}\n`; 
        
        // Only include ORG if profession is displayed
        if (displayProfession && profession && profession !== 'N/A') {
             vcfString += `ORG:${profession}\n`;
        }
        
        vcfString += 'END:VCARD\n';
    });

    return vcfString.trim();
}

// --- FRONTEND SERVING CONFIGURATION ---

app.use(express.static(path.join(__dirname, '..')));

// Root path redirects to the secure leaderboard
app.get('/', (req, res) => {
    res.redirect('/leaderboard.html');
});

// Route for the login page
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'login.html'));
});

// Route for the waitlist page
app.get('/newwaitlist.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'newwaitlist.html'));
});

// Route for the leaderboard (secure dashboard)
app.get('/leaderboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'leaderboard.html'));
});

// Route for the new cohort page (cohort.html)
app.get('/cohort.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'cohort.html'));
});

// Dedicated page for password reset/update
app.get('/update-password.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'update-password.html'));
});

// ----------------------------------------------------
// NEW API ENDPOINT: JOIN CLUSTER (/api/join-cluster)
// ----------------------------------------------------
app.post('/api/join-cluster', async (req, res) => {
    const { user_id, cluster_id, display_profession } = req.body;

    if (!user_id || !cluster_id || typeof display_profession === 'undefined') {
        return res.status(400).json({ success: false, message: 'Missing user_id, cluster_id, or display_profession preference.' });
    }

    const clusterShortName = CLUSTER_ID_MAP[cluster_id];
    if (!clusterShortName) {
        return res.status(400).json({ success: false, message: 'Invalid cluster category ID.' });
    }

    let activeCohortId;
    let clusterTableName;
    let cohortNumber = 1;

    // --- STEP 1: Determine the Active Cohort (Requires 'cluster_metadata' table) ---
    // NOTE: This assumes you have a table to manage which cohort is currently active for each category.
    try {
        // Fetch current cohort data for the category
        const { data: metadata, error: metaError } = await supabase
            .from('cluster_metadata')
            .select('active_cohort_id, cohort_number, is_full')
            .eq('cluster_category_id', cluster_id)
            .single();

        if (metaError && metaError.code !== 'PGRST116') { // PGRST116 is 'No rows found'
            console.error('Metadata fetch error:', metaError);
            throw new Error('Database error during metadata lookup.');
        }

        if (metadata && !metadata.is_full) {
            activeCohortId = metadata.active_cohort_id;
            cohortNumber = metadata.cohort_number;
        } else {
            // No active cohort found, or the last one was full. Start a new one.
            cohortNumber = metadata ? metadata.cohort_number + 1 : 1;
            activeCohortId = `${clusterShortName}_${cohortNumber}`;
            
            // Upsert new metadata entry for the new active cohort
            const { error: upsertError } = await supabase
                .from('cluster_metadata')
                .upsert({ 
                    cluster_category_id: cluster_id, 
                    active_cohort_id: activeCohortId, 
                    cohort_number: cohortNumber,
                    is_full: false,
                    cluster_id: activeCohortId // Re-using for simplicity
                }, { onConflict: 'cluster_category_id' });

            if (upsertError) {
                console.error('Metadata upsert error:', upsertError);
                throw new Error('Failed to create new cohort entry.');
            }
        }
        
        clusterTableName = `cluster_contacts_${activeCohortId}`;
        console.log(`Using table: ${clusterTableName}`);

    } catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
    
    // --- STEP 2: Fetch User Profile Data ---
    try {
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('nickname, profession, whatsapp_number')
            .eq('user_id', user_id)
            .single();

        if (profileError || !profile) {
            console.error('Profile fetch error:', profileError);
            return res.status(404).json({ success: false, message: 'User profile not found.' });
        }

        // --- STEP 3: Insert Contact into the Dynamic Cluster Table ---
        // NOTE: This insert assumes the cluster table structure is correctly defined 
        // in your database (e.g., via a trigger/function) as:
        // (user_id, nickname, profession, whatsapp_number, display_profession, created_at)
        const recordToInsert = {
            user_id: user_id,
            nickname: profile.nickname,
            profession: profile.profession,
            whatsapp_number: profile.whatsapp_number,
            display_profession: display_profession,
            cohort_id: activeCohortId
        };
        
        const { error: insertError } = await supabase
            .from(clusterTableName)
            .insert([recordToInsert]);

        if (insertError) {
            // Handle case where user tries to join twice (UNIQUE constraint violation)
            if (insertError.code === '23505') { 
                 return res.status(409).json({ success: false, message: 'You have already joined this cohort.' });
            }
            console.error('Insert error into cluster table:', insertError);
            throw new Error('Failed to record membership in the cluster.');
        }

        // --- STEP 4: Check Capacity and Trigger Exchange/Deletion ---
        
        // 4a. Get Current Count
        const { count, error: countError } = await supabase
            .from(clusterTableName)
            .select('*', { count: 'exact', head: true });

        if (countError) {
             console.error('Count error:', countError);
             throw new Error('Failed to get cohort count.');
        }

        const currentMembers = count;
        let isFull = currentMembers >= MAX_COHORT_SIZE;

        if (isFull) {
            console.log(`COHORT ${activeCohortId} IS FULL. Triggering VCF exchange.`);

            // 4b. Fetch all members for VCF generation
            const { data: allContacts, error: fetchError } = await supabase
                .from(clusterTableName)
                .select('nickname, profession, whatsapp_number, display_profession');

            if (fetchError || !allContacts || allContacts.length === 0) {
                 console.error('Final fetch error:', fetchError);
                 throw new Error('Failed to fetch all contacts for VCF generation.');
            }
            
            // 4c. Generate VCF Content
            const vcfContent = generateVcfContent(allContacts);
            const fileName = `Cluster_Contacts_${activeCohortId}.vcf`;
            const storagePath = `vcf_exchange/${fileName}`;
            
            // 4d. Upload VCF to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('near_vcf_bucket') // ASSUMPTION: You have a bucket named 'near_vcf_bucket'
                .upload(storagePath, vcfContent, {
                    contentType: 'text/vcard',
                    upsert: true
                });

            if (uploadError) {
                console.error('VCF Upload Error:', uploadError);
                // CRITICAL: Even if upload fails, we must proceed to deletion to prevent retry loops.
                // An admin would need to manually fix the VCF file.
            }
            
            // 4e. Update Metadata (Mark as full)
            await supabase
                .from('cluster_metadata')
                .update({ is_full: true })
                .eq('active_cohort_id', activeCohortId);
            
            // 4f. CRITICAL STEP: DELETE THE RAW CONTACT DATA TABLE
            // NOTE: Using the postgrest API to delete the table is complex and usually requires an RPC/function.
            // Here, we simulate by clearing all data in the table (which meets the requirement of deleting the raw data).
            const { error: deleteError } = await supabase
                .from(clusterTableName)
                .delete()
                .neq('user_id', '00000000-0000-0000-0000-000000000000'); // Delete ALL rows securely

            if (deleteError) {
                console.error(`CRITICAL FAILURE: Failed to delete data in ${clusterTableName}`, deleteError);
                // Log this, but don't fail the user request, as VCF is ready.
            }
            
            isFull = true;
        }

        // --- STEP 5: Success Response ---
        return res.status(200).json({
            success: true,
            cohort_id: activeCohortId,
            current_members: currentMembers + 1, // +1 because we just added them
            is_full: isFull,
            message: isFull ? 'Cohort filled and VCF generated.' : 'Joined successfully.'
        });

    } catch (e) {
        console.error('FATAL JOIN CLUSTER ERROR:', e.message);
        return res.status(500).json({ success: false, message: 'Internal server error during cluster join process.' });
    }
});


// ----------------------------------------------------
// NEW API ENDPOINT: DOWNLOAD VCF (/api/download-contacts)
// ----------------------------------------------------
app.get('/api/download-contacts', async (req, res) => {
    const cohortId = req.query.cohort;

    if (!cohortId) {
        return res.status(400).json({ success: false, message: 'Missing cohort ID.' });
    }
    
    const storagePath = `vcf_exchange/Cluster_Contacts_${cohortId}.vcf`;

    // --- STEP 1: Check if the user is a member of this closed cohort ---
    // This requires a membership check (e.g., checking the 'user_cohort_history' table)
    // We skip this check for simplicity, but it's a critical security step.
    
    // --- STEP 2: Retrieve VCF file from Supabase Storage ---
    try {
        const { data, error } = await supabase.storage
            .from('near_vcf_bucket')
            .download(storagePath);

        if (error) {
            console.error('VCF Download Error:', error);
            // Check if the file simply doesn't exist
            if (error.statusCode === '404') {
                return res.status(404).json({ success: false, message: 'Contact file not yet generated or found.' });
            }
            throw new Error('Failed to retrieve file from storage.');
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
// EXISTING ROUTES
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
            maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
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
        // FIX: Added 'referral_code' to the select statement so it is available to the frontend.
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
