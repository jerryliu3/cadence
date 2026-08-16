"use client";

interface StaticJourneyPosterProps {
  mobileSrc: string;
  desktopSrc: string;
  visible: boolean;
}

export function StaticJourneyPoster({
  mobileSrc,
  desktopSrc,
  visible,
}: StaticJourneyPosterProps) {
  return (
    <picture
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden transition-opacity duration-300 ease-[var(--motion-ease-standard)] ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      data-journey-layer="poster"
    >
      <source media="(max-width: 767px)" srcSet={mobileSrc} />
      <img
        src={desktopSrc}
        alt=""
        className="h-full w-full object-cover"
        decoding="async"
      />
    </picture>
  );
}
