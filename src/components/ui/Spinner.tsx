import React from 'react';

/**
 * Inline loading indicator.
 * Renders a single <span> so it stays valid inside <p> and <button>
 * (see Spinner.test.ts), and inherits `currentColor`.
 */
export function Spinner({
  size = 'md',
  className = '',
}: {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClasses = {
    xs: 'size-3',
    sm: 'size-3.5',
    md: 'size-4.5',
    lg: 'size-7',
  };

  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent align-[-0.125em] motion-reduce:animate-none ${sizeClasses[size]} ${className}`}
    >
      <span className="sr-only">Loading...</span>
    </span>
  );
}
