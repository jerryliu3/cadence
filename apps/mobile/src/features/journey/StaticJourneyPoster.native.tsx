import { Image, StyleSheet } from "react-native";

interface StaticJourneyPosterProps {
  sourceUri: string;
  visible: boolean;
}

export function StaticJourneyPoster({
  sourceUri,
  visible,
}: StaticJourneyPosterProps) {
  return (
    <Image
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      source={{ uri: sourceUri }}
      style={[StyleSheet.absoluteFill, styles.image, { opacity: visible ? 1 : 0 }]}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  image: {
    zIndex: -10,
  },
});
