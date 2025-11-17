// Associates - landing page interactions (Map 1.2)
document.addEventListener("DOMContentLoaded", () => {
  // Nav toggle for mobile
  const navToggle = document.getElementById("navToggle");
  navToggle?.addEventListener("click", () => {
    const navLinks = document.querySelector(".nav-links");
    if (navLinks) navLinks.style.display = navLinks.style.display === "flex" ? "none" : "flex";
  });

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener("click", (e) => {
      const href = a.getAttribute("href");
      if (href === "#" || href === "") return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  // Quick form submit (front-end only for now)
  const quickForm = document.getElementById("quickForm");
  quickForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    // Validate minimal fields
    const phone = document.getElementById("qPhone")?.value?.trim();
    const nick = document.getElementById("qNickname")?.value?.trim();
    if (!phone || !nick) {
      alert("Please enter your WhatsApp number and display name to continue.");
      return;
    }
    // Save to local storage for now (will connect to Supabase later)
    localStorage.setItem("assoc_qPhone", phone);
    localStorage.setItem("assoc_qNickname", nick);
    alert("Saved. Next you will choose interests and download contacts (functionality coming soon).");
    // future: redirect to page2.html
    // window.location.href = "page2.html";
  });

  // Download buttons: go to #download section or later vcf page
  const downloadMain = document.getElementById("downloadMain");
  const downloadTop = document.getElementById("downloadTop");
  const ctaDownload = document.getElementById("ctaDownload");

  function goDownload() {
    // When backend ready we'll route to vcf.html, for now scroll
    const v = document.getElementById("download");
    if (v) v.scrollIntoView({behavior: "smooth", block: "center"});
  }
  downloadMain?.addEventListener("click", goDownload);
  downloadTop?.addEventListener("click", () => {
    // small delay for sticky nav
    setTimeout(goDownload, 50);
  });
  ctaDownload?.addEventListener("click", (e) => {
    e.preventDefault();
    goDownload();
  });

});
