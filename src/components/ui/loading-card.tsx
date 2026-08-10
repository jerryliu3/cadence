"use client";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface LoadingCardProps {
  title: string;
  description?: string;
}

export function LoadingCard({ title, description }: LoadingCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
    </Card>
  );
}
