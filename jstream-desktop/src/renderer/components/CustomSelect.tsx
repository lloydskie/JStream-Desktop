import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Option = { value: string | number; label: string };

export default function CustomSelect({
  value,
  options,
  onChange,
  placeholder,
  id,
  disabled = false
}: {
  value?: string | number | null;
  options: Option[];
  onChange: (v: string | number) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}){
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);

  useEffect(()=>{
    function onDoc(e: MouseEvent){
      const target = e.target as Node;
      // if click is inside the toggle wrapper or inside the portal menu, don't close
      if (ref.current && ref.current.contains(target)) return;
      if (menuRef.current && menuRef.current.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  },[]);

  const selected = options.find(o => String(o.value) === String(value));

  function handleKey(e: React.KeyboardEvent){
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); }
    if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div className="dropdown" ref={ref} style={{display:'inline-block'}}>
      <button id={id} ref={toggleRef} type="button" className="dropdown-toggle" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={()=>{
        setOpen(v=>{
          const next = !v;
          if (next && toggleRef.current) {
            const r = toggleRef.current.getBoundingClientRect();
            const pad = 8;
            // Measure widest option by creating a hidden measurement node in the document
            let measuredWidth = r.width; // start with toggle width as baseline
            try {
              const meas = document.createElement('div');
              meas.style.position = 'fixed';
              meas.style.left = '0';
              meas.style.top = '0';
              meas.style.visibility = 'hidden';
              meas.style.pointerEvents = 'none';
              meas.style.display = 'inline-block';
              meas.style.font = getComputedStyle(toggleRef.current!).font || '';
              meas.className = 'dropdown-menu';
              document.body.appendChild(meas);
              // create items
              for (const o of options) {
                const it = document.createElement('div');
                it.className = 'dropdown-item';
                it.style.display = 'inline-block';
                it.style.whiteSpace = 'nowrap';
                it.textContent = String(o.label);
                meas.appendChild(it);
              }
              // measure
              measuredWidth = Math.max(measuredWidth, meas.scrollWidth + 24); // add small padding
              document.body.removeChild(meas);
            } catch (e) { /* ignore measurement failures */ }

            // clamp measured width to viewport with padding
            const maxW = Math.min(720, window.innerWidth - pad * 4);
            const width = Math.min(measuredWidth, maxW);

            // clamp left so the menu stays within the viewport
            let left = r.left + window.scrollX;
            if (left + width + pad > window.innerWidth + window.scrollX) {
              left = Math.max(pad + window.scrollX, window.innerWidth + window.scrollX - width - pad);
            }

            // measure menu height to decide whether to place below or above toggle
            let measuredHeight = 0;
            try {
              // create measurement node again to get height (we removed earlier)
              const meas2 = document.createElement('div');
              meas2.style.position = 'fixed';
              meas2.style.left = '0';
              meas2.style.top = '0';
              meas2.style.visibility = 'hidden';
              meas2.style.pointerEvents = 'none';
              meas2.style.display = 'inline-block';
              meas2.style.font = getComputedStyle(toggleRef.current!).font || '';
              meas2.className = 'dropdown-menu';
              document.body.appendChild(meas2);
              for (const o of options) {
                const it = document.createElement('div');
                it.className = 'dropdown-item';
                it.style.display = 'block';
                it.style.whiteSpace = 'nowrap';
                it.textContent = String(o.label);
                meas2.appendChild(it);
              }
              measuredHeight = Math.min(meas2.scrollHeight, Math.round(window.innerHeight * 0.7));
              document.body.removeChild(meas2);
            } catch (e) { /* ignore measurement failures */ }

            // decide whether to open below or above the toggle depending on space
            const spaceBelow = window.innerHeight - r.bottom;
            const spaceAbove = r.top;
            let top = r.bottom + window.scrollY + 6;
            if (measuredHeight && measuredHeight > spaceBelow && spaceAbove > spaceBelow) {
              // open above toggle
              top = Math.max(8 + window.scrollY, r.top + window.scrollY - measuredHeight - 6);
            }

            setMenuStyle({ top, left, width, maxHeight: Math.min(measuredHeight || Math.round(window.innerHeight * 0.44), Math.round(window.innerHeight * 0.72)) });
          }
          return next;
        });
      }} onKeyDown={handleKey}>
        <span style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{selected ? selected.label : (placeholder || 'Select')}</span>
      </button>
      {open && menuStyle && createPortal(
        <div ref={menuRef} className="dropdown-menu" role="listbox" style={{ position: 'fixed', ...menuStyle }}>
          {options.map(o => (
            <div key={String(o.value)} className="dropdown-item" role="option" aria-selected={String(o.value) === String(value)} onMouseDown={(e)=>{ e.preventDefault(); /* prevent focus jump */ }} onClick={()=>{ onChange(o.value); setOpen(false); }}>
              {o.label}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
