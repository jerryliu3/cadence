import "@testing-library/jest-dom/vitest";

// jsdom does not implement these; Radix UI (Select, etc.) calls them during
// pointer interactions, so tests exercising those components crash without them.
// Guarded because some test files opt into the node environment, where there
// is no Element global at all.
if (typeof Element !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}
