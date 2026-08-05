import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

interface UntypedRpcClient {
  rpc(
    functionName: string,
    parameters?: Record<string, unknown>
  ): Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

export function callUntypedAdminRpc(
  admin: AdminClient,
  functionName: string,
  parameters: Record<string, unknown>
) {
  const rpcClient = admin as unknown as UntypedRpcClient;
  return rpcClient.rpc(functionName, parameters);
}
