import { unitEntryKey } from "@cadence/shared/planner/reorder-preview-entries";
import { useEffect, useRef } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme";
import type { LayoutRect } from "./drop-targets";
import { measureNodeInWindow } from "./drop-targets";
import type { PlannerWorkUnit } from "@cadence/shared/planner/context";

const TOUCH_PRESS_TO_DRAG_DELAY_MS = 180;

export function DraggableSession({
  unit,
  day,
  label,
  onPress,
  onDrop,
  onLayoutWindow,
  onUnmount,
}: {
  unit: PlannerWorkUnit;
  day: string;
  label: string;
  onPress: () => void;
  onDrop: (input: {
    unit: PlannerWorkUnit;
    sourceDay: string;
    x: number;
    y: number;
  }) => void;
  onLayoutWindow: (entryKey: string, day: string, rect: LayoutRect) => void;
  onUnmount: (entryKey: string) => void;
}) {
  const theme = useTheme();
  const viewRef = useRef<View>(null);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const zIndex = useSharedValue(0);
  const entryKey = unitEntryKey(unit);

  useEffect(
    () => () => {
      onUnmount(entryKey);
    },
    [entryKey, onUnmount]
  );

  const finishDrop = (x: number, y: number) => {
    onDrop({ unit, sourceDay: day, x, y });
  };

  const pan = Gesture.Pan()
    .activateAfterLongPress(TOUCH_PRESS_TO_DRAG_DELAY_MS)
    .onStart(() => {
      scale.value = withSpring(1.05);
      zIndex.value = 20;
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      runOnJS(finishDrop)(event.absoluteX, event.absoluteY);
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      scale.value = withSpring(1);
      zIndex.value = 0;
    })
    .onFinalize(() => {
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      scale.value = withSpring(1);
      zIndex.value = 0;
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: zIndex.value,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        ref={viewRef}
        style={animatedStyle}
        onLayout={() => {
          measureNodeInWindow(viewRef.current, (rect) => {
            onLayoutWindow(entryKey, day, rect);
          });
        }}
      >
        <Pressable
          onPress={onPress}
          style={[
            styles.chip,
            {
              backgroundColor: theme.colors.secondary,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={{ color: theme.colors.foreground }}>{label}</Text>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
