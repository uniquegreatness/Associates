function navigate(page) {
    const container = document.getElementById("app");

    fetch(`pages/${page}.html`)
        .then(res => res.text())
        .then(html => {
            container.innerHTML = html;
        })
        .catch(err => {
            container.innerHTML = "<p>Page not found</p>";
        });
}

// Load default page
navigate("home");
