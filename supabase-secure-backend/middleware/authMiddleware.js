// middleware/authMiddleware.js
// Contains reusable authentication and authorization middleware.

const { supabaseAdmin, supabaseUrl, supabaseAnonKey } = require('../config/supabase');
const { createClient } = require('@supabase/supabase-js');

// Supabase client for normal user token validation
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Express middleware to verify if the incoming request has a valid Admin bearer token.
 * Uses Supabase Service Role Key for verification.
 */
async function requireAdminAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('Admin access denied: Missing or invalid Authorization header.');
        return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.admin.getUser(token);
        if (authError || !user) {
            console.warn('Admin access denied: Token failed validation.', authError?.message);
            return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
        }

        // Optional: check admin flag here if needed
        req.user = user;
        next();
    } catch (e) {
        console.error('Admin Auth Fatal Error:', e.message);
        return res.status(500).json({ success: false, message: 'Internal authentication error.' });
    }
}

/**
 * Express middleware to verify if the incoming request has a valid User bearer token.
 * Normal users use this to access protected endpoints.
 */
async function requireUserAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Validate normal user token using public anon key
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            console.warn('User token validation failed:', error?.message);
            return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
        }

        // Attach user info to req for downstream endpoints
        req.user = user;
        next();
    } catch (e) {
        console.error('User Auth Fatal Error:', e.message);
        return res.status(500).json({ success: false, message: 'Internal authentication error.' });
    }
}

module.exports = {
    requireAdminAuth,
    requireUserAuth,
};
