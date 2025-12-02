// server.js

require('dotenv').config(); 

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors'); 
const path = require('path'); // Add path module for file operations

const app = express();
const port = process.env.PORT || 3000;

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const supabase = createClient(supabaseUrl, supabaseServiceKey);

app.use(cors()); 
app.use(express.json());

// ----------------------------------------------------
// FRONTEND SERVING CONFIGURATION
// Assuming ALL frontend files (index.html, CSS, JS) are one level up (..) 
// from the current directory ('supabase-secure-backend')
// ----------------------------------------------------

// Configure Express to serve static files from the parent directory
app.use(express.static(path.join(__dirname, '..')));

// This route handles all GET requests that didn't match an API route.
// It sends the main index.html file to start the frontend application.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// If your wait-listupdate.html or leaderboard.html are also accessed directly 
// via the browser, you may need specific routes for them:
app.get('/wait-listupdate.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'wait-listupdate.html'));
});
app.get('/leaderboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'leaderboard.html'));
});

// ----------------------------------------------------
// END FRONTEND SERVING CONFIGURATION
// ----------------------------------------------------


// The endpoint your frontend will call: /api/secure-data
app.get('/api/secure-data', async (req, res) => {

    // This query runs securely using the SERVICE_ROLE_KEY
    const { data, error } = await supabase
        .from('items') // <--- This is your existing table query
        .select('*');

    if (error) {
        console.error('Supabase query error:', error.message);
        return res.status(500).json({ 
            error: 'Failed to fetch data securely from the database.'
        });
    }

    res.status(200).json(data);
});


// ----------------------------------------------------
// NEW WAITLIST SUBMISSION ROUTE
// ----------------------------------------------------

// New endpoint to handle waitlist form submissions (e.g., from 'join wait-list' button)
app.post('/api/waitlist', async (req, res) => {
    
    // Get data from the request body (e.g., { email: "user@example.com" })
    const submissionData = req.body;
    
    if (!submissionData || Object.keys(submissionData).length === 0) {
        return res.status(400).json({ error: 'No data provided in the request body.' });
    }

    // Insert data into the 'user_profiles' Supabase table
    const { data, error } = await supabase
        .from('user_profiles') // *** USING YOUR SPECIFIED TABLE NAME ***
        .insert([submissionData])
        .select();

    if (error) {
        console.error('Supabase insertion error:', error.message);
        
        // Handle common errors like duplicate keys (e.g., if 'email' is unique)
        if (error.code === '23505') { 
             return res.status(409).json({ error: 'This entry is already in the database (e.g., email already exists).' });
        }
        return res.status(500).json({ 
            error: 'Failed to save submission. Please check server logs for details.' 
        });
    }

    // Respond with success
    res.status(201).json({ 
        message: 'Successfully joined the waitlist!', 
        record: data[0] 
    });
});

// ----------------------------------------------------
// END NEW WAITLIST SUBMISSION ROUTE
// ----------------------------------------------------


app.listen(port, () => {
    console.log(`Backend server running on port ${port}`);
});
