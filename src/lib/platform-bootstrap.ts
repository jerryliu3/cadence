import { configureWebTabDataCache } from "@/lib/cache/tab-data-cache";
import { configureWebHaptics } from "@/lib/feedback/haptics";

export function bootstrapWebPlatform() {
  configureWebHaptics();
  configureWebTabDataCache();
}
