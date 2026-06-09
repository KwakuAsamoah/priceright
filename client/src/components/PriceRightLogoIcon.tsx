type PriceRightLogoIconProps = {
  size?: number;
  className?: string;
};

const brandIconUrl = `${import.meta.env.BASE_URL}priceright-icon.png`;

export default function PriceRightLogoIcon({ size = 36, className = 'app-brand-logo' }: PriceRightLogoIconProps) {
  return (
    <img
      className={className}
      src={brandIconUrl}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
