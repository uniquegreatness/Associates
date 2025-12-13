// middleware/authMiddleware.js
// Contains reusable authentication and authorization middleware.

const { supabaseAdmin } = require('../config/supabase');

/**
 * Express middleware to verify if the incoming request has a valid Admin bearer token.
 * This utilizes the Supabase Service Role Key for verification, which is critical for server-side security.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 */
async function requireAdminAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('Admin access denied: Missing or invalid Authorization header.');
        return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const token = authHeader.split(' ')[1];
    
    try {
        // Use the Admin API to verify the token is valid
        const { data: { user }, error: authError } = await supabaseAdmin.auth.admin.getUser(token);

        if (authError || !user) {
            console.warn('Admin access denied: Token failed validation.', authError?.message);
             return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
        }
        
        // FUTURE ENHANCEMENT: Add a role check here if your admin users have a specific role flag.
        
        req.user = user;
        next();
    } catch (e) {
        console.error('Admin Auth Check Fatal Error:', e.message);
        return res.status(500).json({ success: false, message: 'Internal authentication error.' });
    }
}

module.exports = {
    requireAdminAuth,
};
