import React from 'react';

type Props = {
  size?: number;
  color?: string;
  className?: string;
};

export default function InfoIcon({ size = 18, color = 'currentColor', className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.5" fill="transparent" />
      <rect x="11" y="10" width="2" height="6" rx="1" fill={color} />
      <rect x="11" y="7" width="2" height="2" rx="1" fill={color} />
    </svg>
  );
}
