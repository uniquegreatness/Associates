// server.js
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs/promises'); // <-- NEW: Import for file reading
const apiRoutes = require('./routes/apiRoutes');
// const { injectSupabaseConfig } = require('./utils/cohortUtils'); // <-- Removed dependency on external injector
const { supabaseUrl, supabaseAnonKey } = require('./config/supabase'); // <-- FIX: Added supabaseAnonKey import

const app = express();
const port = 3000;

// --- CRITICAL PATH FIX: Determine the project root directory ---
// Since server.js is inside 'supabase-secure-backend', and the HTML/static files 
// are in the parent directory (the repository root), we define the root path:
const PROJECT_ROOT = path.join(__dirname, '..');

console.log(`[Config] Resolved PROJECT_ROOT (for HTML/Static Files): ${PROJECT_ROOT}`);
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
// Serve static assets (CSS, JS, images, and the HTML files) from the PROJECT_ROOT
app.use(express.static(PROJECT_ROOT));


// =================================================================
// 2. API Routes
// =================================================================
app.use('/api', apiRoutes);


// =================================================================
// 3. Frontend Routes (HTML Pages - FIXED PATHS and INJECTION)
// =================================================================

/**
 * Reads an HTML template, injects Supabase config placeholders, and serves it.
 * @param {string} templateFileName The name of the HTML file (e.g., 'cohort_template.html').
 * @param {object} req The Express request object.
 * @param {object} res The Express response object.
 */
const servePage = async (templateFileName, req, res) => { // <-- Made ASYNC
    try {
        const filePath = path.join(PROJECT_ROOT, templateFileName);
        let htmlContent = await fs.readFile(filePath, 'utf-8'); // <-- Reads the file

        // CRITICAL FIX: Replace the placeholders with actual configuration values
        htmlContent = htmlContent.replace(
            '__SUPABASE_URL_INJECTION__', 
            supabaseUrl || 'ERROR_SUPABASE_URL_MISSING' // Use a fallback for clear debugging
        );
        htmlContent = htmlContent.replace(
            '__SUPABASE_ANON_KEY_INJECTION__', 
            supabaseAnonKey || 'ERROR_SUPABASE_ANON_KEY_MISSING'
        );

        res.type('html').send(htmlContent); // <-- Sends the fixed content

    } catch (error) {
        console.error(`Error serving ${templateFileName}:`, error);
        res.status(500).send(`Server Error: Could not load the required page (${templateFileName}). Check config/file paths.`);
    }
};

// --- Main Application Pages ---
app.get('/', async (req, res) => servePage('index.html', req, res));
app.get('/index.html', async (req, res) => servePage('index.html', req, res));

// --- NEW GROUPS DASHBOARD ROUTE ---
app.get('/groups.html', async (req, res) => servePage('groups.html', req, res)); // <<< NEW LINE ADDED

// --- Cohort & Dynamic Cluster View Routes (FIXED) ---
// Note: All routes calling servePage must now be async.
app.get('/cohort.html', async (req, res) => servePage('cohort_template.html', req, res));
app.get('/C_:clusterId', async (req, res) => servePage('cohort_template.html', req, res));

// --- Authentication Pages ---
app.get('/login.html', async (req, res) => servePage('login_template.html', req, res));
app.get('/update-password.html', async (req, res) => servePage('login_template.html', req, res)); 

// --- Other Utility/Admin Pages (FIXED) ---
app.get('/admin.html', async (req, res) => servePage('admin.html', req, res));
app.get('/settings.html', async (req, res) => servePage('settings.html', req, res)); 
app.get('/dashboard.html', async (req, res) => servePage('dashboard.html', req, res));

// --- LEADERBOARD FIX: Add route for leaderboard.html ---
app.get('/leaderboard.html', async (req, res) => servePage('leaderboard.html', req, res));


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

