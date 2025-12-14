import React from 'react';

type Props = {
  isMuted?: boolean;
  size?: number;
  color?: string;
  className?: string;
};

export default function SpeakerIcon({ isMuted = true, size = 18, color = 'currentColor', className }: Props) {
  if (isMuted) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className={className}>
        <path d="M5 9v6h4l5 4V5L9 9H5z" fill={color} />
        <path d="M18.5 12a4.5 4.5 0 0 0-1.2-3L15 10.3a2.5 2.5 0 0 1 .7 1.7 2.5 2.5 0 0 1-.7 1.7l2.3 1.3a4.5 4.5 0 0 0 1.2-3z" fill={color} opacity="0.2" />
        <line x1="19.5" y1="4.5" x2="4.5" y2="19.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className={className}>
      <path d="M5 9v6h4l5 4V5L9 9H5z" fill={color} />
      <path d="M16.5 7.5a6 6 0 0 1 0 9" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.5 4.5a9 9 0 0 1 0 15" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}
