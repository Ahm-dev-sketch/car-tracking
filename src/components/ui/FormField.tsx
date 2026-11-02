import React from 'react';

interface FormFieldProps {
  label: string;
  name?: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  name,
  error,
  hint,
  required,
  children,
  className = '',
}: FormFieldProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label
        htmlFor={name}
        className="text-xs font-semibold uppercase tracking-wider text-zinc-700"
      >
        {label}
        {required && <span className="text-rose-500 ml-1" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-zinc-500">{hint}</p>}
      {error && <p className="text-xs text-rose-600 font-medium" role="alert">{error}</p>}
    </div>
  );
}
