export function attachGlobalScrollCapture() {
  if (typeof window === 'undefined' || !window.document) return () => {};

  function isScrollable(el: HTMLElement, axis: 'x' | 'y') {
    const style = getComputedStyle(el);
    if (axis === 'y') {
      const overflowY = style.overflowY;
      const can = el.scrollHeight > el.clientHeight && (/(auto|scroll|overlay|visible)/).test(overflowY);
      return can;
    } else {
      const overflowX = style.overflowX;
      const can = el.scrollWidth > el.clientWidth && (/(auto|scroll|overlay|visible)/).test(overflowX);
      return can;
    }
  }

  function handler(ev: WheelEvent) {
    try {
      // Determine element under pointer
      const x = ev.clientX;
      const y = ev.clientY;
      let el = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!el) return;

      // If pointer is over the hero banner, don't intercept wheel events here;
      // allow default page scrolling so users can scroll while hovering the hero.
      try {
        const hero = (el && el.closest) ? el.closest('.hero-banner') as HTMLElement | null : null;
        if (hero) return;
      } catch (e) { /* ignore */ }

      // Only intercept wheel events when the pointer is over known scroller areas
      // (carousels/rows/grids). If not over one of these, allow the browser
      // to perform normal page scrolling.
      const scrollerAncestor = el.closest && (el.closest('.row-scroll, .continue-scroll, .movie-grid, .detail-sections, .search-dropdown, .row-scroll-wrapper') as HTMLElement | null);
      if (!scrollerAncestor) {
        return;
      }

      // Walk up the DOM looking for a scrollable container that can consume the wheel
      while (el && el !== document.documentElement) {
        // Prefer horizontal scrollers (e.g., carousels) if they exist
        // Do not translate vertical wheel into horizontal scrolling here.
        // Horizontal scroll should be controlled only by the row's left/right buttons.

        // If vertical scrollable and deltaY present
        if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX) && isScrollable(el, 'y')) {
          const canScrollUp = el.scrollTop > 0;
          const canScrollDown = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
          if ((ev.deltaY < 0 && canScrollUp) || (ev.deltaY > 0 && canScrollDown)) {
            el.scrollTop += ev.deltaY;
            ev.preventDefault();
            return;
          }
        }

        // If horizontal scrollable and deltaX present, handle it
        if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY) && isScrollable(el, 'x')) {
          const canScrollLeft = el.scrollLeft > 0;
          const canScrollRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
          if ((ev.deltaX < 0 && canScrollLeft) || (ev.deltaX > 0 && canScrollRight)) {
            el.scrollLeft += ev.deltaX;
            ev.preventDefault();
            return;
          }
        }

        el = el.parentElement as HTMLElement | null;
      }

      // nothing to handle locally — allow default
    } catch (e) {
      // swallow any unexpected errors to avoid breaking the app
      console.warn('scrollCapture error', e);
    }
  }

  document.addEventListener('wheel', handler, { passive: false });
  return () => document.removeEventListener('wheel', handler as EventListener);
}
