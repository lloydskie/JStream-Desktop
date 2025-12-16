import React from 'react';

export default function RowScroller({ className = 'row-scroll', children, scrollAmount, scrollerRef: externalRef, disableWheel = true, showPager, onPageChange, itemCount, itemsPerPage }: { className?: string, children?: React.ReactNode, scrollAmount?: number, scrollerRef?: React.RefObject<HTMLDivElement>, disableWheel?: boolean, showPager?: boolean, onPageChange?: (pageIndex:number, pageCount:number) => void, itemCount?: number, itemsPerPage?: number }) {
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
        // compute effective items-per-page based on available width and button overlays
        const rootStyles = getComputedStyle(document.documentElement);
        const btnRaw = rootStyles.getPropertyValue('--scroller-button-width') || '';
        const btnWidth = parseFloat(btnRaw) || 96;
        const first = el.querySelector(':scope > *') as HTMLElement | null;
        const gap = parseFloat(getComputedStyle(el).gap || '0') || 0;
        const childW = first ? first.getBoundingClientRect().width : (el.clientWidth / itemsPerPage);
        // available width for items excludes the left/right overlay button areas (they are overlaid)
        const available = Math.max(0, el.clientWidth - (btnWidth * 2));
        const candidatePerPage = Math.max(1, Math.floor((available + gap) / (childW + gap)));
        const effectiveItemsPerPage = Math.max(1, Math.min(itemsPerPage || candidatePerPage, candidatePerPage));

        // Compute logical page starts so the last page is always full by overlapping previous page if needed.
        const P = effectiveItemsPerPage;
        const N = itemCount;
        const pagesArr: number[] = [];
        const pagesRaw = Math.max(1, Math.ceil(N / P));
        for (let i = 0; i < pagesRaw; i++) {
          pagesArr.push(i * P);
        }
        // If last page would be incomplete, adjust its start so it contains the final P items
        const lastCount = N - (pagesRaw - 1) * P;
        if (lastCount > 0 && lastCount < P && pagesRaw > 1) {
          pagesArr[pagesArr.length - 1] = Math.max(0, N - P);
        }

        // compute page pixel positions
        const pagePositions = pagesArr.map(s => s * (childW + gap));
        // account for container padding when mapping scrollLeft to positions
        const paddingLeft = parseFloat(getComputedStyle(el).paddingLeft || '0') || 0;
        // find nearest page index from current scrollLeft
        const distances = pagePositions.map(pos => Math.abs((el.scrollLeft) - (pos - paddingLeft)));
        pages = Math.max(1, pagesArr.length);
        idx = distances.length ? distances.indexOf(Math.min(...distances)) : 0;
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
    // compute page-sized scroll target so JS paging matches CSS snap pages
    const first = el.querySelector(':scope > *') as HTMLElement | null;
    const gap = parseFloat(getComputedStyle(el).gap || '0') || 0;
    const childW = first ? first.getBoundingClientRect().width : (el.clientWidth / (itemsPerPage || 1));
    const rootStyles = getComputedStyle(document.documentElement);
    const btnRaw = rootStyles.getPropertyValue('--scroller-button-width') || '';
    const btnWidth = parseFloat(btnRaw) || 96;
    const available = Math.max(0, el.clientWidth - (btnWidth * 2));
    const candidatePerPage = Math.max(1, Math.floor((available + gap) / (childW + gap)));
    const effectiveItemsPerPage = Math.max(1, Math.min(itemsPerPage || candidatePerPage, candidatePerPage));
    const P = effectiveItemsPerPage;
    const N = itemCount || 0;
    const pagesRaw = Math.max(1, Math.ceil(N / P));
    const starts: number[] = [];
    for (let i = 0; i < pagesRaw; i++) starts.push(i * P);
    const lastCount = N - (pagesRaw - 1) * P;
    if (lastCount > 0 && lastCount < P && pagesRaw > 1) starts[starts.length - 1] = Math.max(0, N - P);
    const paddingLeft = parseFloat(getComputedStyle(el).paddingLeft || '0') || 0;
    const pagePositions = starts.map(s => s * (childW + gap));
    // decide target page based on current pageIndex
    let targetPage = pageIndex + (delta > 0 ? 1 : -1);
    targetPage = Math.max(0, Math.min(starts.length - 1, targetPage));
    const targetScroll = Math.max(0, Math.round(pagePositions[targetPage] - paddingLeft));
    el.scrollTo({ left: targetScroll, behavior: 'smooth' });
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
