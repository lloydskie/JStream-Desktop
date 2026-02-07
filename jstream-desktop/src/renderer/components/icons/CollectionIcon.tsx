import React from 'react';

export default function CollectionIcon({ size = 20, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Stack of layered rectangles representing a collection */}
      <rect x="2" y="6" width="16" height="14" rx="2" stroke={color} strokeWidth="1.8" fill="none" />
      <path d="M6 6V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2" stroke={color} strokeWidth="1.8" fill="none" />
    </svg>
  );
}
