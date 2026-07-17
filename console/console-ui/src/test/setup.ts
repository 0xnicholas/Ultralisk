import '@testing-library/jest-dom';

// Mantine v9 calls window.matchMedia at mount. The vitest node env
// (which is what's actually loaded here) doesn't provide it, and the
// jsdom env that vitest config claims to use isn't being honored.
// Polyfill the minimum Mantine touches.
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
}
