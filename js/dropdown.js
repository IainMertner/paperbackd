// Makes dropdowns reachable when they extend past the bottom of the screen.
//
// A long menu hanging below the fold is already scrollable-to: absolutely
// positioned content contributes to the document's scrollable overflow, so the
// browser extends the page to exactly the menu's bottom edge. Exactly is the
// problem — the fixed bottom nav sits over that last stretch, so the final rows
// stop underneath it and there is nowhere further to scroll.
//
// The fix is to make the page end lower than the menu does, by the height of
// the nav plus a little breathing room.

// How much bottom padding .page-content needs so the page ends far enough below
// the menu. All measurements are viewport-relative, so the scroll position
// cancels out and this works wherever the user happens to be on the page.
//
//   elBottom        bottom of the dropdown
//   containerBottom bottom of .page-content's border box — the page's own end,
//                   already including whatever gap is currently applied
//   currentGap      that applied gap, which is why it is added back
//
// Returns a whole number of pixels, never negative. Idempotent: feeding the
// result back in yields the same answer, so repeated fits do not creep.
export function gapNeeded(elBottom, containerBottom, currentGap = 0, obstruction = 0, pad = 16) {
  if (elBottom == null || containerBottom == null) return 0;
  const wantedEnd = elBottom + obstruction + pad;
  return Math.max(0, Math.round(currentGap + wantedEnd - containerBottom));
}

const page = () => document.querySelector('.page-content');

// Height of the fixed bottom nav, which covers the last stretch of the
// viewport. Measured rather than hardcoded: it carries
// env(safe-area-inset-bottom), so it is taller on a notched phone, and it is
// display:none on desktop, where this correctly becomes zero.
function bottomObstruction() {
  const nav = document.querySelector('.mobile-nav');
  if (!nav) return 0;
  const style = getComputedStyle(nav);
  if (style.display === 'none' || style.visibility === 'hidden') return 0;
  return nav.getBoundingClientRect().height;
}

const readGap = el => parseFloat(el.style.getPropertyValue('--dropdown-gap')) || 0;

// Call after opening a dropdown, and again whenever its contents change height
// (a suggestion list re-rendering as you type, for instance).
export function fitDropdown(el, pad = 16) {
  const container = page();
  if (!el || !container) return;
  // Wait a frame: the element has just been shown or refilled, so its height
  // is not final until layout has run.
  requestAnimationFrame(() => {
    const gap = gapNeeded(
      el.getBoundingClientRect().bottom,
      container.getBoundingClientRect().bottom,
      readGap(container),
      bottomObstruction(),
      pad,
    );
    // A custom property, not padding-bottom: the stylesheet folds this into the
    // existing nav clearance, so neither value clobbers the other.
    container.style.setProperty('--dropdown-gap', `${gap}px`);
  });
}

// Call when the dropdown closes, so the page stops carrying dead space.
export function releaseDropdown() {
  const container = page();
  if (container) container.style.removeProperty('--dropdown-gap');
}

const isVisible = el => el.offsetParent !== null && getComputedStyle(el).display !== 'none';

// Keeps a dropdown fitted without the caller having to remember to ask.
//
// For search suggestions the height changes on every keystroke, not just on
// open, so hooking the show/hide calls alone would leave the page the wrong
// size as results come and go. Watching the element covers every path — shown,
// hidden, refilled — from one call at setup.
export function autoFit(el, pad = 16) {
  if (!el || typeof MutationObserver === 'undefined') return null;
  const update = () => (isVisible(el) ? fitDropdown(el, pad) : releaseDropdown());
  const observer = new MutationObserver(update);
  observer.observe(el, {
    attributes: true,
    attributeFilter: ['style', 'hidden', 'class'],
    childList: true,
    subtree: true,
  });
  update();
  return observer;
}
