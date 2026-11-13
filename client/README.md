# Video player

`videojs-10.2.0.js` provides one Video.js 10.2.0 integration for the watch and embed
pages. It uses HTML components with a shared skin in
`public/css/videojs-10.2.0.css` and hls.js
for HLS playback (native HLS on Safari). Progressive files use native video.
The embed enables its title/channel links and Watch on MoarTube control, while
the watch page enables theater mode.

Watch layouts are mutually exclusive. Browser local storage (`moartube-watch-modes`)
remembers theater mode for videos and live streams. Clicking the active mode
returns to standard layout and saves that choice. Small screens temporarily use
standard layout without changing the preference; embeds ignore watch preferences.
Run `node --test tests/client/watch-modes.test.mjs` for layout regression tests.

Run `npm run build:player` after changing the client module. Commit the generated
`public/javascript/videojs-10.2.0.js` and its license file so development
and packaged installations both have the asset. `npm run build` also rebuilds
the player before copying public assets into `dist`.

Format/resolution choices retain the source URLs supplied by the server. HLS
`auto` selects the master manifest; explicit quality selects its rendition
manifest. Source changes preserve playback time, speed, volume, mute, and pause
state. The URL timestamp is applied on initial load rather than on every resume.

Player backgrounds start black. After a source starts playing, the watch page
matches its background only for 16:9 video, using the actual video dimensions
with one pixel of width rounding allowed. Other aspect ratios keep black bars.
Source loading resets this choice, and video resize events update it during
adaptive playback. Theater mode, fullscreen, and embeds retain black backgrounds.

On mobile watch pages (below 992px), portrait videos fill the available width
and the container height follows their intrinsic aspect ratio, capped in CSS at
`100dvh` minus a 60px navbar, 16px of page spacing, and the bottom safe-area inset.
When capped, the entire video fits inside the black container with sidebars.
Metadata and video resize events update the ratio; source loading clears it.
Desktop players and embeds keep their existing dimensions.

Live playback includes `liveFeature` for live-edge tracking and the LIVE button.
`videojs-10.2.0-live.js` binds a native range to the current seekable window, so
sliding playlists cannot seek into expired history. The thumb stays at the right
edge while playing live; pausing or rewinding shows the actual position. Pinning
only changes the display, never playback time. Previews show time behind live,
and LIVE seeks to the engine's recommended live sync position and resumes paused
playback. Forward seeks stop at that position too, preserving the engine's safety
delay instead of seeking to the literal end of the playlist. If the engine has
not reported a live sync position, use a ten-second safety delay, clamped to the
available history.
Run `node --test tests/client/*.test.mjs` for client regression tests.

Embeds wait for manual play by default and defer loading media until that click.
`autostart=1` requests playback automatically, with a manual-play fallback when
browser policy blocks it. Source changes never reapply the initial timestamp.

Fullscreen targets the media container so menus and overlays stay inside it.
Video.js's orientation feature requests landscape lock where supported. iPhone
native fullscreen and actual device orientation behavior need physical-device testing.
