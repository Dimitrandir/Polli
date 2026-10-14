import { useId } from "react";

/*
 * SIS Esthetics Hair logo, traced from the salon's artwork into plain vector paths
 * (no fonts needed). Everything is drawn in currentColor and the letters are cut out,
 * so the logo follows the text colour and works on light and dark backgrounds.
 * Coordinates are in the original artwork's pixels: the square is 206 wide.
 */
const MARK = "M0 0H206V205H0ZM38 30L81 30L81 74L67 74L67 45L53 45L53 88L81 88L81 174L38 174L38 117L53 117L53 160L67 160L67 102L38 102ZM96 30H110V174H96ZM124 30L167 30L167 74L153 74L153 45L139 45L139 88L167 88L167 174L124 174L124 117L139 117L139 160L153 160L153 102L124 102Z";
const ESTHETICS = "M12.55 217.45H1.45V239.55H12.55M1.45 228.5H11.55M36.76 220.32C35.19 218.11 33.36 217.45 31 217.45C27.59 217.45 25.24 219.66 25.24 223.2C25.24 227.17 28.12 227.84 31 228.5C34.14 229.16 37.03 230.27 37.03 234.03C37.03 237.56 34.41 239.55 31 239.55C28.38 239.55 26.15 238.22 24.84 235.79M47 217.45H62M54.5 217.45V241M72.45 216V241M84.55 216V241M72.45 228.5H84.55M108.55 217.45H98.45V239.55H108.55M98.45 228.5H107.55M120 217.45H134M127 217.45V241M146 216V241M178.98 221.21C177.07 218.78 174.2 217.45 170.96 217.45C165.03 217.45 160.45 222.31 160.45 228.5C160.45 234.69 165.03 239.55 170.96 239.55C174.2 239.55 177.07 238.22 178.98 235.79M203.76 220.32C202.19 218.11 200.36 217.45 198 217.45C194.59 217.45 192.24 219.66 192.24 223.2C192.24 227.17 195.12 227.84 198 228.5C201.14 229.16 204.03 230.27 204.03 234.03C204.03 237.56 201.41 239.55 198 239.55C195.38 239.55 193.15 238.22 191.84 235.79";
const HAIR = "M78 260V278M88 260V278M78 269H88M91.6 278L99 260L106.4 278M93.56 272.24H104.44M112 260V278M120 278V261H123.32A4.18 4.18 0 0 1 123.32 269.36H120M122.32 269.36L128 278";

type Props = { className?: string; title?: string };

function Wordmark({ maskId }: { maskId: string }) {
  return (
    <>
      <path fill="none" stroke="currentColor" strokeWidth={2.9} d={ESTHETICS} />
      <mask id={maskId}>
        <rect y="252" width="206" height="35" fill="#fff" />
        <path fill="none" stroke="#000" strokeWidth={2} d={HAIR} />
      </mask>
      <rect y="252" width="206" height="35" fill="currentColor" mask={`url(#${maskId})`} />
    </>
  );
}

/** The square "SIS" mark on its own. */
export function LogoMark({ className, title = "SIS Esthetics Hair" }: Props) {
  return (
    <svg viewBox="0 0 206 205" role="img" aria-label={title} className={className}>
      <path fill="currentColor" fillRule="evenodd" d={MARK} />
    </svg>
  );
}

/** The full logo as on the salon's artwork: mark, "ESTHETICS" and the "HAIR" bar. */
export function Logo({ className, title = "SIS Esthetics Hair" }: Props) {
  const maskId = useId();
  return (
    <svg viewBox="0 0 206 287" role="img" aria-label={title} className={className}>
      <path fill="currentColor" fillRule="evenodd" d={MARK} />
      <Wordmark maskId={maskId} />
    </svg>
  );
}

/** Mark with the wordmark beside it, for the site header. */
export function LogoInline({ className, title = "SIS Esthetics Hair" }: Props) {
  const maskId = useId();
  return (
    <svg viewBox="0 0 632 205" role="img" aria-label={title} className={className}>
      <path fill="currentColor" fillRule="evenodd" d={MARK} />
      <g transform="translate(240 -375.4) scale(1.9)">
        <Wordmark maskId={maskId} />
      </g>
    </svg>
  );
}
