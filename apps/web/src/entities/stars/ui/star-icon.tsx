import { useId } from "react";

const STAR_PATH =
  "M12.413 20.3615L7.4621 23.3945C6.9473 23.7098 6.27431 23.5482 5.95894 23.0333C5.80491 22.7819 5.75899 22.4789 5.8316 22.1931L6.598 19.1766C6.87465 18.0876 7.61981 17.1774 8.63265 16.6911L14.0338 14.0979C14.2857 13.977 14.3918 13.6749 14.2709 13.4231C14.173 13.2191 13.9516 13.105 13.7287 13.1436L7.71644 14.1845C6.49429 14.3961 5.24099 14.0586 4.29035 13.2619L2.39103 11.6702C1.92831 11.2825 1.86756 10.593 2.25533 10.1303C2.44393 9.90522 2.71514 9.7655 3.00787 9.74259L8.81084 9.28846C9.2208 9.25637 9.57808 8.99693 9.73546 8.61702L11.9741 3.21299C12.2052 2.65524 12.8447 2.39039 13.4024 2.62145C13.6702 2.7324 13.883 2.94518 13.9939 3.21299L16.2326 8.61702C16.39 8.99693 16.7473 9.25637 17.1572 9.28846L22.9921 9.74509C23.594 9.79219 24.0437 10.3183 23.9966 10.9202C23.974 11.2097 23.837 11.4783 23.616 11.6668L19.166 15.4605C18.8527 15.7275 18.7161 16.148 18.8124 16.5482L20.1805 22.2314C20.3218 22.8184 19.9605 23.4087 19.3735 23.55C19.0915 23.6179 18.794 23.5709 18.5467 23.4194L13.5551 20.3615C13.2046 20.1468 12.7634 20.1468 12.413 20.3615Z";

/** Золотая звезда tweb (starIconSvg в public/js/components/starsDialog.js): градиент, обводка — у стопки. */
export function StarIcon({ size = 18, stroke = false, className }: { size?: number; stroke?: boolean; className?: string }) {
  const id = useId();
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 26 25" fill="none" aria-hidden="true">
      {stroke ? <path d={STAR_PATH} stroke="var(--color-surface, #fff)" strokeWidth="3.6" /> : null}
      <path fillRule="evenodd" d={STAR_PATH} fill={`url(#${id}a)`} stroke={`url(#${id}b)`} strokeWidth="1.22" />
      <defs>
        <linearGradient id={`${id}a`} x1="0.09" y1="28.15" x2="41.4" y2="-18.4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FDEB32" />
          <stop offset="0.44" stopColor="#FEBD04" />
          <stop offset="1" stopColor="#D75902" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="27.06" y1="3.61" x2="9.33" y2="15.83" gradientUnits="userSpaceOnUse">
          <stop stopColor="#DB5A00" />
          <stop offset="1" stopColor="#FF9145" />
        </linearGradient>
      </defs>
    </svg>
  );
}
