document.addEventListener("DOMContentLoaded", function() {
    const landingForm = document.getElementById("landingForm");
    const whatsappInput = document.querySelector("#whatsapp");

    if (!whatsappInput) return;

    const iti = window.intlTelInput(whatsappInput, {
        initialCountry: "auto",
        geoIpLookup: function(callback) {
            fetch("https://ipinfo.io/json?token=904952d10edf9e")
                .then(resp => resp.json())
                .then(data => {
                    const countryCode = data && data.country ? data.country : "NG";
                    callback(countryCode);
                })
                .catch(() => callback("NG"));
        },
        // Removed separateDialCode to keep placeholder visible
        utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.19/js/utils.js",
    });

    landingForm.addEventListener("submit", function(e) {
        e.preventDefault();
        const fullNumber = iti.getNumber();
        alert("Form submitted! Number: " + fullNumber);
    });
});
