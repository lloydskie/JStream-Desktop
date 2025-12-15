import React from 'react';

export default function RowScroller({ className = 'row-scroll', children, scrollAmount, scrollerRef: externalRef, disableWheel, showPager, onPageChange, itemCount, itemsPerPage }: { className?: string, children?: React.ReactNode, scrollAmount?: number, scrollerRef?: React.RefObject<HTMLDivElement>, disableWheel?: boolean, showPager?: boolean, onPageChange?: (pageIndex:number, pageCount:number) => void, itemCount?: number, itemsPerPage?: number }) {
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const scrollerRef = (externalRef && (externalRef as React.RefObject<HTMLDivElement>).current !== undefined) ? externalRef as React.RefObject<HTMLDivElement> : innerRef;
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);
  const [pageCount, setPageCount] = React.useState(0);
  const [pageIndex, setPageIndex] = React.useState(0);

  React.useEffect(() => {
    const el = (scrollerRef as any).current;
    if (!el) return;
    const update = () => {
      setCanScrollLeft(el.scrollLeft > 8);
      setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 8);
      let pages = 0;
      let idx = 0;
      if (itemsPerPage && itemCount) {
        pages = Math.max(1, Math.ceil(itemCount / itemsPerPage));
        // estimate page width using first child width + gap
        const first = el.querySelector(':scope > *') as HTMLElement | null;
        const gap = parseFloat(getComputedStyle(el).gap || '0') || 0;
        const childW = first ? first.getBoundingClientRect().width : (el.clientWidth / itemsPerPage);
        const pageW = (childW + gap) * itemsPerPage;
        const singleSetWidth = (childW + gap) * itemCount;
        // normalize scrollLeft into single-set space so pager reflects logical pages
        const effectiveScroll = ((el.scrollLeft % singleSetWidth) + singleSetWidth) % singleSetWidth;
        idx = Math.min(pages - 1, Math.max(0, Math.round(effectiveScroll / pageW)));
      } else {
        // compute pages based on clientWidth
        pages = Math.max(1, Math.ceil(el.scrollWidth / el.clientWidth));
        idx = Math.min(pages - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)));
      }
      setPageCount(pages);
      setPageIndex(idx);
      try { if (typeof onPageChange === 'function') onPageChange(idx, pages); } catch (e) {}
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { try { el.removeEventListener('scroll', update); } catch (e) {} window.removeEventListener('resize', update); };
  }, [scrollerRef.current, children]);

  React.useEffect(() => {
    if (disableWheel) return; // don't attach wheel handler when disabled
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      try {
        if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) {
          el.scrollBy({ left: ev.deltaY, behavior: 'auto' });
          ev.preventDefault();
        }
      } catch (e) { }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => { try { el.removeEventListener('wheel', onWheel); } catch (e) {} };
  }, [disableWheel]);

  function doScroll(delta: number) {
    const el = (scrollerRef as any).current;
    if (!el) return;
    let amt = Math.max(el.clientWidth * 0.8, scrollAmount || 320);
    if (itemsPerPage) {
      // compute width of one child including gap
      const first = el.querySelector(':scope > *') as HTMLElement | null;
      const gap = parseFloat(getComputedStyle(el).gap || '0') || 0;
      const childW = first ? first.getBoundingClientRect().width : (el.clientWidth / (itemsPerPage || 1));
      amt = (childW + gap) * (itemsPerPage || 1);
    }
    el.scrollBy({ left: delta < 0 ? -amt : amt, behavior: 'smooth' });
  }

  return (
    <div className="row-scroll-wrapper" style={{ position: 'relative' }}>
      <button disabled={!canScrollLeft} className={`continue-scroll-button left ${!canScrollLeft ? 'disabled' : ''}`} onClick={() => doScroll(-1)} aria-label="Scroll left">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <div className={className} ref={scrollerRef}>
        {children}
      </div>
      {showPager && pageCount > 1 ? (
        <div className="row-page-indicator" aria-hidden>
          <div className="page-count">{pageIndex + 1}/{pageCount}</div>
          <div className="dots">
            {Array.from({ length: pageCount }).map((_, i) => (
              <span key={i} className={`dot ${i === pageIndex ? 'active' : ''}`}/>
            ))}
          </div>
        </div>
      ) : null}
      <button disabled={!canScrollRight} className={`continue-scroll-button right ${!canScrollRight ? 'disabled' : ''}`} onClick={() => doScroll(1)} aria-label="Scroll right">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
}
