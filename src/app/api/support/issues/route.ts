import { z } from "zod";
import {
  ApiRouteError,
  apiSuccessResponse,
  parseJsonBody,
  requireAuthenticatedRequestContext,
  withRoute,
} from "@/lib/api/route";
import { getServerEnv } from "@/lib/env";
import { reportError } from "@/lib/observability/report-error";

export const runtime = "nodejs";

const DEFAULT_ISSUE_RECIPIENT = "3jerryliu@gmail.com";
const DEFAULT_ISSUE_SENDER = "Cadence <onboarding@resend.dev>";
const RESEND_API_URL = "https://api.resend.com/emails";

const reportIssueSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(5000),
});

type EmailDelivery = "sent" | "not_configured" | "failed";

interface IssueReportInsertRow {
  id: string;
}

interface IssueReportInsertClient {
  from: (table: "issue_reports") => {
    insert: (value: {
      reporter_id: string;
      title: string;
      description: string;
    }) => {
      select: (columns: string) => {
        single: () => Promise<{
          data: IssueReportInsertRow | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

async function sendIssueEmail({
  title,
  description,
  issueId,
  reporterId,
}: {
  title: string;
  description: string;
  issueId: string;
  reporterId: string;
}): Promise<EmailDelivery> {
  const env = getServerEnv();
  if (!env.RESEND_API_KEY) {
    return "not_configured";
  }

  const toEmail = env.REPORT_ISSUES_TO_EMAIL?.trim() || DEFAULT_ISSUE_RECIPIENT;
  const fromEmail = env.REPORT_ISSUES_FROM_EMAIL?.trim() || DEFAULT_ISSUE_SENDER;
  const subject = `[Cadence] Issue report: ${title}`;
  const body = [
    `Issue ID: ${issueId}`,
    `Reporter ID: ${reporterId}`,
    "",
    `Title: ${title}`,
    "",
    "Description:",
    description,
  ].join("\n");

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject,
        text: body,
      }),
    });
    if (!response.ok) {
      const responseText = await response.text();
      reportError(new Error("Resend issue email failed"), {
        status: response.status,
        responseText,
        issueId,
      });
      return "failed";
    }
    return "sent";
  } catch (error) {
    reportError(error, { issueId });
    return "failed";
  }
}

export async function POST(request: Request) {
  return withRoute(async ({ correlationId }) => {
    const { userId, supabase } = await requireAuthenticatedRequestContext(
      request,
      {
        unauthorizedMessage: "Sign in to submit an issue report.",
      }
    );
    const payload = await parseJsonBody({
      request,
      maxBytes: 64 * 1024,
      schema: reportIssueSchema,
    });

    const issueReportsClient = supabase as unknown as IssueReportInsertClient;
    const { data, error } = await issueReportsClient
      .from("issue_reports")
      .insert({
        reporter_id: userId,
        title: payload.title,
        description: payload.description,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      throw new ApiRouteError(
        500,
        "issue_report_create_failed",
        "Issue report could not be saved.",
        {
          cause: error?.message ?? "missing_issue_id",
        }
      );
    }

    const emailDelivery = await sendIssueEmail({
      title: payload.title,
      description: payload.description,
      issueId: data.id,
      reporterId: userId,
    });

    return apiSuccessResponse(
      {
        schemaVersion: "1",
        issueId: data.id,
        emailDelivery,
      },
      correlationId,
      201
    );
  });
}
