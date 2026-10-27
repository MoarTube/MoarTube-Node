import { createPlayer, orientationLockFeature } from '@videojs/html';
import { videoFeatures } from '@videojs/html/video';
import '@videojs/html/ui/container';
import '@videojs/html/ui/controls';
import '@videojs/html/ui/controls-content';
import '@videojs/html/ui/controls-group';
import '@videojs/html/ui/play-button';
import '@videojs/html/ui/mute-button';
import '@videojs/html/ui/fullscreen-button';
import '@videojs/html/ui/live-button';
import '@videojs/html/ui/time';
import '@videojs/html/ui/time-slider';
import '@videojs/html/ui/volume-slider';
import '@videojs/html/ui/slider-track';
import '@videojs/html/ui/slider-fill';
import '@videojs/html/ui/slider-buffer';
import '@videojs/html/ui/slider-thumb';
import '@videojs/html/ui/slider-value';
import '@videojs/html/ui/gesture';
import '@videojs/html/ui/hotkey';
import '@videojs/html/media/hlsjs-video';
import { restoredTime, sourceSelection, supportedSources } from './videojs-10.2.0-sources.js';

const { PlayerElement } = createPlayer({ features: [...videoFeatures, orientationLockFeature] });
customElements.define('moartube-video-player', PlayerElement);

const icon = path => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="${path}"/></svg>`;
const icons = {
  play: icon('M8 5v14l11-7z'),
  pause: icon('M6 5h4v14H6zm8 0h4v14h-4z'),
  sound: icon('M3 9v6h4l5 4V5L7 9zm11-1v8c2-1 3-2 3-4s-1-3-3-4zm0-4v2c3 1 5 3 5 6s-2 5-5 6v2c4-1 7-4 7-8s-3-7-7-8z'),
  muted: icon('M3 9v6h4l5 4V5L7 9zm12-1-1 1 3 3-3 3 1 1 3-3 3 3 1-1-3-3 3-3-1-1-3 3z'),
  fullscreen: icon('M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z'),
  exit: icon('M8 4h2v6H4V8h4zm6 0h2v4h4v2h-6zM4 14h6v6H8v-4H4zm10 0h6v2h-4v4h-2z'),
  theater: icon('M3 5h18v14H3zm2 2v10h14V7z'),
  small: icon('M5 7h14v10H5zm2 2v6h10V9z'),
  brand: '<svg viewBox="219.612 206.192 57.5107 19.658" height="19.658" width="57.511"><path d="M 219.612 225.533 L 219.612 206.192 L 222.623 206.192 L 224.431 219.384 L 226.218 206.192 L 229.237 206.192 L 229.237 225.533 L 227.368 225.533 L 227.368 210.307 L 225.39 225.533 L 223.453 225.533 L 221.481 210.307 L 221.481 225.533 L 219.612 225.533 Z M 229.859 218.33 C 229.859 217.099 230.016 215.907 230.328 214.753 C 230.641 213.601 231.084 212.722 231.657 212.115 C 232.23 211.509 232.87 211.205 233.577 211.205 C 234.669 211.205 235.564 211.893 236.262 213.269 C 236.959 214.646 237.308 216.386 237.308 218.488 C 237.308 220.607 236.956 222.364 236.251 223.759 C 235.547 225.153 234.66 225.85 233.59 225.85 C 232.929 225.85 232.298 225.559 231.697 224.979 C 231.097 224.398 230.641 223.547 230.328 222.426 C 230.016 221.305 229.859 219.939 229.859 218.33 Z M 231.816 218.527 C 231.816 219.918 231.986 220.982 232.326 221.72 C 232.667 222.46 233.086 222.829 233.584 222.829 C 234.082 222.829 234.5 222.46 234.838 221.72 C 235.175 220.982 235.344 219.909 235.344 218.501 C 235.344 217.128 235.175 216.073 234.838 215.335 C 234.5 214.595 234.082 214.225 233.584 214.225 C 233.086 214.225 232.667 214.595 232.326 215.335 C 231.986 216.073 231.816 217.137 231.816 218.527 Z M 239.317 215.797 L 237.583 215.189 C 237.778 213.834 238.113 212.832 238.589 212.181 C 239.065 211.531 239.772 211.205 240.709 211.205 C 241.562 211.205 242.196 211.401 242.612 211.792 C 243.029 212.183 243.323 212.68 243.493 213.283 C 243.663 213.885 243.748 214.991 243.748 216.6 L 243.728 220.929 C 243.728 222.16 243.758 223.068 243.819 223.652 C 243.88 224.238 243.995 224.865 244.163 225.533 L 242.273 225.533 C 242.223 225.287 242.162 224.922 242.09 224.438 C 242.058 224.218 242.035 224.073 242.022 224.003 C 241.695 224.619 241.346 225.08 240.975 225.387 C 240.603 225.696 240.207 225.85 239.785 225.85 C 239.042 225.85 238.457 225.458 238.028 224.676 C 237.6 223.893 237.386 222.903 237.386 221.708 C 237.386 220.916 237.483 220.21 237.678 219.589 C 237.873 218.969 238.146 218.494 238.497 218.165 C 238.849 217.835 239.355 217.547 240.016 217.301 C 240.909 216.975 241.527 216.672 241.872 216.391 L 241.872 216.021 C 241.872 215.309 241.781 214.801 241.6 214.497 C 241.419 214.194 241.077 214.042 240.574 214.042 C 240.234 214.042 239.969 214.172 239.778 214.43 C 239.588 214.689 239.434 215.145 239.317 215.797 Z M 241.872 218.805 C 241.627 218.962 241.24 219.151 240.709 219.372 C 240.18 219.592 239.833 219.808 239.67 220.019 C 239.421 220.361 239.296 220.796 239.296 221.324 C 239.296 221.843 239.396 222.291 239.595 222.669 C 239.795 223.049 240.048 223.238 240.356 223.238 C 240.7 223.238 241.029 223.018 241.342 222.577 C 241.573 222.243 241.725 221.834 241.797 221.35 C 241.847 221.034 241.872 220.431 241.872 219.542 L 241.872 218.805 Z M 246.541 225.533 L 244.632 225.533 L 244.632 211.522 L 246.406 211.522 L 246.406 213.514 C 246.709 212.573 246.982 211.953 247.224 211.653 C 247.467 211.355 247.742 211.205 248.05 211.205 C 248.486 211.205 248.905 211.438 249.308 211.904 L 248.716 215.137 C 248.394 214.732 248.095 214.529 247.819 214.529 C 247.552 214.529 247.325 214.672 247.139 214.958 C 246.953 215.245 246.808 215.761 246.701 216.508 C 246.594 217.256 246.541 218.822 246.541 221.206 L 246.541 225.533 Z M 251.471 225.533 L 251.471 209.463 L 248.514 209.463 L 248.514 206.192 L 256.432 206.192 L 256.432 209.463 L 253.483 209.463 L 253.483 225.533 L 251.471 225.533 Z M 260.517 225.533 L 260.517 223.436 C 260.254 224.183 259.909 224.772 259.48 225.203 C 259.052 225.634 258.6 225.85 258.125 225.85 C 257.639 225.85 257.204 225.643 256.82 225.229 C 256.434 224.816 256.156 224.235 255.984 223.489 C 255.811 222.741 255.725 221.707 255.725 220.387 L 255.725 211.522 L 257.635 211.522 L 257.635 217.96 C 257.635 219.93 257.67 221.137 257.74 221.581 C 257.81 222.026 257.938 222.378 258.125 222.637 C 258.31 222.897 258.546 223.027 258.831 223.027 C 259.157 223.027 259.45 222.853 259.708 222.506 C 259.966 222.159 260.143 221.727 260.238 221.212 C 260.334 220.697 260.381 219.438 260.381 217.432 L 260.381 211.522 L 262.291 211.522 L 262.291 225.533 L 260.517 225.533 Z M 263.269 225.533 L 263.269 206.192 L 265.179 206.192 L 265.179 213.157 C 265.768 211.856 266.466 211.205 267.272 211.205 C 268.151 211.205 268.879 211.823 269.455 213.059 C 270.03 214.294 270.317 216.068 270.317 218.382 C 270.317 220.774 270.024 222.617 269.437 223.91 C 268.85 225.203 268.138 225.85 267.3 225.85 C 266.888 225.85 266.481 225.649 266.08 225.249 C 265.679 224.849 265.333 224.258 265.043 223.475 L 265.043 225.533 L 263.269 225.533 Z M 265.165 218.223 C 265.165 219.675 265.283 220.748 265.519 221.443 C 265.849 222.428 266.289 222.92 266.837 222.92 C 267.259 222.92 267.618 222.57 267.915 221.871 C 268.212 221.172 268.36 220.07 268.36 218.566 C 268.36 216.965 268.211 215.811 267.912 215.104 C 267.612 214.396 267.23 214.042 266.763 214.042 C 266.305 214.042 265.925 214.387 265.621 215.077 C 265.317 215.768 265.165 216.817 265.165 218.223 Z M 275.116 221.073 L 277.019 221.693 C 276.774 223.048 276.388 224.08 275.86 224.788 C 275.332 225.496 274.672 225.85 273.879 225.85 C 272.623 225.85 271.695 225.054 271.092 223.462 C 270.616 222.187 270.379 220.577 270.379 218.632 C 270.379 216.311 270.691 214.492 271.316 213.177 C 271.942 211.862 272.732 211.205 273.688 211.205 C 274.762 211.205 275.609 211.893 276.23 213.269 C 276.851 214.646 277.148 216.755 277.121 219.596 L 272.336 219.596 C 272.35 220.696 272.504 221.551 272.798 222.163 C 273.092 222.774 273.459 223.08 273.899 223.08 C 274.198 223.08 274.45 222.921 274.653 222.604 C 274.857 222.287 275.011 221.777 275.116 221.073 Z M 275.225 217.327 C 275.211 216.254 275.068 215.438 274.796 214.88 C 274.525 214.321 274.194 214.042 273.804 214.042 C 273.387 214.042 273.043 214.337 272.771 214.926 C 272.499 215.515 272.365 216.315 272.369 217.327 L 275.225 217.327 Z" style="fill: rgb(255, 255, 255); white-space: pre;"/></svg>',
  more: icon('M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'),
};

/** Shared Video.js 10 player for watch and embedded video pages. */
export function createVideoPlayer({ placeholder, adaptiveSources, progressiveSources, isStreaming, timeParameter, videoId, copyText, embedded = false, autoStart = true, onError = console.error }) {
  const wrapper = placeholder.parentElement;
  const home = wrapper.parentElement;
  const nextSibling = wrapper.nextSibling;
  const player = document.createElement('moartube-video-player');
  player.id = 'video-player';
  player.className = 'mt-video-player';
  player.classList.toggle('mt-embedded-player', embedded);
  player.innerHTML = `<media-container class="mt-player-surface" tabindex="0" aria-label="Video player">
    <div class="mt-media-slot"></div>
    <media-gesture type="tap" pointer="mouse" action="togglePaused"></media-gesture>
    <media-gesture type="doubletap" pointer="mouse" action="toggleFullscreen"></media-gesture>
    <media-hotkey keys="Space" action="togglePaused"></media-hotkey>
    <media-hotkey keys="k" action="togglePaused"></media-hotkey>
    <media-hotkey keys="m" action="toggleMuted"></media-hotkey>
    <media-hotkey keys="f" action="toggleFullscreen"></media-hotkey>
    <media-hotkey keys="ArrowLeft" action="seekStep" value="-5"></media-hotkey>
    <media-hotkey keys="ArrowRight" action="seekStep" value="5"></media-hotkey>
    <media-controls>
      <media-controls-content class="mt-controls">
        <media-controls-group class="mt-control-bar" aria-label="Playback controls">
          <media-time-slider class="mt-timeline">
            <media-slider-track><media-slider-buffer></media-slider-buffer><media-slider-fill></media-slider-fill></media-slider-track>
            <media-slider-thumb></media-slider-thumb><media-slider-value type="pointer"></media-slider-value>
          </media-time-slider>
          <media-play-button class="mt-icon-button" title="Play / pause"><span class="mt-play">${icons.play}</span><span class="mt-pause">${icons.pause}</span></media-play-button>
          <media-mute-button class="mt-icon-button" title="Mute / unmute"><span class="mt-sound">${icons.sound}</span><span class="mt-muted">${icons.muted}</span></media-mute-button>
          <media-volume-slider class="mt-volume"><media-slider-track><media-slider-fill></media-slider-fill></media-slider-track><media-slider-thumb></media-slider-thumb></media-volume-slider>
          <span class="mt-times"><media-time type="current"></media-time><span> / </span><media-time type="duration"></media-time></span>
          <media-live-button class="mt-live">LIVE</media-live-button>
          <span class="mt-spacer"></span>
          <a class="mt-watch-link mt-icon-button" aria-label="Watch on MoarTube" title="Watch on MoarTube" target="_blank" rel="noopener">${icons.brand}</a>
          <media-fullscreen-button class="mt-icon-button" title="Fullscreen"><span class="mt-enter">${icons.fullscreen}</span><span class="mt-exit">${icons.exit}</span></media-fullscreen-button>
          <button type="button" class="mt-streamer mt-icon-button" aria-label="Streamer mode" title="Streamer mode" aria-pressed="false">${icons.fullscreen}</button>
          <button type="button" class="mt-theater mt-icon-button" aria-label="Theater mode" title="Theater mode" aria-pressed="false">${icons.theater}</button>
          <button type="button" class="mt-settings mt-icon-button" title="Settings" aria-label="Settings" aria-haspopup="menu" aria-expanded="false" aria-controls="mt-player-settings">${icons.more}</button>
        </media-controls-group>
      </media-controls-content>
    </media-controls>
    <div id="mt-player-settings" class="mt-player-menu" role="menu" aria-label="Player settings" hidden data-interactive></div>
    <div class="mt-context-menu mt-player-menu" role="menu" aria-label="Video links" hidden data-interactive></div>
    <div class="mt-buffering" role="status" hidden>Loading…</div>
    <div class="mt-player-error" role="alert" hidden></div>
  </media-container>`;
  const surface = player.querySelector('media-container');
  const overlay = wrapper.querySelector('#mtp-video-overlay');
  if (overlay) {
    // The poster handles its own Play action; exclude it from surface tap-to-pause.
    overlay.setAttribute('data-interactive', '');
    if (embedded) overlay.classList.remove('hidden-elem');
    surface.append(overlay);
  }
  const information = wrapper.querySelector('#mtp-video-overlay-info');
  if (information) player.querySelector('.mt-controls').append(information);
  placeholder.replaceWith(player);
  const controls = player.querySelector('media-controls');
  const menu = player.querySelector('#mt-player-settings');
  const context = player.querySelector('.mt-context-menu');
  const settings = player.querySelector('.mt-settings');
  const theater = player.querySelector('.mt-theater');
  const watchLink = player.querySelector('.mt-watch-link');
  watchLink.href = new URL('/watch?v=' + encodeURIComponent(videoId), window.location.origin).href;
  watchLink.hidden = !embedded;
  theater.hidden = embedded;
  const streamer = player.querySelector('.mt-streamer');
  const error = player.querySelector('.mt-player-error');
  const buffering = player.querySelector('.mt-buffering');
  const lifetime = new AbortController();
  const listen = (target, event, handler) => target.addEventListener(event, handler, { signal: lifetime.signal });
  const sources = supportedSources(adaptiveSources, progressiveSources, document.createElement('video'));
  let media, mediaLifetime, currentSource, pendingRestore, selected, sourceIndex = 0, initialSeekDone = false, hasPlayed = false;
  let theaterActive = false, streamerActive = false, playbackRequested = autoStart, preferredRate = 1;
  player.classList.toggle('mt-is-live', isStreaming);
  streamer.hidden = embedded || !isStreaming;

  function setMenusClosed(focus = false) {
    menu.hidden = context.hidden = true;
    settings.setAttribute('aria-expanded', 'false');
    controls.removeAttribute('visibility');
    if (focus) settings.focus();
  }

  function reportError(message) {
    buffering.hidden = true;
    error.textContent = message;
    error.hidden = false;
    if (overlay) overlay.classList.add('hidden-elem');
    onError(message);
  }

  function play() {
    playbackRequested = true;
    if (!media) {
      if (sources.length) setSource(sources[0], false);
      return Promise.resolve();
    }
    const attemptedMedia = media, attemptedSource = currentSource;
    return media.play().catch(reason => {
      if (attemptedMedia !== media || attemptedSource !== currentSource || reason.name === 'AbortError') return;
      buffering.hidden = true;
      if (!hasPlayed && overlay) overlay.classList.remove('hidden-elem');
    });
  }

  function restorePosition() {
    if (!pendingRestore || !media.readyState) return;
    // Live manifests may report metadata before their seekable window is known.
    if (isStreaming && !media.seekable.length) return;
    const time = restoredTime(pendingRestore.time, media.duration, media.seekable, isStreaming);
    if (time !== null) {
      try { media.currentTime = time; } catch { return; }
    }
    pendingRestore = null;
  }

  function setSource(source, preserve = true) {
    if (!source || source.src === currentSource?.src) return;
    const snapshot = preserve && media ? {
      time: media.currentTime, paused: media.paused, rate: media.playbackRate, volume: media.volume, muted: media.muted,
    } : { time: isStreaming || timeParameter == null || initialSeekDone ? NaN : Number(timeParameter), paused: !playbackRequested, rate: preferredRate, volume: 1, muted: false };
    const isHls = sourceSelection(source).format === 'm3u8';
    const tag = isHls ? 'hlsjs-video' : 'video';
    mediaLifetime?.abort();
    mediaLifetime = new AbortController();
    // Replace the media only when changing engines. v10 discovers the new element automatically.
    if (media?.localName !== tag) {
      media?.remove();
      media = document.createElement(tag);
      media.setAttribute('playsinline', '');
      media.setAttribute('disablepictureinpicture', '');
      if (isHls) media.setAttribute('stream-type', isStreaming ? 'live' : 'on-demand');
      player.querySelector('.mt-media-slot').append(media);
    }
    // Keep initial loading deferred; allow metadata when switching an already-played video.
    media.setAttribute('preload', hasPlayed ? 'metadata' : 'none');
    currentSource = source;
    selected = sourceSelection(source);
    pendingRestore = snapshot;
    media.volume = snapshot.volume;
    media.muted = snapshot.muted;
    const on = (event, callback) => media.addEventListener(event, callback, { signal: mediaLifetime.signal });
    on('loadedmetadata', () => {
      initialSeekDone = true;
      media.playbackRate = snapshot.rate;
      restorePosition();
    });
    on('canplay', () => { restorePosition(); buffering.hidden = true; });
    on('progress', restorePosition);
    on('durationchange', restorePosition);
    on('playing', () => {
      hasPlayed = true;
      restorePosition();
      buffering.hidden = true;
      overlay?.classList.add('hidden-elem');
    });
    on('waiting', () => { buffering.hidden = false; });
    on('pause', () => { buffering.hidden = true; });
    on('error', () => {
      // Retain the old player's automatic initial source fallback.
      if (!hasPlayed && sourceIndex + 1 < sources.length) {
        setSource(sources[++sourceIndex], false);
      } else {
        reportError('Unable to play this source. Try another format or resolution in Settings.');
      }
    });
    error.hidden = true;

    if (media.localName === 'hlsjs-video') {
      // MoarTube emits no interstitials; keep their scheduler from bypassing preload.
      const nativeHls = document.createElement('video').canPlayType('application/vnd.apple.mpegurl');
      media.source = { ...source, preferPlayback: nativeHls && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Android/.test(navigator.userAgent) ? 'native' : 'mse', engine: { hlsJs: { enableInterstitialPlayback: false, lowLatencyMode: true, backBufferLength: 60, maxBufferLength: 30, maxMaxBufferLength: 60, maxBufferSize: 30 * 1000 * 1000 } } };
    } else {
      media.src = source.src;
    }
    if (!snapshot.paused) queueMicrotask(() => void play());
  }

  function menuButton(label, action, { checked, detail } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.role = checked === undefined ? 'menuitem' : 'menuitemradio';
    if (checked !== undefined) {
      button.setAttribute('aria-checked', String(checked));
      button.setAttribute('aria-label', label);
    }
    const text = document.createElement('span');
    text.textContent = label;
    button.append(text);
    if (detail) {
      const value = document.createElement('span');
      value.textContent = detail;
      button.append(value);
    }
    button.addEventListener('click', action);
    return button;
  }

  function showMenu(page = 'main', format) {
    context.hidden = true;
    menu.replaceChildren();
    menu.hidden = false;
    settings.setAttribute('aria-expanded', 'true');
    controls.setAttribute('visibility', 'always');
    if (page === 'main') {
      menu.append(menuButton('Quality', () => showMenu('formats'), { detail: `${selected?.format ?? ''} ${selected?.resolution ?? ''} ›` }),
        menuButton('Playback speed', () => showMenu('speed'), { detail: `${media?.playbackRate ?? preferredRate}× ›` }));
    } else if (page === 'formats') {
      menu.append(menuButton('‹ Quality', () => showMenu()));
      for (const format of [...new Set(sources.map(source => sourceSelection(source).format))]) {
        menu.append(menuButton(format, () => showMenu('resolutions', format), { detail: '›' }));
      }
    } else if (page === 'resolutions') {
      menu.append(menuButton(`‹ ${format}`, () => showMenu('formats')));
      for (const source of sources.filter(source => sourceSelection(source).format === format)) {
        const { resolution } = sourceSelection(source);
        menu.append(menuButton(resolution, () => { setSource(source); showMenu(page, format); }, { checked: selected?.format === format && selected.resolution === resolution }));
      }
    } else {
      menu.append(menuButton('‹ Playback speed', () => showMenu()));
      for (const rate of [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]) {
        menu.append(menuButton(`${rate}×`, () => { preferredRate = rate; if (media) media.playbackRate = rate; showMenu('speed'); }, { checked: (media?.playbackRate ?? preferredRate) === rate }));
      }
    }
    menu.querySelector('button')?.focus();
  }

  listen(watchLink, 'click', () => media?.pause());
  listen(settings, 'click', () => menu.hidden ? showMenu() : setMenusClosed(true));
  listen(theater, 'click', () => {
    theaterActive = !theaterActive;
    wrapper.classList.toggle('mt-theater-wrapper', theaterActive);
    if (theaterActive) document.querySelector('#theater-container').append(wrapper);
    else home.insertBefore(wrapper, nextSibling);
    theater.setAttribute('aria-pressed', String(theaterActive));
    theater.innerHTML = theaterActive ? icons.small : icons.theater;
  });
  listen(streamer, 'click', () => {
    streamerActive = !streamerActive;
    document.querySelector('#main-container').classList.toggle('w-100', streamerActive);
    streamer.setAttribute('aria-pressed', String(streamerActive));
    streamer.innerHTML = streamerActive ? icons.exit : icons.fullscreen;
  });
  listen(document, 'pointerdown', event => {
    if (!event.composedPath().some(node => node === menu || node === context || node === settings)) setMenusClosed();
  });
  listen(surface, 'keydown', event => {
    const activeMenu = !menu.hidden ? menu : !context.hidden ? context : null;
    if (!activeMenu) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); setMenusClosed(true);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const buttons = [...activeMenu.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (event.key === 'Tab') setMenusClosed();
  });
  listen(surface, 'contextmenu', event => {
    event.preventDefault();
    setMenusClosed();
    context.replaceChildren();
    const url = new URL('/watch', window.location.origin);
    url.searchParams.set('v', videoId);
    const copy = async atTime => {
      if (atTime) url.searchParams.set('t', Math.floor(media?.currentTime ?? 0));
      try { await copyText(url.href); } catch (reason) { onError(reason); }
      setMenusClosed(); surface.focus();
    };
    context.append(menuButton('copy video url', () => void copy(false)));
    if (!isStreaming) context.append(menuButton('copy video url at current time', () => void copy(true)));
    context.hidden = false;
    controls.setAttribute('visibility', 'always');
    const bounds = surface.getBoundingClientRect();
    context.style.left = `${Math.max(0, Math.min(event.clientX - bounds.left, Math.min(bounds.width, innerWidth - bounds.left) - context.offsetWidth))}px`;
    context.style.top = `${Math.max(0, Math.min(event.clientY - bounds.top, Math.min(bounds.height, innerHeight - bounds.top) - context.offsetHeight))}px`;
    context.querySelector('button')?.focus();
  });
  const fullscreenChanged = () => { setMenusClosed(); theater.hidden = embedded || !!document.fullscreenElement; };
  listen(document, 'fullscreenchange', fullscreenChanged);
  listen(window, 'resize', () => { if (!context.hidden) setMenusClosed(); });
  if (overlay) {
    // The central native button is the keyboard target; avoid nested button roles.
    overlay.removeAttribute('role');
    listen(overlay, 'click', event => {
      if (!event.target.closest('a')) void play();
    });
    const button = overlay.querySelector('button');
    button?.setAttribute('aria-label', 'Play video');
  }
  if (sources.length) {
    selected = sourceSelection(sources[0]);
    if (!embedded || autoStart) setSource(sources[0], false);
  }
  else reportError('No playable video sources are available in this browser.');

  return {
    get media() { return media; },
    destroy() {
      lifetime.abort(); mediaLifetime?.abort();
      media?.pause();
      player.remove();
    },
  };
}
