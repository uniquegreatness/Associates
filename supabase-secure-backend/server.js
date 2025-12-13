// server.js
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const apiRoutes = require('./routes/apiRoutes');
const { injectSupabaseConfig } = require('./utils/cohortUtils');
const { supabaseUrl } = require('./config/supabase'); // For logging and basic checks

const app = express();
const port = 3000;

// Middleware Setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Log basic configuration info
console.log(`[Config] Supabase URL: ${supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'NOT SET'}`);
console.log(`[Server] Environment is set up.`);


// =================================================================
// 1. Static File Serving (for CSS, JS, etc. used by HTML pages)
// =================================================================
app.use(express.static(path.join(__dirname, 'public')));


// =================================================================
// 2. API Routes
// =================================================================
app.use('/api', apiRoutes);


// =================================================================
// 3. Frontend Routes (HTML Pages)
// =================================================================

// Helper function to inject config and serve HTML
const servePage = (pagePath, req, res) => {
    // __dirname refers to the directory of server.js (root directory)
    injectSupabaseConfig(pagePath, res, __dirname); 
};

// --- Authentication Pages ---
app.get('/login.html', (req, res) => servePage('public/login.html', req, res));
app.get('/update-password.html', (req, res) => servePage('public/update-password.html', req, res));

// --- Main Application Pages ---
// These pages will contain the client-side logic for the Cohort Manager
app.get('/', (req, res) => servePage('public/index.html', req, res));
app.get('/index.html', (req, res) => servePage('public/index.html', req, res));
app.get('/admin.html', (req, res) => servePage('public/admin.html', req, res));
app.get('/settings.html', (req, res) => servePage('public/settings.html', req, res));

// --- Catch-all for undefined routes ---
app.use((req, res) => {
    res.status(404).send('404 Not Found');
});

// =================================================================
// 4. Server Start
// =================================================================
app.listen(port, () => {
    console.log(`[Server] Cohort Manager backend running at http://localhost:${port}`);
});
