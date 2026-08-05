import type { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;
type PlannerFunctionName = keyof Database["public"]["Functions"];

export function callAdminRpc<FunctionName extends PlannerFunctionName>(
  admin: AdminClient,
  functionName: FunctionName,
  parameters: Database["public"]["Functions"][FunctionName]["Args"]
) {
  return admin.rpc(functionName, parameters);
}
