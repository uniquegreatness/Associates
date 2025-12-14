/* Define the primary color palette based on a bright blue */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
:root {
    --primary-blue: #3b82f6; /* Tailwind blue-500 */
    --light-blue: #eff6ff; /* Tailwind blue-50 */
}
body {
    font-family: 'Inter', sans-serif;
    background-color: var(--light-blue);
    color: #1f2937; /* Dark text for high contrast */
}
.card {
    transition: all 0.3s ease;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
    border: 1px solid #e5e7eb;
}
.card:hover {
    transform: translateY(-4px);
    box-shadow: 0 10px 15px rgba(59, 130, 246, 0.15);
}
/* Style for highlighted referral card */
.card-highlight {
    border: 2px solid #f59e0b; /* Amber/Yellow border */
    transform: scale(1.02);
    box-shadow: 0 10px 25px rgba(245, 158, 11, 0.3);
}
.join-btn {
    background-color: var(--primary-blue);
    transition: background-color 0.2s ease;
}
.join-btn:hover {
    background-color: #2563eb; /* Tailwind blue-600 */
}
.full-btn {
    background-color: #6b7280; /* Tailwind gray-500 */
    cursor: not-allowed;
    opacity: 0.8;
}
.login-prompt-btn {
    background-color: #f59e0b; /* Tailwind amber-500 */
    transition: background-color 0.2s ease;
}
.login-prompt-btn:hover {
     background-color: #d97706; /* Tailwind amber-600 */
}
/* Ensure the clamp works for card descriptions */
.line-clamp-3 {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;  
    overflow: hidden;
}
.download-btn {
    background-color: #10b981; /* Tailwind emerald-500 */
    transition: background-color 0.2s ease;
}
.download-btn:hover {
    background-color: #059669; /* Tailwind emerald-600 */
}

/* --- NEW STYLES FOR REDUCED BUTTONS AND STATS --- */
.member-actions-full {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}
.connection-stats-text {
    /* Maximize space for the text */
    flex-grow: 1;
    font-size: 0.875rem; /* text-sm */
    line-height: 1.25rem;
    font-weight: 600; /* semi-bold */
    color: #1f2937; /* text-gray-800 */
}
.action-icon-btn {
    /* Icon-only button styles */
    width: 40px; /* Fixed size */
    height: 40px;
    padding: 0;
    border-radius: 9999px; /* Fully rounded */
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0; /* Prevents text from shrinking the button */
    transition: background-color 0.2s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.share-btn-icon { background-color: #f59e0b; color: white; }
.share-btn-icon:hover { background-color: #d97706; }
.stats-btn-icon { background-color: #3b82f6; color: white; }
.stats-btn-icon:hover { background-color: #2563eb; }

/* New style for downloaded state button */
.downloaded-btn {
    background-color: #9ca3af; /* Tailwind gray-400 */
    cursor: not-allowed;
    color: #ffffff;
    font-weight: 600;
}
/* --- END NEW STYLES --- */

/* Styling for the popularity tags in the stats modal */
.popularity-tag {
    padding: 2px 6px;
    border-radius: 9999px; /* Full rounded corners */
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    margin-left: 8px;
}
.pop-most { background-color: #d1fae5; color: #065f46; } /* Green */
.pop-avg { background-color: #fef3c7; color: #b45309; } /* Amber */
.pop-less { background-color: #fee2e2; color: #991b1b; } /* Red */

/* --- NEW STYLES FOR BLINKING DOWNLOAD BUTTON --- */
@keyframes blink-highlight {
    0%, 100% { 
        background-color: #f59e0b; /* Amber 500 */
        box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); /* Subtle glow start */
    }
    50% { 
        background-color: #ef4444; /* Red 500 */
        box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); /* Glow expands and fades */
    }
}
.download-vcf-urgent {
    animation: blink-highlight 1.5s infinite;
    border: 2px solid #f59e0b; /* Initial highlight border */
    color: white !important;
}
/* --- END BLINKING STYLES --- */
