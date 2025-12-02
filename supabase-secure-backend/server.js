// server.js

require('dotenv').config(); 

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors'); 

const app = express();
const port = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 

const supabase = createClient(supabaseUrl, supabaseServiceKey);

app.use(cors()); 
app.use(express.json());

// The endpoint your frontend will call: /api/secure-data
app.get('/api/secure-data', async (req, res) => {

    // This query runs securely using the SERVICE_ROLE_KEY
    const { data, error } = await supabase
        .from('items') // <--- *** CHANGE THIS TO YOUR TABLE NAME ***
        .select('*');

    if (error) {
        console.error('Supabase query error:', error.message);
        return res.status(500).json({ 
            error: 'Failed to fetch data securely from the database.'
        });
    }

    res.status(200).json(data);
});

app.listen(port, () => {
    console.log(`Backend server running on port ${port}`);
});
