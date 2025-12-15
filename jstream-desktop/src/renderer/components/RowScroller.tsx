import React from 'react';

export default function RowScroller({ className = 'row-scroll', children, scrollAmount, scrollerRef: externalRef }: { className?: string, children?: React.ReactNode, scrollAmount?: number, scrollerRef?: React.RefObject<HTMLDivElement> }) {
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const scrollerRef = (externalRef && (externalRef as React.RefObject<HTMLDivElement>).current !== undefined) ? externalRef as React.RefObject<HTMLDivElement> : innerRef;
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  React.useEffect(() => {
    const el = (scrollerRef as any).current;
    if (!el) return;
    const update = () => {
      setCanScrollLeft(el.scrollLeft > 8);
      setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 8);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { try { el.removeEventListener('scroll', update); } catch (e) {} window.removeEventListener('resize', update); };
  }, [scrollerRef.current, children]);

  React.useEffect(() => {
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
  }, []);

  function doScroll(delta: number) {
    const el = (scrollerRef as any).current;
    if (!el) return;
    const amt = Math.max(el.clientWidth * 0.8, scrollAmount || 320);
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
      <button disabled={!canScrollRight} className={`continue-scroll-button right ${!canScrollRight ? 'disabled' : ''}`} onClick={() => doScroll(1)} aria-label="Scroll right">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
}
