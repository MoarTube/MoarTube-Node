/* Shared browser policies. Weak keys do not retain removed image elements. */
globalThis.MoarTubeMemory = (() => {
  const refreshed = new WeakMap();
  return Object.freeze({
    refreshImage(element, url, interval = 10000, now = Date.now()) {
      if (!element) return false;
      const previous = refreshed.get(element);
      if (previous !== undefined && now - previous < interval) return false;
      refreshed.set(element, now);
      element.src = url + (url.includes('?') ? '&' : '?') + 'v=' + now;
      return true;
    },
    pruneChildren(container, limit) {
      while (container.children.length > limit) container.firstElementChild.remove();
    },
  });
})();
