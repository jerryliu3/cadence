"use client";

import { StateCard } from "@/components/ui/state-card";

interface LoadingCardProps {
  title: string;
  description?: string;
}

export function LoadingCard({ title, description }: LoadingCardProps) {
  return <StateCard layout="card" title={title} description={description} />;
}
