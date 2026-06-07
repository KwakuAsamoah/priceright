type PriceRightLogoIconProps = {
  size?: number;
  className?: string;
};

export default function PriceRightLogoIcon({ size = 36, className = 'app-brand-logo' }: PriceRightLogoIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="prIconOrange" x1="8" y1="4" x2="28" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fb923c" />
          <stop offset="1" stopColor="#ea580c" />
        </linearGradient>
      </defs>

      <rect width="36" height="36" rx="10" fill="url(#prIconOrange)" />
      <rect x="0.75" y="0.75" width="34.5" height="34.5" rx="9.25" stroke="rgba(255, 255, 255, 0.22)" />

      <g transform="translate(18 18.5) skewX(-8)">
        <text
          x="0"
          y="5"
          textAnchor="middle"
          fill="#ffffff"
          fontFamily="'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          fontWeight="800"
          fontSize="15"
          letterSpacing="-1.1"
        >
          PR
        </text>
      </g>
    </svg>
  );
}
