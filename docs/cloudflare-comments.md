# Cloudflare Free and watch-page comments

## Findings and changes

Previously, the generated Cache Rules covered watch HTML but not comment API reads. Watch HTML also had no cache lifetime even though it carried the revision used to trust IndexedDB. A single watch-URL purge could not invalidate arbitrary history, preview, or reply URLs. The client had no independent shared freshness check, and query ordering varied between requests.

Purge operations also refresh their API client when CDN credentials are enabled, replaced, or cleared; they no longer depend on the worker startup configuration.

The integration now uses nine Cache Rules, within the Free plan's ten-rule limit. The comment rule respects explicit origin cache headers and bypasses responses without cache instructions. The final rule bypasses mutations, requests with Authorization, and explicit freshness checks. Complete query strings are preserved through the Standard caching level (`aggressive` in the API). No Workers, custom cache keys, cache tags, prefix purges, or paid topology features are required.

## Freshness contract

- `GET /videos/:videoId/comments/state` carries only database identity, video comment revision, and total count. Shared caches may retain it for 30 seconds. Successful watch HTML also has a 30-second shared lifetime.
- With CDN enabled, page initialization reads this state independently of the HTML. Comment interactions recheck state when its 30-second freshness window expires, including quote targets already in the DOM and direct comment navigation. The HTTP `Age` header reduces the remaining window; the browser does not add another full 30 seconds to an aged edge response. These checks are driven by interactions, not a background polling timer or automatic insertion of new rows.
- Explicit refresh requests `/state?fresh=1`, which bypasses Cloudflare and returns `no-store`. Subsequent changed data can still come from the CDN under the newly discovered revision. There is no random timestamp cache busting.
- History, quote lookups, backlink pages, and change batches include `epoch` and `revision` in their URLs. Successful reads are shared for up to one hour only when the requested identity and revision match before and after the read. A concurrent mutation, an outdated key, a missing record, or an error receives `no-store`.
- A post or administrative deletion purges the canonical watch URL and the canonical shared state URL together in the existing bounded purge batches. New state changes subsequent data URLs, so invalidating every cursor and quote variant is unnecessary. If purging fails, the state TTL bounds normal discovery; explicit refresh still checks the origin.
- Cached watch HTML or an older edge must not roll a newer tab backwards. Lower revisions and differing database identities are confirmed at the origin. Database replacement clears the old local cache even when comment IDs and revisions are reused.
- IndexedDB remains the durable client cache. Cached bodies and complete history ranges are reused; concurrent identical requests are coalesced. `knownIds` body exclusions remain in the query string and cache key, so one client's shortened response cannot be mistaken for another client's full response.
- HTTP browser retention is zero (`max-age=0`), while Cloudflare uses `s-maxage`. Normal reads may reflect the shared state's 30-second window; this is not an instantaneous live feed. A tab left idle reconciles at its next comment interaction or explicit refresh.

## Applying to an existing installation

Reapply **Configure Cloudflare CDN** through MoarTube Client after deploying the updated Node build. The existing configuration workflow installs the new rules and purges old cached responses once. A rebuild alone does not update a Cloudflare zone. Restart/reload Node workers so the new controllers and watch template are active. Existing IndexedDB content is reconciled without manually clearing browser storage.

The local integration is currently disabled, so no Cloudflare credentials or zone settings were changed during this work. Automated tests exercise real HTTP responses with an isolated SQLite database, plus a shared-cache simulator across independent browser caches. A real proxied-zone check should show `CF-Cache-Status: HIT` on repeated identical public reads, an increasing `Age`, and no hits for `/state?fresh=1` or comment mutations. Keep query-string caching enabled; unrelated administrator-created rules that override these settings can defeat the policy.

## Validation

The Node unit suite passes 2,800 tests with its required coverage. SQLite integration passes 55 tests, including real HTTP cache headers and comment mutations; PostgreSQL integration passes 52 tests. The full comment browser suite passed 339 checks across Chromium, Firefox, and WebKit, with further focused CDN cases covering aged state, concurrent refresh, reply pagination, storage fallback, and retained DOM targets. In the shared-cache fixture, a second independent browser cache fetched the tested history and quote preview with zero additional origin requests. These measurements are simulated-CDN results, not a live Cloudflare benchmark.

## Cloudflare references

- [Cache Rules availability and limits](https://developers.cloudflare.com/cache/how-to/cache-rules/)
- [Origin cache control, s-maxage, and revalidation](https://developers.cloudflare.com/cache/concepts/cache-control/)
- [Cache Rule settings](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/)
- [Caching levels and API names](https://developers.cloudflare.com/cache/how-to/set-caching-levels/)
- [Tiered Cache and Smart Topology availability](https://developers.cloudflare.com/cache/how-to/tiered-cache/)
