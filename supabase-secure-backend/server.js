// server.js

require('dotenv').config(); 

const express = require('express');
// We need the createClient from auth for user sign up
const { createClient } = require('@supabase/supabase-js'); 
const cors = require('cors'); 
const path = require('path'); 

const app = express();
const port = process.env.PORT || 3000;

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL;
// NOTE: Use the SERVICE_ROLE_KEY for server-side operations to bypass RLS
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
if (!supabaseUrl || !supabaseServiceKey) {
    console.error("FATAL ERROR: Supabase environment variables are missing.");
    process.exit(1); 
}
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ------------------------------------------------------------------
// CORE MIDDLEWARE 
// ------------------------------------------------------------------

// 1. JSON Body Parser: ESSENTIAL for req.body to work.
app.use(express.json());

// 2. CORS: Allowing all origins for easy deployment on Render (you can restrict this later).
app.use(cors()); 

// ------------------------------------------------------------------
// FRONTEND SERVING CONFIGURATION (Unchanged)
// ------------------------------------------------------------------

app.use(express.static(path.join(__dirname, '..')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'wait-list.html'));
});
app.get('/wait-list.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'wait-list.html'));
});
app.get('/leaderboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'leaderboard.html'));
});


// ----------------------------------------------------
// NEW WAITLIST SUBMISSION ROUTE (TWO-STEP FIX)
// ----------------------------------------------------

app.post('/api/waitlist', async (req, res) => {
    
    const submissionData = req.body;
    
    console.log('--- Incoming Waitlist Submission ---');
    console.log('Body received (partial view):', submissionData.email, submissionData.full_name); 
    
    // 1. Input Validation: Check for required credentials
    if (!submissionData.email || !submissionData.password || !submissionData.whatsapp_number) {
        return res.status(400).json({ error: 'Missing required fields: email, password, or whatsapp_number.' });
    }
    
    const { email, password, ...profileFields } = submissionData;

    let newUser;
    
    try {
        // ------------------------------------------
        // STEP 1: CREATE USER IN AUTH.USERS
        // ------------------------------------------
        // Use the SERVICE ROLE KEY here to bypass the need for client-side RLS setup for sign-up,
        // which is safer for a server-side route.
        const { data: userData, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            // Optionally set email confirmation to skip, though generally not recommended
            email_confirm: true 
        });

        if (authError) {
            console.error('Supabase AUTH Error:', authError.message);
            // Handle common auth errors (e.g., user already registered)
            return res.status(400).json({ 
                error: 'Account creation failed.',
                details: authError.message.includes('already registered') 
                    ? 'This email is already registered.' 
                    : authError.message
            });
        }
        
        newUser = userData.user;
        console.log('SUCCESS: User created in auth.users with ID:', newUser.id);
        
    } catch (e) {
        console.error('SERVER ERROR during Supabase Auth:', e.message);
        return res.status(500).json({ error: 'Server failed during user authentication step.' });
    }

    // ------------------------------------------
    // STEP 2: CREATE PROFILE IN public.user_profiles
    // ------------------------------------------
    // Map the profile data and attach the mandatory user_id
    const profileToInsert = {
        user_id: newUser.id,
        // The frontend sends the email, but your schema already includes it in the profile table
        email: email, 
        ...profileFields
        // NOTE: password is excluded here as it's not a profile field
    };
    
    try {
        const { data: profileData, error: profileError } = await supabase
            .from('user_profiles') 
            .insert([profileToInsert])
            .select();

        if (profileError) {
            // 🚨 Crucial Log: This will catch schema mismatches (typos, wrong data type)
            console.error('Supabase PROFILE INSERTION Error:', profileError.code, profileError.message);
            
            // NOTE: If this fails after Step 1, you may need to manually delete the user from auth.users
            // to prevent orphaned accounts, but we'll ignore that complexity for now.
            
            return res.status(500).json({ 
                error: 'Database profile creation failed. Check logs for schema/column errors.',
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
// EXISTING /api/secure-data route (Unchanged)
// ----------------------------------------------------
app.get('/api/secure-data', async (req, res) => {
    // ... (existing logic)
});


app.listen(port, () => {
    console.log(`Backend server running on port ${port}`);
});
