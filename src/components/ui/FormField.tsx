"use client";

import React, { useId } from "react";

interface FormFieldProps {
  label: string;
  name?: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

function isNativeField(
  child: React.ReactNode,
): child is React.ReactElement<React.HTMLAttributes<HTMLElement>> {
  return (
    React.isValidElement(child) &&
    ["input", "select", "textarea"].includes(child.type as string)
  );
}

export function FormField({
  label,
  name,
  error,
  hint,
  required,
  children,
  className = "",
}: FormFieldProps) {
  const id = useId();
  const fieldChildren = React.Children.toArray(children);
  const nativeField = fieldChildren.find(isNativeField);
  const fieldId = nativeField?.props.id ?? name ?? `${id}-field`;
  const messageId = `${id}-message`;

  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label
        htmlFor={fieldId}
        className="text-[0.75rem] font-medium tracking-[-0.005em] text-slate-600"
      >
        {label}
        {required && (
          <span className="ml-0.5 text-[#C8102E]" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {fieldChildren.map((child) => {
        if (!isNativeField(child) || child !== nativeField) return child;
        const describedBy = [
          child.props["aria-describedby"],
          error || hint ? messageId : null,
        ]
          .filter(Boolean)
          .join(" ");
        return React.cloneElement(child, {
          id: fieldId,
          "aria-required": child.props["aria-required"] ?? required,
          "aria-invalid": error ? true : child.props["aria-invalid"],
          "aria-describedby": describedBy || undefined,
        });
      })}
      {hint && !error && (
        <p id={messageId} className="text-[0.6875rem] leading-relaxed text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={messageId}
          className="text-[0.6875rem] font-medium text-[#991B1B]"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
