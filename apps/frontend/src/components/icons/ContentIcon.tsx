interface ContentIconProps {
  className?: string;
  size?: number;
}

export function ContentIcon({ className, size }: ContentIconProps) {
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
      <path d="m18 21h-8c-1.7 0-3-1.3-3-3v-8c0-1.7 1.3-3 3-3h8c1.7 0 3 1.3 3 3v8c0 1.7-1.3 3-3 3zm-8-12c-.6 0-1 .4-1 1v8c0 .6.4 1 1 1h8c.6 0 1-.4 1-1v-8c0-.6-.4-1-1-1z" />
      <path d="m4 5c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1c0 .6-.4 1-1 1z" />
      <path d="m8 5c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1c0 .6-.4 1-1 1z" />
      <path d="m12 5c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1c0 .6-.4 1-1 1z" />
      <path d="m16 5c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1c0 .6-.4 1-1 1z" />
      <path d="m4 9c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1c0 .6-.4 1-1 1z" />
      <path d="m4 13c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1c0 .6-.4 1-1 1z" />
      <path d="m4 17c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1c0 .6-.4 1-1 1z" />
    </svg>
  );
}
