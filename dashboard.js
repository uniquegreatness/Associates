const sideMenu = document.getElementById('sideMenu');
const openBtn = document.getElementById('openSideMenu');
const closeBtn = document.getElementById('closeSideMenu');
const bottomButtonsContainer = document.getElementById('bottomButtons');
const circleBtn = document.getElementById('circleBtn');

// Circle button click behavior
circleBtn.addEventListener('click', () => {
    // Shrink circle
    circleBtn.style.transform = 'scale(0.5)';

    // Hide bottom bar and bottom buttons
    document.getElementById('bottomBar').style.display = 'none';
    bottomButtons.classList.add('visible');
    bottomButtons.style.opacity = '1';
});


// Define all buttons and their categories
let buttons = [
    { name: "Profile", category: "side" },
    { name: "Download Contacts", category: "side" },
    { name: "Undefined1", category: "side" },
    { name: "Undefined2", category: "side" },
    { name: "Public Opinion", category: "bottom" },
    { name: "Mentors", category: "bottom" },
    { name: "RS AI", category: "bottom" },
    { name: "Resellable", category: "bottom" },
    { name: "Public", category: "bottom" } // <-- added
];

// Function to render buttons
function renderButtons() {
    // Clear current buttons
    sideMenu.querySelectorAll('.side-btn:not(.close-btn)').forEach(btn => btn.remove());
    bottomButtonsContainer.innerHTML = '';

    // Render buttons based on category
    buttons.forEach(btn => {
        if (btn.category === 'side') {
            const button = document.createElement('button');
            button.className = 'side-btn';
            button.textContent = btn.name;
            button.dataset.name = btn.name;
            button.addEventListener('click', () => alert(`Side button clicked: ${btn.name}`));
            sideMenu.appendChild(button);
        } else if (btn.category === 'bottom') {
            const button = document.createElement('button');
            button.className = 'bottom-btn';
            button.textContent = btn.name;
            button.dataset.name = btn.name;
            button.addEventListener('click', () => alert(`Bottom button clicked: ${btn.name}`));
            bottomButtonsContainer.appendChild(button);
        }
    });
}

// Initial render
renderButtons();

// Open and close side menu
openBtn.addEventListener('click', () => sideMenu.style.width = '250px');
closeBtn.addEventListener('click', () => sideMenu.style.width = '0');

// Example: Switch "Profile" to bottom dynamically after 3 seconds
// setTimeout(() => {
//     buttons.find(b => b.name === "Profile").category = "bottom";
//     renderButtons();
// }, 3000);

// SPA container
const contentContainer = document.getElementById('streetsPageContainer');

// Function to load Streets page content dynamically
function loadStreetsPage(){
    fetch('streets.html') // your Streets page HTML file
        .then(res => res.text())
        .then(html => {
            contentContainer.innerHTML = html;
            // load the Streets JS after inserting HTML
            const script = document.createElement('script');
            script.src = 'streets.js';
            document.body.appendChild(script);
        });
}

// Function to load any page dynamically into the dashboard
function loadPage(pageName) {
    let url = '';
    if(pageName === 'Public Opinion') url = 'streets.html';
    // Add more pages here later if needed

    if(!url) return;

    fetch(url)
        .then(res => res.text())
        .then(html => {
            contentContainer.innerHTML = html;

            // Load the page-specific JS if needed
            const script = document.createElement('script');
            script.src = pageName === 'Public Opinion' ? 'streets.js' : '';
            document.body.appendChild(script);

            // Hide the button of the currently loaded page
            bottomButtons.querySelectorAll('.bottom-btn').forEach(btn => {
                btn.style.display = btn.dataset.name === pageName ? 'none' : 'inline-block';
            });
        });
}

// Load Streets page by default on dashboard
loadPage('Public Opinion');

// Optional: if you want bottom buttons later to load other content inside this same container,
// you can add event listeners like this:
const bottomBtns = document.querySelectorAll('.bottom-btn');
bottomBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        if(name === 'Public Opinion'){ loadStreetsPage(); }
        // add other conditional renders for other buttons here
    });
});
