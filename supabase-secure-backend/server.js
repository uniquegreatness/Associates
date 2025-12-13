// server.js
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const apiRoutes = require('./routes/apiRoutes');
const { injectSupabaseConfig } = require('./utils/cohortUtils');
const { supabaseUrl } = require('./config/supabase'); 

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
// 3. Frontend Routes (HTML Pages - CORRECTED PATH)
// =================================================================

// Helper function to inject config and serve HTML
const servePage = (templateFileName, req, res) => {
    // templateFileName is the file in the root directory (e.g., 'index.html', 'login_template.html')
    // The injectSupabaseConfig function needs the file name and the base path (PROJECT_ROOT)
    injectSupabaseConfig(templateFileName, res, PROJECT_ROOT); 
};

// --- Main Application Pages ---
// We use the actual file names that exist in the root directory.
app.get('/', (req, res) => servePage('index.html', req, res));
app.get('/index.html', (req, res) => servePage('index.html', req, res));

// --- Authentication Pages (Using actual template names from the root) ---
app.get('/login.html', (req, res) => servePage('login_template.html', req, res));
app.get('/update-password.html', (req, res) => servePage('login_template.html', req, res)); 

// --- Other Utility/Admin Pages ---
app.get('/admin.html', (req, res) => servePage('admin.html', req, res));
app.get('/settings.html', (req, res) => servePage('settings.html', req, res)); 

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
