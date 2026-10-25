# Video player

`videojs-10.2.0.js` provides one Video.js 10.2.0 integration for the watch and embed
pages. It uses HTML components with a shared skin in
`public/css/videojs-10.2.0.css` and hls.js
for HLS playback (native HLS on Safari). Progressive files use native video.
The embed enables its title/channel links and Watch on MoarTube control, while
the watch page enables theater mode and the live streamer layout toggle.

Run `npm run build:player` after changing the client module. Commit the generated
`public/javascript/videojs-10.2.0.js` and its license file so development
and packaged installations both have the asset. `npm run build` also rebuilds
the player before copying public assets into `dist`.

Format/resolution choices retain the source URLs supplied by the server. HLS
`auto` selects the master manifest; explicit quality selects its rendition
manifest. Source changes preserve playback time, speed, volume, mute, and pause
state. The URL timestamp is applied on initial load rather than on every resume.

Embeds wait for manual play by default and defer loading media until that click.
`autostart=1` requests playback automatically, with a manual-play fallback when
browser policy blocks it. Source changes never reapply the initial timestamp.

Fullscreen targets the media container so menus and overlays stay inside it.
Video.js's orientation feature requests landscape lock where supported. iPhone
native fullscreen and actual device orientation behavior need physical-device testing.
