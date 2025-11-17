// Map 1.1 - Landing Page JS with Country Picker
document.addEventListener("DOMContentLoaded", function() {
    const landingForm = document.getElementById("landingForm");

    // Initialize intl-tel-input
    const whatsappInput = document.querySelector("#whatsapp");
    const iti = window.intlTelInput(whatsappInput, {
        initialCountry: "auto",
        geoIpLookup: function(callback) {
            fetch("https://ipinfo.io/json?token=904952d10edf9e")
                .then(resp => resp.json())
                .then(data => callback(data.country))
                .catch(() => callback("NG")); // fallback Nigeria
        },
        separateDialCode: true,
        utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.19/js/utils.js",
    });

    landingForm.addEventListener("submit", function(e) {
        e.preventDefault();

        // Get full number including country code
        const fullNumber = iti.getNumber();

        // For now: simple alert
        alert("Form submitted! Number: " + fullNumber);

        // Future: redirect to next page
        // window.location.href = "page2.html";
    });
});
