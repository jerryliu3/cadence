import { handlePlannerReset } from "../schedule/route";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handlePlannerReset(request);
}
