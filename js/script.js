// Map 1.1 - Landing Page JS
document.addEventListener("DOMContentLoaded", function() {
    const landingForm = document.getElementById("landingForm");

    landingForm.addEventListener("submit", function(e) {
        e.preventDefault();

        // For now: simple alert to simulate moving to next page
        alert("Form submitted! You will go to the next page (Map 2.0).");

        // Future: redirect to page2.html
        // window.location.href = "page2.html";
    });
});
