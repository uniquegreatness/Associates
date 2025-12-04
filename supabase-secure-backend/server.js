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
  console.error('FATAL ERROR: Supabase environment variables are missing.');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ------------------------------------------------------------------
// CORE MIDDLEWARE
// ------------------------------------------------------------------
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());

// ------------------------------------------------------------------
// FRONTEND SERVING CONFIGURATION
// ------------------------------------------------------------------
// Serve static files from a safer explicit "public" folder
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.redirect('/leaderboard.html'));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/newwaitlist.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'newwaitlist.html')));
app.get('/leaderboard.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'leaderboard.html')));
app.get('/update-password.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'update-password.html')));

// ---------------------- Helper: validate access token ----------------------
async function validateAccessToken(req) {
  // Accept Authorization header or sb-access-token cookie
  const authHeader = req.headers.authorization || '';
  const tokenFromHeader = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const token = tokenFromHeader || req.cookies['sb-access-token'] || req.get('x-supabase-auth');

  if (!token) {
    return { error: { status: 401, message: 'Missing access token' } };
  }

  // Use Supabase auth.getUser to validate the token
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return { error: { status: 401, message: 'Invalid or expired token' } };
    }
    return { user: data.user };
  } catch (e) {
    return { error: { status: 500, message: 'Token validation failed' } };
  }
}

// ----------------------------------------------------
// SINGLE-STEP REGISTRATION ROUTE (/api/waitlist)
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
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      console.error('Supabase AUTH Error:', authError.message);
      const details = authError.message.includes('already registered') ? 'This email is already registered.' : 'Account creation failed.';
      return res.status(400).json({ error: 'Registration failed.', details });
    }

    newUser = userData.user;
  } catch (e) {
    console.error('SERVER ERROR during Supabase Auth:', e.message);
    return res.status(500).json({ error: 'Server failed during user authentication step.' });
  }

  const profileToInsert = {
    user_id: newUser.id,
    email,
    nickname,
    referrals: 0,
    ...otherProfileFields,
  };

  try {
    const { error: profileError } = await supabase.from('user_profiles').insert([profileToInsert]);
    if (profileError) {
      console.error('Supabase PROFILE INSERTION Error:', profileError.code, profileError.message);
      await supabase.auth.admin.deleteUser(newUser.id);
      return res.status(500).json({
        error: 'Database profile creation failed. User account cleaned up.',
        details: profileError.message,
      });
    }

    // Sign in the new user to obtain session tokens to return to the client
    // Note: We intentionally DO NOT try to embed server cookies for the browser here.
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signInData?.session) {
      console.error('CRITICAL ERROR: Failed to reliably sign in newly created user.', signInError?.message);
      // Return success but tell client to log in manually
      return res.status(201).json({
        message: 'Successfully registered, please log in manually due to session error.',
        user_id: newUser.id,
      });
    }

    const session = signInData.session;
    // Return session tokens to frontend so it can call supabase.auth.setSession(...) client-side
    return res.status(201).json({
      message: 'Successfully registered and session created.',
      user_id: newUser.id,
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
      },
    });
  } catch (e) {
    console.error('SERVER ERROR during Profile Creation/Session Setup:', e.message);
    if (newUser && newUser.id) {
      await supabase.auth.admin.deleteUser(newUser.id);
    }
    return res.status(500).json({ error: 'Server failed during finalization steps.' });
  }
});

// ----------------------------------------------------
// LEADERBOARD DATA ROUTE (/api/secure-data) - protected
// ----------------------------------------------------
app.get('/api/secure-data', async (req, res) => {
  const validation = await validateAccessToken(req);
  if (validation.error) {
    return res.status(validation.error.status).json({ error: validation.error.message });
  }

  // Fetch leaderboard
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, nickname, gender, referrals')
    .order('referrals', { ascending: false });

  if (error) {
    console.error('Supabase query error for leaderboard:', error.message);
    return res.status(500).json({ error: 'Failed to fetch leaderboard data from the database.' });
  }

  res.status(200).json(data);
});

// Optional: user profile endpoint that returns the profile for the validated token's user
app.get('/api/me', async (req, res) => {
  const validation = await validateAccessToken(req);
  if (validation.error) {
    return res.status(validation.error.status).json({ error: validation.error.message });
  }

  const userId = validation.user.id;
  const { data, error } = await supabase.from('user_profiles').select('*').eq('user_id', userId).limit(1).single();

  if (error) {
    console.error('Supabase query error for /api/me:', error.message);
    return res.status(500).json({ error: 'Failed to fetch user profile.' });
  }

  res.status(200).json(data);
});

app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
});
