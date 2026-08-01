// Site Configuration
// These are the *instant* defaults used to paint the page before anything is
// fetched, so they must match production — production is what an applicant sees
// first. The authoritative value comes from the server (APPLICATIONS_OPEN in
// wrangler.toml, set per environment) via SiteConfig.load() below. That is what
// lets the preview site show an open form while the live site stays closed,
// without a client-side flag that could be merged to production by accident.
var SiteConfig = {
	applicationsOpen: false, // closed until the 2027 season opens; mirror APPLICATIONS_OPEN in wrangler.toml
	deadline: "Saturday, March 13, 2027",
	formUrl: "apply.html"
};

// Ask the server for the real open/closed state, then hand it to `cb` — only if
// it differs from what the page already painted, so the common case is a no-op.
// If the request fails (offline, or the file opened straight from disk), the
// static defaults above stand.
SiteConfig.load = function (cb) {
	fetch("/api/config", { headers: { accept: "application/json" } })
		.then(function (r) { return r.ok ? r.json() : null; })
		.then(function (cfg) {
			if (!cfg || typeof cfg.applicationsOpen !== "boolean") return;
			var changed = cfg.applicationsOpen !== SiteConfig.applicationsOpen;
			SiteConfig.applicationsOpen = cfg.applicationsOpen;
			if (cfg.deadline) SiteConfig.deadline = cfg.deadline;
			if (changed) cb(SiteConfig);
		})
		.catch(function () { /* keep the static defaults */ });
};
