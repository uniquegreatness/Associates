// server.js

require('dotenv').config(); 

const express = require('express');
const { createClient } = require('@supabase/supabase-js'); 
const cors = require('cors'); 
const path = require('path'); 
const cookieParser = require('cookie-parser');

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
// We use the same client instance for both admin tasks (with service key)
// and standard client actions (like signInWithPassword)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ------------------------------------------------------------------
// CORE MIDDLEWARE 
// ------------------------------------------------------------------

app.use(express.json()); // Essential for parsing the request body (req.body)
app.use(cors()); 
app.use(cookieParser()); // Use cookie-parser middleware

// ------------------------------------------------------------------
// FRONTEND SERVING CONFIGURATION
// ------------------------------------------------------------------

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

// Dedicated page for password reset/update
app.get('/update-password.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'update-password.html'));
});

// ----------------------------------------------------
// SINGLE-STEP REGISTRATION ROUTE (/api/waitlist) - FINAL FIX IMPLEMENTED HERE
// ----------------------------------------------------
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
        // ✅ STEP 3: ESTABLISH ACTIVE SESSION (THE FIX)
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
        .select('user_id, nickname, gender, referrals') 
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
