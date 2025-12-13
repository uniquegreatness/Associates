// config/supabase.js
// Initializes and exports the Supabase client instances.

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Supabase Configuration from .env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    console.error("FATAL ERROR: Supabase environment variables are missing (URL, SERVICE_ROLE_KEY, or ANON_KEY).");
    process.exit(1); 
}

// 1. Initialize Supabase Client using the Service Role Key for Admin actions (server-side operations)
// This is used for all secure, administrative CRUD operations.
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
});

// 2. Initialize Supabase Client using the Anon Key for client-side authentication/session creation
// This is used internally by the server-side login/waitlist to mimic client behavior.
const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
});

// Export the necessary configuration variables and clients
module.exports = {
    supabaseAdmin,
    supabaseAnon,
    supabaseUrl,
    supabaseAnonKey,
};
