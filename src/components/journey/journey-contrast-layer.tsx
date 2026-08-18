"use client";

interface JourneyContrastLayerProps {
  opacity: number;
  position: "full" | "top" | "bottom" | "center";
}

function gradientForPosition(position: JourneyContrastLayerProps["position"]) {
  switch (position) {
    case "top":
      return "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 45%, rgba(0,0,0,0.05) 100%)";
    case "bottom":
      return "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.22) 55%, rgba(0,0,0,0.58) 100%)";
    case "center":
      return "radial-gradient(circle at 50% 45%, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.45) 100%)";
    default:
      return "linear-gradient(180deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.35) 100%)";
  }
}

export function JourneyContrastLayer({
  opacity,
  position,
}: JourneyContrastLayerProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
      data-journey-layer="contrast"
      style={{
        backgroundImage: gradientForPosition(position),
        opacity,
      }}
    />
  );
}
