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
      className={`flex min-w-0 flex-col gap-2 [&>:is(input,select,textarea)]:min-h-12 [&>:is(input,select,textarea)]:w-full [&>:is(input,select,textarea)]:rounded-xl [&>:is(input,select,textarea)]:border-[2.5px] [&>:is(input,select,textarea)]:border-black [&>:is(input,select,textarea)]:bg-white [&>:is(input,select,textarea)]:px-4 [&>:is(input,select,textarea)]:py-3 [&>:is(input,select,textarea)]:text-base [&>:is(input,select,textarea)]:font-medium [&>:is(input,select,textarea)]:text-black [&>:is(input,select,textarea)]:shadow-[3px_3px_0px_0px_#000] [&>:is(input,select,textarea)]:focus:shadow-[4px_4px_0px_0px_#059669] [&>:is(input,select,textarea)]:focus:outline-none sm:[&>:is(input,select,textarea)]:text-sm ${className}`}
    >
      <label htmlFor={fieldId} className="text-xs font-extrabold uppercase tracking-wider text-black">
        {label}
        {required && (
          <span className="ml-1 text-rose-600 font-black" aria-hidden="true">
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
        <p id={messageId} className="text-xs font-medium text-zinc-600">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={messageId}
          className="text-xs font-bold text-rose-950 bg-rose-200 border-2 border-black rounded-lg px-3 py-1.5 shadow-[2px_2px_0px_0px_#000]"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
