import { unitEntryKey } from "@cadence/shared/planner/reorder-preview-entries";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Pressable, StyleSheet, Text } from "react-native";
import { getMobileTheme } from "../../theme";
import type { MobilePlannerWorkUnit } from "./use-planner-context";

const TOUCH_PRESS_TO_DRAG_DELAY_MS = 180;

export function DraggableSession({
  unit,
  day,
  label,
  onPress,
  onDrop,
  onLayoutWindow,
}: {
  unit: MobilePlannerWorkUnit;
  day: string;
  label: string;
  onPress: () => void;
  onDrop: (input: {
    unit: MobilePlannerWorkUnit;
    sourceDay: string;
    x: number;
    y: number;
  }) => void;
  onLayoutWindow: (entryKey: string, day: string, rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
}) {
  const theme = getMobileTheme();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const zIndex = useSharedValue(0);

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
        style={animatedStyle}
        onLayout={(event) => {
          const node = event.target as unknown as {
            measureInWindow?: (
              callback: (x: number, y: number, width: number, height: number) => void
            ) => void;
          };
          node.measureInWindow?.((x, y, width, height) => {
            onLayoutWindow(unitEntryKey(unit), day, { x, y, width, height });
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
