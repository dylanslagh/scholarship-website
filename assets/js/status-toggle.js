// Application Status Toggle
// Reads SiteConfig and updates apply buttons / notices across the site.
// (Vanilla JS — the redesigned pages no longer load jQuery.)
document.addEventListener('DOMContentLoaded', function () {
	var open = SiteConfig.applicationsOpen;
	var notice = document.getElementById('application-notice');
	var buttons = document.querySelectorAll('.apply-button');
	var sidebarTexts = document.querySelectorAll('.apply-sidebar-text');
	var howToApply = document.querySelectorAll('.how-to-apply-text');

	if (notice) {
		notice.style.display = open ? 'none' : 'block';
	}

	buttons.forEach(function (btn) {
		if (open) {
			// A button may carry its own deep link (e.g. apply.html?scholarship=ag).
			btn.href = btn.getAttribute('data-apply-href') || SiteConfig.formUrl;
			btn.classList.remove('disabled');
			btn.removeAttribute('aria-disabled');
			btn.textContent = 'Apply Now';
		} else {
			btn.removeAttribute('href');
			btn.classList.add('disabled');
			btn.setAttribute('aria-disabled', 'true');
			btn.textContent = 'Applications Closed';
		}
	});

	sidebarTexts.forEach(function (el) {
		if (open) {
			el.textContent = el.getAttribute('data-open-text');
		} else {
			el.textContent = 'The application period is currently closed. Please check back next year for updated application information.';
		}
	});

	howToApply.forEach(function (el) {
		if (open) {
			el.textContent = 'Click the "Apply Now" button to complete your application online.';
		} else {
			el.textContent = 'The application period has closed. Please check back next year when applications reopen.';
		}
	});
});
