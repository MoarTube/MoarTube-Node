/** Expose portrait video height to the watch page's mobile layout. */
export function initializePlayerLayout({ wrapper, media, signal }) {
  function reset() {
    wrapper.classList.remove('mt-portrait-video');
    wrapper.style.removeProperty('--mt-video-height');
  }
  function update() {
    const { videoWidth: width, videoHeight: height } = media;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= width) {
      reset();
      return;
    }
    wrapper.style.setProperty('--mt-video-height', `${height / width * 100}%`);
    wrapper.classList.add('mt-portrait-video');
  }
  const on = (event, handler) => media.addEventListener(event, handler, { signal });
  on('loadedmetadata', update);
  on('resize', update);
  on('playing', update);
  on('loadstart', reset);
  on('emptied', reset);
  signal.addEventListener('abort', reset, { once: true });
  reset();
}
