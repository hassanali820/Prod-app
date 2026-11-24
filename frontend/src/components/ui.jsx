// Small shared UI pieces.
export function Card({ className = "", children }) {
  return <section className={`bg-white rounded-xl shadow p-6 ${className}`}>{children}</section>;
}

const VARIANTS = {
  primary: "bg-amber-600 hover:bg-amber-700 text-white",
  dark: "bg-slate-800 hover:bg-slate-700 text-white",
  success: "bg-emerald-600 hover:bg-emerald-700 text-white",
  danger: "bg-red-600 hover:bg-red-700 text-white",
  outline: "border border-slate-300 hover:bg-slate-50"
};

export function Button({ variant = "primary", className = "", ...props }) {
  return (
    <button
      className={`w-full font-semibold py-2.5 rounded-lg disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, ...props }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600">{label}</span>
      <input className="w-full border rounded-lg px-3 py-2 text-sm" {...props} />
    </label>
  );
}

export function Spinner() {
  return <div className="spinner" />;
}

export function CenteredStatus({ title, hint, children }) {
  return (
    <Card className="flex flex-col items-center gap-4 text-center p-8">
      {children}
      <p className="font-medium">{title}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

const FLASH_STYLES = {
  info: "bg-sky-50 text-sky-800 border-sky-200",
  error: "bg-red-50 text-red-800 border-red-200",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200"
};

export function Flash({ message }) {
  if (!message) return null;
  return <div className={`mb-4 rounded-lg px-4 py-3 text-sm border ${FLASH_STYLES[message.type]}`}>{message.text}</div>;
}
