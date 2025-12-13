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

      // Walk up the DOM looking for a scrollable container that can consume the wheel
      while (el && el !== document.documentElement) {
        // Prefer horizontal scrollers (e.g., carousels) if they exist
        const isRow = el.classList && el.classList.contains && el.classList.contains('row-scroll');
        if (isRow && isScrollable(el, 'x')) {
          // translate vertical delta into horizontal scroll
          el.scrollLeft += ev.deltaY;
          ev.preventDefault();
          return;
        }

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
