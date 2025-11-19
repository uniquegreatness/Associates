const sideMenu = document.getElementById('sideMenu');
const openBtn = document.getElementById('openSideMenu');
const closeBtn = document.getElementById('closeSideMenu');
const bottomButtonsContainer = document.getElementById('bottomButtons');
const circleBtn = document.getElementById('circleBtn');
const bottomButtons = document.getElementById('bottomButtons');

circleBtn.addEventListener('click', () => {
    const isOpen = !bottomButtons.classList.contains('hidden');

    if (isOpen) {
        // Hide bottom buttons
        bottomButtons.classList.add('hidden');
        // Move circle to left
        circleBtn.style.left = '20px';
        circleBtn.style.transform = 'translateX(0)';
        circleBtn.textContent = '☰'; // optional icon change
    } else {
        // Show bottom buttons
        bottomButtons.classList.remove('hidden');
        // Move circle back to middle
        circleBtn.style.left = '50%';
        circleBtn.style.transform = 'translateX(-50%)';
        circleBtn.textContent = '+'; // optional icon
    }
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
    { name: "Resellable", category: "bottom" }
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
