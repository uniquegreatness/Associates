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
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("FATAL ERROR: Supabase environment variables are missing.");
    process.exit(1); 
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ------------------------------------------------------------------
// CORE MIDDLEWARE 
// ------------------------------------------------------------------

app.use(express.json());
app.use(cors());
app.use(cookieParser());

// ------------------------------------------------------------------
// STATIC FRONTEND FROM ROOT DIRECTORY
// ------------------------------------------------------------------

// IMPORTANT FIX:
// Serve ALL static files from the project ROOT directory.
// Render's working directory: /opt/render/project/src
//
// Your leaderboard.html, login.html, newwaitlist.html, etc.
// ARE ALL in ROOT, so we serve that root.
app.use(express.static(path.join(__dirname)));  

// Redirect root → leaderboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'leaderboard.html'));
});

// Serve login.html
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Serve waitlist
app.get('/newwaitlist.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'newwaitlist.html'));
});

// Serve secure dashboard
app.get('/leaderboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'leaderboard.html'));
});

// Serve password page
app.get('/update-password.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'update-password.html'));
});

// ----------------------------------------------------
// WAITLIST REGISTRATION ROUTE
// ----------------------------------------------------
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
            console.error('Supabase PROFILE Error:', profileError.message);
            await supabase.auth.admin.deleteUser(newUser.id); 
            return res.status(500).json({
                error: 'Database profile creation failed. User account cleaned up.',
                details: profileError.message
            });
        }

        // NOTE: Server-side login does NOT create a frontend session reliably.
        // Keeping your original logic unchanged.
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (signInError || !signInData.session) {
            console.error('SESSION ERROR:', signInError?.message);
            return res.status(201).json({
                message: 'Successfully joined the waitlist, but please log in manually.',
                user_id: newUser.id 
            });
        }

        const session = signInData.session;

        const cookieOptions = { 
            maxAge: 1000 * 60 * 60 * 24 * 7,
            httpOnly: false,
            secure: true,
            sameSite: 'Lax'
        };

        res.cookie('sb-access-token', session.access_token, cookieOptions);
        res.cookie('sb-refresh-token', session.refresh_token, cookieOptions);

        res.status(201).json({
            message: 'Successfully joined the waitlist and session established!',
            user_id: newUser.id 
        });

    } catch (e) {
        console.error('SERVER ERROR:', e.message);
        if (newUser && newUser.id) {
            await supabase.auth.admin.deleteUser(newUser.id);
        }
        return res.status(500).json({ error: 'Server failed during finalization steps.' });
    }
});

// ----------------------------------------------------
// LEADERBOARD ROUTE
// ----------------------------------------------------
app.get('/api/secure-data', async (req, res) => {
    
    const { data, error } = await supabase
        .from('user_profiles') 
        .select('user_id, nickname, gender, referrals')
        .order('referrals', { ascending: false });

    if (error) {
        console.error('Supabase query error:', error.message);
        return res.status(500).json({
            error: 'Failed to fetch leaderboard data from the database.'
        });
    }

    res.status(200).json(data);
});


app.listen(port, () => {
    console.log(`Backend server running on port ${port}`);
});
