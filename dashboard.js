const bottomUI = document.getElementById('bottomUI');
const circleTrigger = document.getElementById('circleTrigger');
const mainContent = document.getElementById('mainContent');
const pageContainer = document.getElementById('pageContainer');
const sidebar = document.getElementById('sidebar');
const appContainer = document.querySelector('.app-container');
const bottomButtons = document.querySelectorAll('.float-btn');

// Mock Content for pages
const pages = {
    page1: "<h1>Page 1</h1><p>Analysis content goes here.</p><div style='height:200vh; background:#eef'>Long content...</div>",
    page2: "<h1>Page 2</h1><p>User Settings content goes here.</p><div style='height:200vh; background:#ffe'>Long content...</div>",
    page3: "<h1>Page 3</h1><p>Reports content goes here.</p><div style='height:200vh; background:#efe'>Long content...</div>",
    page4: "<h1>Page 4</h1><p>Help & Support content goes here.</p><div style='height:200vh; background:#fef'>Long content...</div>"
};

// 1. Toggle Bottom Interaction
circleTrigger.addEventListener('click', () => {
    bottomUI.classList.toggle('active');
});

// 2. Handle Bottom Button Clicks
bottomButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const target = btn.getAttribute('data-target');
        
        // Render Content
        pageContainer.innerHTML = pages[target];

        // Manage Buttons (The "Disappear and Rearrange" logic)
        bottomButtons.forEach(b => b.classList.remove('active-page-btn'));
        btn.classList.add('active-page-btn');

        // Optional: Reset the view to top when page changes
        mainContent.scrollTop = 0; 
        
        // Keep the menu open? Or close it? 
        // The prompt implies behaviors repeat on click, but usually opening a page closes the menu.
        // If you want it to stay open, do nothing. If you want it to close:
        // bottomUI.classList.remove('active');
    });
});

// 3. Scroll Logic (Reset UI)
mainContent.addEventListener('scroll', () => {
    // Only trigger if we have scrolled a bit and the menu is currently open
    if (mainContent.scrollTop > 10 && bottomUI.classList.contains('active')) {
        bottomUI.classList.remove('active');
    }
});

// 4. Sidebar Logic
function toggleSidebar() {
    appContainer.classList.toggle('sidebar-collapsed');
}
