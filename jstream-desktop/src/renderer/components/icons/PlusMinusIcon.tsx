import React from 'react';

type Props = {
  isMinus?: boolean;
  size?: number;
  color?: string;
  className?: string;
};

export default function PlusMinusIcon({ isMinus = false, size = 18, color = 'currentColor', className }: Props) {
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
      {isMinus ? (
        <rect x="4" y="11" width="16" height="2" rx="1" fill={color} />
      ) : (
        <>
          <rect x="11" y="4" width="2" height="16" rx="1" fill={color} />
          <rect x="4" y="11" width="16" height="2" rx="1" fill={color} />
        </>
      )}
    </svg>
  );
}
