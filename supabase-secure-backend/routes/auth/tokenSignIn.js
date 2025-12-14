// routes/auth/tokenSignIn.js
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase'); 

const supabase = supabaseAdmin; 

/**
 * Endpoint 1: Authenticate a user token (Standard Supabase Auth)
 */
router.post('/auth/token-sign-in', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ success: false, message: 'Token is required' });
    }

    try {
        const { data: { user }, error: authError } = await supabase.auth.admin.getUser(token);

        if (authError || !user) {
            console.error('Token validation failed:', authError?.message);
            return res.status(401).json({ success: false, message: 'Invalid token' });
        }
        
        return res.json({ success: true, user: { 
            id: user.id, 
            email: user.email, 
            user_metadata: user.user_metadata 
        } });

    } catch (e) {
        console.error('Error during token sign-in:', e.message);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = router;

