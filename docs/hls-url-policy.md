# HLS URL policy

The player's entry URL selects the delivery origin. References inside managed
master and rendition playlists are relative to the containing playlist URL.
Disk paths and S3 keys are translated during copying; they are not the base used
by a viewer to resolve playlist references.

| Delivery configuration                               | Master URL supplied to a viewer                                                                               | Managed references inside playlists                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Filesystem, public domain, LAN, localhost, or tunnel | `/external/videos/<id>/adaptive/m3u8/static/manifests/manifest-master.m3u8` on the current page/iframe origin | Playlist-relative                                               |
| S3 path-style                                        | Absolute endpoint URL including the bucket path                                                               | Playlist-relative, retaining the bucket prefix after resolution |
| S3 virtual-host style                                | Absolute bucket hostname URL                                                                                  | Playlist-relative                                               |
| S3 through Cloudflare CDN                            | Absolute `https://externalvideos.<node-domain>/external/videos/...`                                           | Playlist-relative, resolving through that CDN hostname          |

Filesystem storage keeps the same viewer-relative rule with CDN enabled.
Iframe playback resolves its root-relative entry URL against the iframe's Node
origin, not against the enclosing website. A separately hosted player needs an
absolute entry URL. Normal browser HTTPS/mixed-content and cross-origin access
rules still apply.

For all delivery configurations, a master normally references
`manifest-720p.m3u8`, and its rendition references
`../../720p/segments/segment-720p-0.ts`. Native AWS viewer URLs use path-style
when requested or when the bucket name contains dots. CDN configuration keeps
the existing bucket/domain and HTTPS virtual-host endpoint requirements.

## Generation and transitions

This is the initial format contract. There is no compatibility conversion for
older absolute, scheme-relative, or bucket-prefixed playlist references.

- Client VOD and live encoders generate playlist-relative segment references.
- Node master generation writes relative rendition filenames.
- Upload and filesystem-serving paths transfer playlist bytes unchanged.
- Publishing recovery resumes copying the same relative files. Jobs do not
  record media-host history or an older playlist URL format version.
- Migration copies playlist bytes and translates local/S3 directory layouts.
- Changing the public Node URL, storage mode, or CDN configuration updates
  entry-point selection and invalidates relevant caches. It does not open,
  rewrite, or repair stored playlists and does not require a history of origins.
- Dynamic S3 snapshots use `no-store`, including copies made by migration.
  Static VOD data retains the existing VOD cache policy.
- Source data is retained. A failed operation is not a rollback of overwritten
  destination data.

Absolute URLs still belong in player entry points, S3 connections, and CDN
configuration where required. Deliberately external or signed resources are not
rewritten. They are separate from MoarTube-managed relative media references.

See [storage migration testing](storage-migration-testing.md) for the decoder and
browser test commands and the boundaries of the local delivery fixtures.
