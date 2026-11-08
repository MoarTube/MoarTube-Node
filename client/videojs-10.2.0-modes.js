const preferenceKey = 'moartube-watch-modes';

/** Keep watch layouts mutually exclusive without changing the media source. */
export function initializeWatchModes({ wrapper, theater, isStreaming, embedded, icons, listen, onMove }) {
  if (embedded) return () => {};
  const home = wrapper.parentElement;
  const nextSibling = wrapper.nextSibling;
  const theaterContainer = document.querySelector('#theater-container');
  const desktop = window.matchMedia('(min-width: 992px)');
  let preferences = { video: 'standard', live: 'standard' };
  try {
    const saved = JSON.parse(window.localStorage.getItem(preferenceKey));
    if (saved?.video === 'theater') preferences.video = 'theater';
    if (saved?.live === 'theater') preferences.live = 'theater';
  } catch { /* Storage can be unavailable or contain invalid data. */ }
  let mode = preferences[isStreaming ? 'live' : 'video'];

  function render() {
    const active = desktop.matches ? mode : 'standard';
    const theaterActive = active === 'theater' && !!theaterContainer;
    const parent = theaterActive ? theaterContainer : home;
    if (wrapper.parentElement !== parent) {
      const before = parent === home && nextSibling?.parentElement === home ? nextSibling : null;
      // Atomic moves preserve playback and custom-element state in supporting browsers.
      if (parent.moveBefore && wrapper.isConnected) parent.moveBefore(wrapper, before);
      else onMove(() => parent.insertBefore(wrapper, before));
    }
    wrapper.classList.toggle('mt-theater-wrapper', theaterActive);
    theater.setAttribute('aria-pressed', String(theaterActive));
    theater.innerHTML = theaterActive ? icons.small : icons.theater;
  }

  function select(selected) {
    mode = mode === selected ? 'standard' : selected;
    preferences.video = preferences.live = mode;
    try { window.localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch { /* Layout still works without storage. */ }
    render();
  }

  listen(theater, 'click', () => select('theater'));
  listen(desktop, 'change', render);
  render();
  return () => {
    mode = 'standard';
    render();
  };
}
