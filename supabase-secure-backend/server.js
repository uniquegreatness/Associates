// server.js
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const apiRoutes = require('./routes/apiRoutes');
const { injectSupabaseConfig } = require('./utils/cohortUtils');
const { supabaseUrl } = require('./config/supabase'); 

const app = express();
const port = 3000;

// --- CRITICAL PATH FIX: Determine the correct base directory ---
// The execution environment often runs Node from the repository root (e.g., /opt/render/project/src).
// We must explicitly ensure our BASE_DIR points to the subdirectory where the files are located.
// We assume server.js is inside 'supabase-secure-backend'.
const SUBDIRECTORY_NAME = 'supabase-secure-backend';

// If __dirname already ends with the subdirectory name, it is correct.
// If not, we assume __dirname is the root and append the subdirectory name.
const BASE_DIR = path.basename(__dirname) === SUBDIRECTORY_NAME 
    ? __dirname 
    : path.join(__dirname, SUBDIRECTORY_NAME);

console.log(`[Config] Resolved BASE_DIR: ${BASE_DIR}`);
// ----------------------------------------------------------------

// Middleware Setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Log basic configuration info
console.log(`[Config] Supabase URL: ${supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'NOT SET'}`);
console.log(`[Server] Environment is set up.`);


// =================================================================
// 1. Static File Serving (CORRECTED PATH)
// =================================================================
// Now uses BASE_DIR to correctly point to /supabase-secure-backend/public
app.use(express.static(path.join(BASE_DIR, 'public')));


// =================================================================
// 2. API Routes
// =================================================================
app.use('/api', apiRoutes);


// =================================================================
// 3. Frontend Routes (HTML Pages - CORRECTED PATH)
// =================================================================

// Helper function to inject config and serve HTML
const servePage = (pagePath, req, res) => {
    // Pass the corrected BASE_DIR to the injection function
    injectSupabaseConfig(pagePath, res, BASE_DIR); 
};

// --- Authentication Pages ---
app.get('/login.html', (req, res) => servePage('public/login.html', req, res));
app.get('/update-password.html', (req, res) => servePage('public/update-password.html', req, res));

// --- Main Application Pages ---
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
