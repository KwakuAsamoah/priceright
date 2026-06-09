type PriceRightLogoIconProps = {
  size?: number;
  className?: string;
};

export default function PriceRightLogoIcon({ size = 36, className = 'app-brand-logo' }: PriceRightLogoIconProps) {
  return (
    <img
      className={className}
      src="/priceright-icon.png"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
