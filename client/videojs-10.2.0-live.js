const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

export function liveTimelineState(state, seekingBehind = false) {
  const ranges = state.seekable.filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start);
  const start = ranges[0]?.[0] ?? 0;
  const end = ranges.at(-1)?.[1] ?? start;
  const current = Number.isFinite(state.currentTime) ? clamp(state.currentTime, start, end) : start;
  const live = state.targetLiveWindow === 0 || state.targetLiveWindow === Infinity;
  const edge = Number.isFinite(state.liveEdgeStart) ? state.liveEdgeStart : end - 10;
  const tolerance = Number.isFinite(state.liveEdgeStart) ? 5 : 0;
  const atLiveEdge = live && end > start && !state.paused && !state.seeking && !seekingBehind && current >= edge - tolerance;
  const bufferedEnd = state.buffered.at(-1)?.[1] ?? start;
  return {
    start, end, current, edge, atLiveEdge, disabled: end <= start,
    value: atLiveEdge ? end : current,
    bufferPercent: end > start ? clamp((bufferedEnd - start) / (end - start) * 100, 0, 100) : 0,
  };
}

/** Clamp to available history, including a gap between discontinuous ranges. */
export function liveSeekTime(time, ranges) {
  if (!Number.isFinite(time)) return null;
  let lastEnd = null;
  for (const [start, end] of ranges) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    if (time <= end) return Math.max(start, time);
    lastEnd = end;
  }
  return lastEnd;
}

/** The engine's live sync position leaves a safety delay behind the newest segment. */
export function livePlaybackTime(state) {
  const { start, end, disabled } = liveTimelineState(state);
  if (disabled) return null;
  const target = Number.isFinite(state.liveEdgeStart) && state.liveEdgeStart < end
    ? state.liveEdgeStart : end - 10;
  return liveSeekTime(clamp(target, start, end), state.seekable);
}

export function formatLiveOffset(time, end) {
  const seconds = Math.max(0, Math.floor(end - time));
  if (!seconds) return 'LIVE';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const remainder = String(seconds % 60).padStart(2, '0');
  return hours ? `-${hours}:${String(minutes).padStart(2, '0')}:${remainder}` : `-${minutes}:${remainder}`;
}

/** A native range keeps pointer, touch, and keyboard seeking independent of the visual live pin. */
export function initializeLiveTimeline({ timeline, liveButton, store, play, signal }) {
  const input = timeline.querySelector('input');
  const preview = timeline.querySelector('.mt-live-time-value');
  const on = (target, type, handler, options = {}) => target.addEventListener(type, handler, { ...options, signal });
  let dragging = false, seekingBehind = false, pointerPercent = null, releaseControls;

  function update() {
    const state = store.state;
    const position = liveTimelineState(state, seekingBehind);
    // An intentional rewind remains unpinned until playback actually catches up.
    if (seekingBehind && !position.disabled && !state.seeking && !state.paused && position.current >= position.edge) seekingBehind = false;
    const view = liveTimelineState(state, seekingBehind);
    input.disabled = view.disabled;
    if (!dragging) {
      input.min = view.start;
      input.max = view.end;
      input.value = view.value;
    }
    const value = Number(input.value);
    const percent = view.end > view.start ? clamp((value - view.start) / (view.end - view.start) * 100, 0, 100) : 0;
    timeline.style.setProperty('--media-slider-fill', `${percent}%`);
    timeline.style.setProperty('--media-slider-buffer', `${view.bufferPercent}%`);
    const offset = formatLiveOffset(value, view.end);
    input.setAttribute('aria-valuetext', offset === 'LIVE' ? 'Live' : `${offset.slice(1)} behind live`);
    liveButton.disabled = view.disabled || view.atLiveEdge;
    liveButton.toggleAttribute('data-live-edge', view.atLiveEdge);
    liveButton.setAttribute('aria-label', view.atLiveEdge ? 'Playing live' : 'Return to live');
    let previewText = formatLiveOffset(value, view.end);
    if (pointerPercent !== null) {
      previewText = formatLiveOffset(view.start + pointerPercent / 100 * (view.end - view.start), view.end);
      timeline.style.setProperty('--media-slider-pointer', `${pointerPercent}%`);
    } else timeline.style.removeProperty('--media-slider-pointer');
    if (preview.textContent !== previewText) preview.textContent = previewText;
  }

  function seek(time) {
    const liveTarget = livePlaybackTime(store.state);
    if (liveTarget === null) return;
    const target = liveSeekTime(Math.min(time, liveTarget), store.state.seekable);
    if (target === null) return;
    seekingBehind = target < liveTarget;
    void store.seek(target);
    update();
  }

  function endDrag() {
    dragging = false;
    releaseControls?.();
    releaseControls = null;
    update();
  }

  on(input, 'pointerdown', () => {
    dragging = true;
    releaseControls ??= store.requestControlsLock();
  });
  on(input, 'input', () => seek(Number(input.value)));
  on(input, 'change', endDrag);
  on(input, 'pointerup', endDrag);
  on(input, 'pointercancel', endDrag);
  on(input, 'lostpointercapture', endDrag);
  on(input, 'blur', endDrag);
  on(input, 'keydown', event => {
    const { start, end, current, disabled } = liveTimelineState(store.state);
    if (disabled) return;
    const targets = { ArrowLeft: current - 5, ArrowDown: current - 5, ArrowRight: current + 5, ArrowUp: current + 5,
      PageDown: current - 10, PageUp: current + 10, Home: start, End: end };
    if (!(event.key in targets)) return;
    event.preventDefault();
    event.stopPropagation();
    seek(targets[event.key]);
  });
  on(timeline, 'pointermove', event => {
    const bounds = timeline.getBoundingClientRect();
    pointerPercent = bounds.width ? clamp((event.clientX - bounds.left) / bounds.width * 100, 0, 100) : 0;
    update();
  });
  on(timeline, 'pointerleave', () => { pointerPercent = null; update(); });
  on(liveButton, 'click', () => {
    const { end, disabled } = liveTimelineState(store.state);
    if (disabled) return;
    seek(end);
    if (store.state.paused) void play();
  });
  store.subscribe(update, { signal });
  signal.addEventListener('abort', () => releaseControls?.(), { once: true });
  update();
}
