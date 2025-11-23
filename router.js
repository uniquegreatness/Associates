// router.js

// References
const pageContainer = document.getElementById('pageContainer');
const bottomUI = document.getElementById('bottomUI');
const bottomBar = document.getElementById('bottomBar').querySelector('span');
const dynamicActionBtn = document.getElementById('dynamic-action-btn');

// --- SPA LOAD FUNCTION ---
async function loadPage(pageName) {
    try {
        const response = await fetch(`${pageName}.html`);
        if (!response.ok) throw new Error(`Page '${pageName}' not found`);
        const html = await response.text();
        pageContainer.innerHTML = html;

        // Optionally handle page-specific logic
        handlePageScripts(pageName);

    } catch (err) {
        pageContainer.innerHTML = `<h2>Error loading page: ${pageName}</h2><p>${err}</p>`;
    }

    // Collapse bottom menu after loading a page
    bottomUI.classList.remove('active');
}

// --- OPTIONAL: PAGE-SPECIFIC SCRIPT HANDLING ---
function handlePageScripts(pageName) {
    // Example: show dynamic action button only on certain pages
    const pagesWithActionBtn = ['findr', 'opinions'];
    if (pagesWithActionBtn.includes(pageName)) {
        dynamicActionBtn.style.display = 'block';
    } else {
        dynamicActionBtn.style.display = 'none';
    }

    // You can also call page-specific JS functions here
    // e.g., initializeFindrPage() if pageName === 'findr'
}

// --- INITIAL PAGE LOAD ---
window.addEventListener('DOMContentLoaded', () => {
    loadPage('findr'); // default page
});
