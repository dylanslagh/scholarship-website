import type { Env } from "./lib/env";

// Keep every non-production host out of search results.
//
// Cloudflare sends `X-Robots-Tag: noindex` on *.pages.dev preview URLs, but NOT
// on a custom domain attached to a branch — so preview.andresen-scholarships.org
// would otherwise be crawlable duplicate content of the live site. Matching on
// the hostname covers the staging domain, branch aliases, and localhost at once,
// and needs no per-environment config.
const PRODUCTION_HOSTS = ["andresen-scholarships.org", "www.andresen-scholarships.org"];

export const onRequest: PagesFunction<Env> = async (context) => {
  const response = await context.next();
  const host = new URL(context.request.url).hostname;
  if (PRODUCTION_HOSTS.includes(host)) return response;

  // Copy the response so the header is mutable (Pages' asset responses are not).
  const tagged = new Response(response.body, response);
  tagged.headers.set("X-Robots-Tag", "noindex, nofollow");
  return tagged;
};
