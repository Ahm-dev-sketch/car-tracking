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
    <div
      className={`flex min-w-0 flex-col gap-1.5 [&>:is(input,select,textarea)]:min-h-12 [&>:is(input,select,textarea)]:w-full [&>:is(input,select,textarea)]:rounded-lg [&>:is(input,select,textarea)]:border [&>:is(input,select,textarea)]:border-slate-200 [&>:is(input,select,textarea)]:bg-white [&>:is(input,select,textarea):not([class*="pl-"])]:pl-3.5 [&>:is(input,select,textarea):not([class*="pr-"])]:pr-3.5 [&>:is(input,select,textarea)]:py-3 [&>:is(input,select,textarea)]:text-base [&>:is(input,select,textarea)]:text-slate-900 [&>:is(input,select,textarea)]:transition-colors [&>:is(input,select,textarea)]:focus:border-brand-500 [&>:is(input,select,textarea)]:focus:outline-none [&>:is(input,select,textarea)]:focus:ring-3 [&>:is(input,select,textarea)]:focus:ring-brand-500/15 sm:[&>:is(input,select,textarea)]:text-sm ${className}`}
    >
      <label htmlFor={fieldId} className="text-xs font-semibold text-slate-700">
        {label}
        {required && (
          <span className="ml-0.5 text-brand-500" aria-hidden="true">
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
        <p id={messageId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={messageId}
          className="text-xs font-medium text-danger-700"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
