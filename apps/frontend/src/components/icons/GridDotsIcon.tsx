interface GridDotsIconProps {
  className?: string;
  size?: number;
}

export function GridDotsIcon({ className, size }: GridDotsIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      aria-hidden="true"
      width={size}
      height={size}
      className={className}
      style={size ? { width: size, height: size } : undefined}
    >
      <circle cx="8" cy="4" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="8" cy="20" r="2" />
      <circle cx="16" cy="4" r="2" />
      <circle cx="16" cy="12" r="2" />
      <circle cx="16" cy="20" r="2" />
    </svg>
  );
}
