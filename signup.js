// --- Initialize WhatsApp input with intl-tel-input ---
const input = document.querySelector("#whatsappNumber");
const iti = window.intlTelInput(input, {
    initialCountry: "auto",
    geoIpLookup: function(success, failure) {
        fetch('https://ipinfo.io/json?token=904952d10edf9e')
        .then(resp => resp.json())
        .then(resp => success(resp.country))
        .catch(() => success("us"));
    },
    utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.19/js/utils.js"
});

// --- Age Options ---
const ageSelect = document.getElementById('age');
for (let i = 18; i <= 100; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.text = i;
    ageSelect.appendChild(option);
}

// --- Country/State/City ---
const countrySelect = document.getElementById('country');
const stateSelect = document.getElementById('state');
const citySelect = document.getElementById('city');

const locationData = {
    "Nigeria": { "Lagos": ["Ikeja", "Epe", "Ikorodu"], "Abuja": ["Garki", "Wuse", "Maitama"] },
    "United States": { "California": ["Los Angeles", "San Francisco", "San Diego"], "Texas": ["Houston", "Dallas", "Austin"] }
};

Object.keys(locationData).forEach(country => {
    const option = document.createElement('option');
    option.value = country;
    option.text = country;
    countrySelect.appendChild(option);
});

countrySelect.addEventListener('change', () => {
    stateSelect.innerHTML = '<option value="">Select State</option>';
    citySelect.innerHTML = '<option value="">Select City</option>';
    const states = Object.keys(locationData[countrySelect.value] || {});
    states.forEach(state => {
        const option = document.createElement('option');
        option.value = state;
        option.text = state;
        stateSelect.appendChild(option);
    });
});

stateSelect.addEventListener('change', () => {
    citySelect.innerHTML = '<option value="">Select City</option>';
    const cities = locationData[countrySelect.value]?.[stateSelect.value] || [];
    cities.forEach(city => {
        const option = document.createElement('option');
        option.value = city;
        option.text = city;
        citySelect.appendChild(option);
    });
});

// --- Hobbies/Interests Tags ---
const hobbiesContainer = document.getElementById('hobbiesContainer');
const selectedHobbies = new Set();
const hobbiesList = [
    "Personal","Fitness","Health","Wellness","Fashion","Beauty","Travel","Photography",
    "Music","Movies","Television","Gaming","Art","Crafts","Technology","Coding",
    "Science","Mathematics","Reading","Writing","Blogging","Vlogging","Food","Cooking",
    "Baking","Gardening","Home Decor","Pets","Animals","Adventure","Sports","Football",
    "Basketball","Tennis","Yoga","Meditation","Spirituality","Religion","Politics",
    "Current Events","Finance","Investing","Cryptocurrency","Business","Entrepreneurship",
    "Marketing","Social Media","Memes","Quotes","Motivation","Lifestyle","Education",
    "Languages","Culture","History","Volunteering","Community","Networking","Events",
    "Cars","Motorcycles","Boating","Hiking","Camping","Fitness Challenges","Collectibles",
    "Board Games","Puzzles","Science Fiction","Fantasy","Comedy","Drama","Romance",
    "Action","Documentaries","Nature","Environment","DIY Projects","Shopping",
    "Luxury","Minimalism","Self-improvement","Meditation","Journaling","Adventure Sports",
    "Photography","Videography","Street Art","Museums","Exhibitions"
];
hobbiesList.forEach(hobby => {
    const tag = document.createElement('span');
    tag.innerText = hobby;
    tag.addEventListener('click', () => {
        if (selectedHobbies.has(hobby)) selectedHobbies.delete(hobby);
        else selectedHobbies.add(hobby);
    });
    hobbiesContainer.appendChild(tag);
});

// --- RECOMMEND ME TO CUSTOMERS ---
const customersContainer = document.getElementById('customersContainer');
const servicesList = [
    "Shoes","Fruits & Vegetables","Beverages","Fashion Accessories","Catering",
    "Hair/Beauty Services","Event Planning","Logistics","Tutoring / Lessons",
    "Therapy / Counseling","Electronics","Printing / Design Services",
    "Fitness / Personal Training","Other"
];
const selectedServices = new Set();
servicesList.forEach(service => {
    const tag = document.createElement('span');
    tag.innerText = service;
    tag.addEventListener('click', () => {
        if (selectedServices.has(service)) selectedServices.delete(service);
        else selectedServices.add(service);
    });
    customersContainer.appendChild(tag);
});

// --- RECOMMEND ME TO FRIENDS ---
const friendsContainer = document.getElementById('friendsContainer');
const friendsList = [
    "Marriage / Godly Relationship","Business Purposes","Learning / Education",
    "Religious Purposes","Friendship / Networking","Sports / Team Activities",
    "Events / Celebrations","Travel / Tours","Health / Wellness",
    "Evangelism Purposes","Other"
];
const selectedFriends = new Set();
friendsList.forEach(reason => {
    const tag = document.createElement('span');
    tag.innerText = reason;
    tag.addEventListener('click', () => {
        if (selectedFriends.has(reason)) selectedFriends.delete(reason);
        else selectedFriends.add(reason);
    });
    friendsContainer.appendChild(tag);
});

// --- Form Submission ---
const form = document.getElementById('signupForm');
form.addEventListener('submit', function(e) {
    e.preventDefault();

    // --- Collect all form values ---
    const whatsappNumber = document.getElementById('whatsappNumber').value.trim();
    const fullName = document.getElementById('fullname').value.trim();
    const nickname = document.getElementById('nickname').value.trim();
    const age = document.getElementById('age').value;
    const gender = document.getElementById('gender').value;
    const country = document.getElementById('country').value;
    const state = document.getElementById('state').value;
    const city = document.getElementById('city').value;

    // --- Collect selected hobbies ---
    const selectedHobbiesArray = Array.from(selectedHobbies);

    // --- Collect selected services (Recommend Me To Customers) ---
    const selectedServicesArray = Array.from(selectedServices);

    // --- Collect selected friends reasons (Recommend Me To Nearby Friends) ---
    const selectedFriendsArray = Array.from(selectedFriends);

    // --- Save all info temporarily to localStorage ---
    localStorage.setItem('signup_whatsappNumber', whatsappNumber);
    localStorage.setItem('signup_fullName', fullName);
    localStorage.setItem('signup_nickname', nickname);
    localStorage.setItem('signup_age', age);
    localStorage.setItem('signup_gender', gender);
    localStorage.setItem('signup_country', country);
    localStorage.setItem('signup_state', state);
    localStorage.setItem('signup_city', city);
    localStorage.setItem('signup_hobbies', JSON.stringify(selectedHobbiesArray));
    localStorage.setItem('signup_services', JSON.stringify(selectedServicesArray));
    localStorage.setItem('signup_friends', JSON.stringify(selectedFriendsArray));

    // --- Redirect to email/password page ---
    window.location.href = 'signup_credentials.html';
});
