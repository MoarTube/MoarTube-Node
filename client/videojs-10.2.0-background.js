/** Match the watch page only once this source has played and its video fills a 16:9 frame. */
export function initializePlayerBackground({ player, media, signal }) {
  let played = false;
  function update() {
    const { videoWidth: width, videoHeight: height } = media;
    // Allow a single pixel of width rounding (e.g. 854x480 and 426x240).
    const widescreen = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
      && Math.abs(width - height * 16 / 9) <= 1;
    player.classList.toggle('mt-widescreen-background', played && widescreen);
  }
  function reset() {
    played = false;
    update();
  }
  const on = (event, handler) => media.addEventListener(event, handler, { signal });
  on('playing', () => { played = true; update(); });
  on('loadedmetadata', update);
  on('resize', update);
  on('loadstart', reset);
  on('emptied', reset);
  signal.addEventListener('abort', reset, { once: true });
  reset();
}
