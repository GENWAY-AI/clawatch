export function ClaWatchLogo({ size = "md" }: { size?: "sm" | "md" | "lg" | "xl" }) {
  const sizeClasses = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-3xl",
    xl: "text-5xl sm:text-6xl",
  };

  return (
    <span className={`${sizeClasses[size]} font-bold tracking-tight`}>
      <span className="text-white">Cla</span>
      <span
        className="bg-gradient-to-r from-white via-emerald-300 to-emerald-400 bg-clip-text text-transparent"
      >
        W
      </span>
      <span className="text-emerald-400">atch</span>
    </span>
  );
}

export function ClaWatchIcon({ className = "size-7" }: { className?: string }) {
  return (
    <div className={`${className} rounded-lg bg-emerald-500 flex items-center justify-center`}>
      <svg
        className="w-[60%] h-[60%] text-white"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.573-3.007-9.963-7.178z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    </div>
  );
}
