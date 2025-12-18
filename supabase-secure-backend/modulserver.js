const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs/promises');
const apiRoutes = require('./routes/apiRoutes');
const { supabaseUrl, supabaseAnonKey } = require('./config/supabase');

const app = express();
const port = 3000;

// --- CRITICAL PATH FIX: Determine the project root directory ---
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
// 1. Static File Serving: Modular HTML Fragments (CRITICAL FIX)
// =================================================================
// This handler ensures that simple, non-injected HTML files (like our components) 
// are served reliably, bypassing potential conflicts with custom routes.
app.get('/*.html', async (req, res, next) => {
    const fileName = path.basename(req.path);
    
    // List of files that need server-side INJECTION (handled by servePage later)
    const injectedFiles = [
        'index.html', 'groups.html', 'cohort_template.html', 'login_template.html',
        'update-password.html', 'admin.html', 'settings.html', 'dashboard.html',
        'leaderboard.html'
    ];
    
    // If the file is one of the main pages that requires config injection, skip this handler
    if (injectedFiles.includes(fileName)) {
        return next();
    }
    
    // If it's a modular component (like nav-buttons.html or create-group-form.html)
    try {
        const filePath = path.join(PROJECT_ROOT, fileName);
        await fs.access(filePath); // Check if file exists
        
        // Serve the raw HTML file content directly
        res.sendFile(filePath);
        console.log(`[Server] Served modular component: ${fileName}`);
    } catch (error) {
        // If file not found, pass to the next middleware (express.static)
        if (error.code === 'ENOENT') {
            return next();
        }
        console.error(`Error serving modular HTML fragment ${fileName}:`, error);
        res.status(500).send(`Server Error serving component: ${fileName}`);
    }
});

// =================================================================
// 1. Static File Serving: General Assets
// =================================================================
// Serve all general static assets (CSS, JS, images, etc.) from the PROJECT_ROOT
app.use(express.static(PROJECT_ROOT));


// =================================================================
// 2. API Routes
// =================================================================
app.use('/api', apiRoutes);


// =================================================================
// 3. Frontend Routes (HTML Pages with SUPABASE INJECTION)
// =================================================================

/**
 * Reads an HTML template, injects Supabase config placeholders, and serves it.
 * @param {string} templateFileName The name of the HTML file (e.g., 'cohort_template.html').
 * @param {object} req The Express request object.
 * @param {object} res The Express response object.
 */
const servePage = async (templateFileName, req, res) => {
    try {
        const filePath = path.join(PROJECT_ROOT, templateFileName);
        let htmlContent = await fs.readFile(filePath, 'utf-8');

        // Replace the placeholders with actual configuration values
        htmlContent = htmlContent.replace(
            '__SUPABASE_URL_INJECTION__', 
            supabaseUrl || 'ERROR_SUPABASE_URL_MISSING'
        );
        htmlContent = htmlContent.replace(
            '__SUPABASE_ANON_KEY_INJECTION__', 
            supabaseAnonKey || 'ERROR_SUPABASE_ANON_KEY_MISSING'
        );

        res.type('html').send(htmlContent);

    } catch (error) {
        console.error(`Error serving ${templateFileName}:`, error);
        res.status(500).send(`Server Error: Could not load the required page (${templateFileName}). Check config/file paths.`);
    }
};

// --- Main Application Pages ---
app.get('/', async (req, res) => servePage('index.html', req, res));
app.get('/index.html', async (req, res) => servePage('index.html', req, res));
app.get('/groups.html', async (req, res) => servePage('groups.html', req, res));
app.get('/cohort.html', async (req, res) => servePage('cohort_template.html', req, res));
app.get('/C_:clusterId', async (req, res) => servePage('cohort_template.html', req, res));
app.get('/login.html', async (req, res) => servePage('login_template.html', req, res));
app.get('/update-password.html', async (req, res) => servePage('login_template.html', req, res)); 
app.get('/admin.html', async (req, res) => servePage('admin.html', req, res));
app.get('/settings.html', async (req, res) => servePage('settings.html', req, res)); 
app.get('/dashboard.html', async (req, res) => servePage('dashboard.html', req, res));
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
