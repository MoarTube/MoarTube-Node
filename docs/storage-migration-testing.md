# Storage migration playback tests

Run from the MoarTube-Node repository in PowerShell:

```powershell
$env:MOARTUBE_TEST_HLS = '1'
$env:MOARTUBE_FFMPEG = 'C:\path\to\ffmpeg.exe'
$env:MOARTUBE_OPENSSL = 'C:\path\to\openssl.exe'
npx.cmd vitest run tests/unit/services/storage-migration-roundtrip.test.ts tests/unit/services/storage-migration.test.ts tests/unit/validators/schemas/storage-config.test.ts --coverage.enabled=false
```

FFmpeg must support H.264 and AAC encoding/decoding. OpenSSL generates the local
TLS fixtures' temporary self-signed certificates. Docker must be available for
the repository's disposable Silo S3 server (or supply the existing Silo test
connection variables used by `tests/support/silo-global.mjs`). The playback suite
is opt-in so routine unit runs do not require FFmpeg; when enabled, missing tools
or unsuccessful playback fail the tests.

Each scenario tests the initial source, then migrates, switches storage through
the authenticated production settings routes, and plays the destination. It then
migrates back, switches storage again, and plays the original destination:

- Filesystem -> S3 -> filesystem.
- S3 A -> S3 B -> S3 A.
- S3 -> filesystem -> S3.

The matrix uses the fresh relative-playlist format; no legacy URL conversion is exercised. Each
video has two H.264/AAC HLS renditions. Playback fetches master playlists,
rendition playlists, and segments over HTTP/HTTPS using the actual filesystem serving
routes or anonymous S3 reads. FFmpeg decodes the master and both renditions;
decoded audio/video frame hashes must match the initial playback.

Viewer reads from inactive stores are rejected even though source data remains.
Before each migration, all matching destination files are overwritten with stale
test data to ensure retained originals cannot conceal a missed copy. The tests
also verify unchanged source bytes, byte-for-byte copying before switching, and
unchanged playlist bytes at the destination after switching. Public-URL changes are also exercised without rewriting media files or creating origin-history files.

Direct S3 cases cover both path-style and virtual-host style, including all four
addressing combinations for S3-to-S3 round trips. The disposable Silo server uses
`MINIO_DOMAIN=localhost`; when supplying an external Silo test endpoint, configure
the same domain. DNS overrides for `*.localhost` and the FFmpeg forward proxy
exist only inside the isolated test process.

Additional cases cover unpublished outputs and retained terminal recording
snapshots. CDN cases exercise both filesystem-to-S3 and S3-to-filesystem round
trips using the production URL builder and CDN configuration validation. A local
HTTPS reverse proxy stands in for CDN delivery. Native AWS SDK transport in
these cases is redirected to real disposable Silo storage. Cloudflare account,
DNS, and purge operations are stubs; no Cloudflare or AWS account is contacted.
These fixtures verify URL resolution and delivery, not live Cloudflare edge
caching or a deployed tunnel.

Media, temporary directories, S3 requests, storage operations, settings handlers,
URL construction, HTTP serving, and decoding are real. The
video repository and settings persistence use isolated test state. No application
data or configured user stores are used.

## Repeated round trips with network changes

The decoder suite runs five round trips per configuration by default. Each of
the eight filesystem/S3 and path-style/virtual-host combinations runs in three
transport modes: HTTP, HTTPS terminated by a public reverse proxy, and native
Node HTTPS. The 24 repeated cases perform 120 round trips (240 migrations), in
addition to the ordinary 13-case matrix: 133 round trips and 266 migrations.

At checkpoints before, between, and after migration legs, a seeded schedule
sporadically alternates the public hostname between `127.0.0.1` and `localhost`,
switches between independently bound public proxy ports, or changes the Node's
listening port. The first round trip guarantees each of those changes. TLS cases
also toggle HTTP/HTTPS after every round trip, exercising migrations in both
protocols. Both S3 endpoints use HTTPS throughout the TLS cases, including signed
read/write tests, migration transfers, and public playback. Their certificates
cover both path-style and virtual-host names.

Public changes use the authenticated production external-network route. Listener
changes use the authenticated internal-network route. Native protocol changes
upload the key/certificate through the authenticated multipart secure-mode route,
or disable secure mode through that same route. The test recreates its Fastify
app with the production TLS-options loader, retaining settings and media. The
old listening port must close after a port change. Public reverse proxies keep
public ports independent of the listener; native TLS also gets direct filesystem
playback checks against the Node listener. These are app restarts, not full
operating-system process restarts.

After every network change and migration/storage switch, the tests require
unchanged playlist/media hashes, correct active-origin requests, and identical
decoded audio/video frames. Every loopback HTTPS manifest and segment is also
retrieved with certificate-chain and hostname verification enabled. FFmpeg uses
its default certificate handling for decoding: Windows Schannel cannot load the
temporary PEM CA through FFmpeg's `ca_file` option. No certificates are installed
into the machine's trust store. The existing logical CDN fixture remains separate
and bypasses certificate verification; loopback-hostname alternation excludes
CDN configurations because they require a valid public domain.

The production app-factory tests additionally exercise a trusted HTTPS handshake,
rejection without the test CA, a restart back to HTTP, and failure to start secure
mode without the uploaded certificate files. Native startup and server restarts
load the saved private key, certificate, and optional CA files. Only test fixtures
are changed when running these tests.

For a longer run, or to run only the 24 repeated cases:

```powershell
$env:MOARTUBE_TEST_HLS = '1'
$env:MOARTUBE_FFMPEG = 'C:\path\to\ffmpeg.exe'
$env:MOARTUBE_OPENSSL = 'C:\path\to\openssl.exe'
$env:MOARTUBE_HLS_ROUNDTRIPS = '10'
npx.cmd vitest run tests/unit/services/storage-migration-roundtrip.test.ts --coverage.enabled=false -t repeats
```

## Browser playback

From the MoarTube-Client repository, with this Node repository next to it:

```powershell
$env:FFMPEG_BIN = 'C:\path\to\ffmpeg.exe'
npx.cmd playwright test --config playwright.hls.config.ts
```

Set `MOARTUBE_NODE_SOURCE_DIR` if the Node source is elsewhere. The browser suite
renders the production watch and embed templates and uses the production player.
It serves generated H.264/AAC media through Playwright response fixtures for
filesystem public/LAN/tunnel origins, S3 path-style, S3 virtual-host style, and
CDN hostnames. Each configuration runs as a watch page and as an iframe inside
another website. Tests require real playback-time advancement, a master request,
rendition requests, segment requests on the expected origin/bucket, and correct
cross-origin response headers. The iframe parent uses the same scheme as its
Node frame to avoid testing an unrelated mixed-content prohibition.

Chromium, Firefox, and WebKit projects are available. A browser build without
native HLS or H.264/AAC MediaSource decoders is explicitly skipped. The Windows
WebKit build used during this audit has neither decoder path; Chromium and
Firefox run the full matrix. Browser fixtures do not contact live S3, Cloudflare,
LAN hosts, or tunnels; actual S3 bytes and migrations are covered by the Node
decoder suite above.
