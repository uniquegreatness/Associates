// --- Supabase client ---
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const supabase = Supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Form submission ---
const form = document.getElementById('credentialsForm');

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!email || !password) {
        alert("Please fill all fields");
        return;
    }

    // --- Retrieve all signup info from localStorage ---
    const whatsappNumber = localStorage.getItem('signup_whatsappNumber');
    const fullName = localStorage.getItem('signup_fullName');
    const nickname = localStorage.getItem('signup_nickname');
    const age = localStorage.getItem('signup_age');
    const gender = localStorage.getItem('signup_gender');
    const country = localStorage.getItem('signup_country');
    const state = localStorage.getItem('signup_state');
    const city = localStorage.getItem('signup_city');
    const hobbies = JSON.parse(localStorage.getItem('signup_hobbies') || '[]');
    const services = JSON.parse(localStorage.getItem('signup_services') || '[]');
    const friends = JSON.parse(localStorage.getItem('signup_friends') || '[]');

    try {
        // --- Create Supabase Auth user ---
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password
        });

        if (authError) {
            alert("Error creating account: " + authError.message);
            return;
        }

        const userId = authData.user.id;

        // --- Insert user data into Supabase table ---
        const { error: insertError } = await supabase.from('users').insert([{
            id: userId,
            whatsapp_number: whatsappNumber,
            full_name: fullName,
            nickname: nickname,
            age: age,
            gender: gender,
            country: country,
            state: state,
            city: city,
            hobbies: hobbies,          // stored as JSON array
            services: services,        // stored as JSON array
            friends: friends           // stored as JSON array
        }]);

        if (insertError) {
            alert("Error saving user data: " + insertError.message);
            return;
        }

        // --- Clear localStorage ---
        localStorage.removeItem('signup_whatsappNumber');
        localStorage.removeItem('signup_fullName');
        localStorage.removeItem('signup_nickname');
        localStorage.removeItem('signup_age');
        localStorage.removeItem('signup_gender');
        localStorage.removeItem('signup_country');
        localStorage.removeItem('signup_state');
        localStorage.removeItem('signup_city');
        localStorage.removeItem('signup_hobbies');
        localStorage.removeItem('signup_services');
        localStorage.removeItem('signup_friends');

        // --- Redirect to dashboard ---
        window.location.href = 'dashboard.html';

    } catch (err) {
        console.error(err);
        alert("Unexpected error occurred.");
    }
});
