import type { InputHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Field({ label, hint, error, id, className = '', ...props }: FieldProps) {
  const fieldId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="font-mono text-xs uppercase tracking-wider text-slate-soft">
        {label}
      </label>
      <input
        id={fieldId}
        className={`rounded-md border bg-ink-soft px-3.5 py-2.5 text-paper placeholder:text-slate-soft/60 focus:outline-none focus:ring-2 focus:ring-amber ${
          error ? 'border-red' : 'border-paper-dim/25'
        } ${className}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        {...props}
      />
      {error ? (
        <p id={`${fieldId}-error`} className="text-xs text-red">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-xs text-slate-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
