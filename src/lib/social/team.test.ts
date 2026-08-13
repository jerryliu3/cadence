import { describe, expect, it } from "vitest";
import { requireTeamPartner, resolveActiveTeamPartner } from "@/lib/social/team";

const PARTNER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ID = "33333333-3333-4333-8333-333333333333";

function supabaseWithTeamState(data: unknown, error: { message: string } | null = null) {
  return {
    rpc: async () => ({ data, error }),
  } as never;
}

const activeRow = {
  team_id: "44444444-4444-4444-8444-444444444444",
  status: "active" as const,
  partner_id: PARTNER_ID,
  partner_username: "partner",
  partner_display_name: "Partner",
  partner_avatar_url: null,
  invite_message: null,
  invited_at: "2026-08-01T00:00:00Z",
  accepted_at: "2026-08-01T00:00:00Z",
  closed_at: null,
  is_incoming: false,
};

describe("requireTeamPartner", () => {
  it("returns the active partner when the subject matches", async () => {
    const partner = await requireTeamPartner({
      supabase: supabaseWithTeamState([activeRow]),
      subjectUserId: PARTNER_ID,
    });
    expect(partner.partnerId).toBe(PARTNER_ID);
    expect(partner.teamId).toBe(activeRow.team_id);
  });

  it("throws 403 when there is no active team", async () => {
    await expect(
      requireTeamPartner({
        supabase: supabaseWithTeamState([]),
        subjectUserId: PARTNER_ID,
      })
    ).rejects.toMatchObject({
      status: 403,
      code: "not_team_partner",
    });
  });

  it("throws 403 when the subject is not the active partner", async () => {
    await expect(
      requireTeamPartner({
        supabase: supabaseWithTeamState([activeRow]),
        subjectUserId: OTHER_ID,
      })
    ).rejects.toMatchObject({
      status: 403,
      code: "not_team_partner",
    });
  });
});

describe("resolveActiveTeamPartner", () => {
  it("maps team-state RPC failures", async () => {
    await expect(
      resolveActiveTeamPartner({
        supabase: supabaseWithTeamState(null, { message: "boom" }),
      })
    ).rejects.toMatchObject({
      status: 500,
      code: "team_state_unavailable",
    });
  });
});
