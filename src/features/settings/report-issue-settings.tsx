"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage, postJson } from "@/lib/api/client";

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 5000;

type ReportIssueResponse = {
  issueId: string;
  emailDelivery: "sent" | "not_configured" | "failed";
};

export function ReportIssueSettings() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const canSubmit = useMemo(
    () =>
      trimmedTitle.length > 0 &&
      trimmedTitle.length <= TITLE_MAX &&
      trimmedDescription.length > 0 &&
      trimmedDescription.length <= DESCRIPTION_MAX &&
      !submitting,
    [submitting, trimmedDescription.length, trimmedTitle.length]
  );

  const submitIssue = async () => {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    try {
      const payload = await postJson<ReportIssueResponse>("/api/support/issues", {
        title: trimmedTitle,
        description: trimmedDescription,
      });
      if (payload.emailDelivery === "sent") {
        toast.success("Issue submitted. Email sent to support.");
      } else if (payload.emailDelivery === "not_configured") {
        toast.success("Issue submitted. Email delivery is not configured yet.");
      } else {
        toast.success("Issue submitted. We saved it even though email delivery failed.");
      }
      setTitle("");
      setDescription("");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Issue could not be submitted."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Share bugs or UX friction with a short title and enough context to reproduce.
      </p>
      <label className="block space-y-1.5">
        <Label htmlFor="report-issue-title">Issue title</Label>
        <Input
          id="report-issue-title"
          value={title}
          maxLength={TITLE_MAX}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Ex: Calendar drag drops into the wrong day"
        />
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="report-issue-description">Issue description</Label>
        <Textarea
          id="report-issue-description"
          value={description}
          maxLength={DESCRIPTION_MAX}
          onChange={(event) => setDescription(event.target.value)}
          rows={8}
          placeholder="What happened, what you expected, and steps to reproduce."
        />
      </label>
      <Button
        type="button"
        onClick={() => void submitIssue()}
        disabled={!canSubmit}
      >
        {submitting ? "Submitting..." : "Submit issue"}
      </Button>
    </div>
  );
}
