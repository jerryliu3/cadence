"use client";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface GoalsSurfaceLoadingCardProps {
  title: string;
  description: string;
}

export function GoalsSurfaceLoadingCard({
  title,
  description,
}: GoalsSurfaceLoadingCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
