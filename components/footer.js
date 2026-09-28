// Shared Footer Component for Loomi
// Include this script at the end of your HTML body

function renderFooter() {
    const footer = document.getElementById('shared-footer');
    if (!footer) return;

    footer.innerHTML = `
        <p><img src="./favicon-32x32.png" alt="Loomi"> Screen-free bedtime stories for young children.</p>
        <p style="margin-top: 10px; font-size: 14px;">&copy; 2025 Loomi. Built with ❤️ by 3 brothers and dads for parents seeking peaceful bedtimes.</p>
        <div class="footer-links">
            <a href="./privacy.html">Privacy Policy</a>
            <a href="./terms.html">Terms of Service</a>
            <a href="./support.html">Support</a>
        </div>
    `;
}

// Auto-render when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderFooter);
} else {
    renderFooter();
}
