"use client";

import { Star } from "lucide-react";
import { MotionConfig, motion, useReducedMotion } from "motion/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import type { ViewportRectSnapshot } from "@/lib/xp/events";

interface XpRewardFlight {
  sourceRect: ViewportRectSnapshot;
  targetRect: ViewportRectSnapshot;
}

interface RewardBurst extends XpRewardFlight {
  id: number;
}

interface XpRewardContextValue {
  celebrate: (flight: XpRewardFlight) => void;
}

const XpRewardContext = createContext<XpRewardContextValue>({
  celebrate: () => undefined,
});

const particles = [
  { delay: 0, scatterX: -18, scatterY: -18, size: 13, rotate: 120 },
  { delay: 0.035, scatterX: 12, scatterY: -24, size: 10, rotate: -100 },
  { delay: 0.07, scatterX: 24, scatterY: -8, size: 12, rotate: 150 },
  { delay: 0.105, scatterX: -24, scatterY: 3, size: 9, rotate: -130 },
  { delay: 0.14, scatterX: 5, scatterY: 12, size: 11, rotate: 180 },
] as const;

function center(rect: ViewportRectSnapshot) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function XpRewardLayer({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const nextIdRef = useRef(1);
  const [bursts, setBursts] = useState<RewardBurst[]>([]);

  const celebrate = useCallback(
    (flight: XpRewardFlight) => {
      if (reduceMotion) {
        return;
      }

      const id = nextIdRef.current;
      nextIdRef.current += 1;
      setBursts((current) => [...current, { ...flight, id }]);
    },
    [reduceMotion]
  );

  const removeBurst = useCallback((id: number) => {
    setBursts((current) => current.filter((burst) => burst.id !== id));
  }, []);

  return (
    <XpRewardContext.Provider value={{ celebrate }}>
      {children}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
        data-motion="xp-reward-overlay"
      >
        {bursts.flatMap((burst) => {
          const source = center(burst.sourceRect);
          const target = center(burst.targetRect);
          return particles.map((particle, particleIndex) => (
            <motion.span
              key={`${burst.id}-${particleIndex}`}
              data-reward-burst={burst.id}
              className="fixed block text-amber-400"
              style={{
                left: source.x - particle.size / 2,
                top: source.y - particle.size / 2,
                width: particle.size,
                height: particle.size,
              }}
              initial={{ opacity: 0, scale: 0.45, rotate: 0, x: 0, y: 0 }}
              animate={{
                opacity: [0, 1, 1, 0],
                scale: [0.45, 1.15, 0.9, 0.35],
                rotate: [
                  0,
                  particle.rotate * 0.3,
                  particle.rotate * 0.7,
                  particle.rotate,
                ],
                x: [
                  0,
                  particle.scatterX,
                  particle.scatterX * 0.6,
                  target.x - source.x,
                ],
                y: [
                  0,
                  particle.scatterY,
                  particle.scatterY * 0.6,
                  target.y - source.y,
                ],
              }}
              transition={{
                duration: 0.56,
                delay: particle.delay,
                ease: [0.2, 0.8, 0.2, 1],
                times: [0, 0.22, 0.72, 1],
              }}
              onAnimationComplete={
                particleIndex === particles.length - 1
                  ? () => removeBurst(burst.id)
                  : undefined
              }
            >
              <Star className="size-full fill-current" />
            </motion.span>
          ));
        })}
      </div>
    </XpRewardContext.Provider>
  );
}

export function XpRewardProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <XpRewardLayer>{children}</XpRewardLayer>
    </MotionConfig>
  );
}

export function useXpReward() {
  return useContext(XpRewardContext);
}
