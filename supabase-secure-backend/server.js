// server.js

require('dotenv').config(); 

const express = require('express');
const { createClient } = require('@supabase/supabase-js'); 
const cors = require('cors'); 
const path = require('path'); 

const app = express();
const port = process.env.PORT || 3000;

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL;
// NOTE: Using the SERVICE_ROLE_KEY is essential for server-side direct inserts.
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
if (!supabaseUrl || !supabaseServiceKey) {
    console.error("FATAL ERROR: Supabase environment variables are missing.");
    process.exit(1); 
}
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ------------------------------------------------------------------
// CORE MIDDLEWARE 
// ------------------------------------------------------------------

app.use(express.json()); // Essential for parsing the request body (req.body)
app.use(cors()); 

// ------------------------------------------------------------------
// FRONTEND SERVING CONFIGURATION (UPDATED for 'newwaitlist.html')
// ------------------------------------------------------------------

app.use(express.static(path.join(__dirname, '..')));

// Route for root path (/) now points to the new file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'newwaitlist.html'));
});
// Explicit route for the new file name
app.get('/newwaitlist.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'newwaitlist.html'));
});
// Existing leaderboard route
app.get('/leaderboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'leaderboard.html'));
});


// ----------------------------------------------------
// SINGLE-STEP REGISTRATION ROUTE (/api/waitlist)
// Includes user creation and profile insertion with cleanup logic.
// ----------------------------------------------------
app.post('/api/waitlist', async (req, res) => {
    
    const submissionData = req.body;
    
    // 1. Input Validation: Check for required credentials
    if (!submissionData.email || !submissionData.password || !submissionData.whatsapp_number) {
        return res.status(400).json({ error: 'Missing required fields: email, password, or whatsapp_number.' });
    }
    
    // Separate fields needed for auth from fields needed for profile
    const { email, password, ...profileFields } = submissionData;

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
        console.log('SUCCESS: User created in auth.users with ID:', newUser.id);
        
    } catch (e) {
        console.error('SERVER ERROR during Supabase Auth:', e.message);
        return res.status(500).json({ error: 'Server failed during user authentication step.' });
    }

    // --- STEP 2: CREATE PROFILE IN public.user_profiles ---
    const profileToInsert = {
        user_id: newUser.id,
        email: email, 
        // Ensure 'referrals' starts at 0, even if not explicitly passed by the client
        referrals: 0, 
        ...profileFields // Includes all remaining profile data
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

        // Final Success
        console.log('SUCCESS: Profile created for user:', newUser.id);
        res.status(201).json({ 
            message: 'Successfully joined the waitlist and created profile!', 
            user_id: newUser.id 
        });

    } catch (e) {
        console.error('SERVER ERROR during Profile Creation:', e.message);
        return res.status(500).json({ error: 'Server failed during profile creation step.' });
    }
});

// ----------------------------------------------------
// LEADERBOARD DATA ROUTE (/api/secure-data) - FINALIZED
// Fetches data from user_profiles, sorted by 'referrals'
// ----------------------------------------------------
app.get('/api/secure-data', async (req, res) => {
    
    // Fetch data from the public.user_profiles table
    const { data, error } = await supabase
        .from('user_profiles') 
        // We only fetch fields the frontend needs for display and ranking
        .select('user_id, nickname, gender, referrals') 
        .order('referrals', { ascending: false }); // CRITICAL: Order by referrals DESC for ranking

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
