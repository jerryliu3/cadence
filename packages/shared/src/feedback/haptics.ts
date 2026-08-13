export type LightPressHaptics = () => boolean;

let lightPressHaptics: LightPressHaptics = () => false;

export function configureLightPressHaptics(impl: LightPressHaptics) {
  lightPressHaptics = impl;
}

export function triggerLightPressFeedback(): boolean {
  return lightPressHaptics();
}
