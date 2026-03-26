// Application Status Toggle
// Reads SiteConfig and updates the page accordingly.
$(function () {
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
			btn.href = SiteConfig.formUrl;
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
			el.textContent = 'The 2026 application period has closed. Please check back next year for updated application information.';
		}
	});

	howToApply.forEach(function (el) {
		if (open) {
			el.innerHTML = 'Click the "Apply Now" button to complete your application online.';
		} else {
			el.innerHTML = 'The 2026 application period has closed. Please check back next year when applications reopen.';
		}
	});
});
