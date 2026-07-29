function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function Avatar({
  name,
  color,
  image,
  size = 44,
  online,
  className = "",
}: {
  name: string;
  color: string;
  image?: string;
  size?: number;
  online?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={name}
          className="h-full w-full rounded-full object-cover select-none"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-medium text-white select-none"
          style={{ background: color, fontSize: size * 0.4 }}
        >
          {initials(name) || "?"}
        </div>
      )}
      {online && (
        <span
          className="absolute rounded-full bg-success ring-2 ring-surface"
          style={{ width: size * 0.28, height: size * 0.28, right: -1, bottom: -1 }}
        />
      )}
    </div>
  );
}
