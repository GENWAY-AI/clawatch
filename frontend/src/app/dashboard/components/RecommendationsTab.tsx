"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { BulkRecommendationSummary, SessionComplexity } from "@/lib/types";

const complexityConfig: Record<SessionComplexity, { color: string; label: string }> = {
  simple: { color: "bg-green-500/10 text-green-400 border-green-500/20", label: "Simple" },
  moderate: { color: "bg-blue-500/10 text-blue-400 border-blue-500/20", label: "Moderate" },
  complex: { color: "bg-purple-500/10 text-purple-400 border-purple-500/20", label: "Complex" },
};

function formatModel(model: string): string {
  // Shorten common model names for display
  if (model.includes("claude-opus")) return "Opus";
  if (model.includes("claude-sonnet")) return "Sonnet";
  if (model.includes("claude-haiku")) return "Haiku";
  if (model.includes("gpt-4-turbo") || model.includes("gpt-4o")) return "GPT-4 Turbo";
  if (model.includes("gpt-4")) return "GPT-4";
  if (model.includes("gpt-3.5")) return "GPT-3.5";
  if (model.includes("gemini-flash")) return "Gemini Flash";
  if (model.includes("gemini")) return "Gemini Pro";
  return model;
}

interface RecommendationsTabProps {
  summary: BulkRecommendationSummary | null;
  loading: boolean;
}

export function RecommendationsTab({ summary, loading }: RecommendationsTabProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {/* Summary skeleton */}
        <Card>
          <CardHeader className="pb-3">
            <div className="h-5 bg-zinc-800 rounded w-48 animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="h-10 bg-zinc-800 rounded w-32 animate-pulse" />
              <div className="h-4 bg-zinc-800 rounded w-56 animate-pulse" />
            </div>
          </CardContent>
        </Card>

        {/* Recommendations skeleton */}
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4 animate-pulse">
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-zinc-800 rounded w-64" />
                    <div className="h-3 bg-zinc-800 rounded w-48" />
                  </div>
                  <div className="h-4 bg-zinc-800 rounded w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!summary || summary.recommendations.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="text-4xl mb-3">💡</div>
          <h3 className="text-lg font-medium text-muted-foreground mb-2">No Recommendations Available</h3>
          <p className="text-sm text-muted-foreground/70">
            {summary?.totalSessions === 0
              ? "No active or idle sessions found to analyze."
              : "All sessions are already using optimal models for their complexity."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalSavings = summary.potentialTotalSavings;
  const avgSavings = totalSavings / summary.recommendations.length;

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <span>💡</span>
            Optimization Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-bold text-emerald-400">
                ${totalSavings.toFixed(4)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Total potential savings
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {summary.recommendations.length}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Sessions with savings
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-400">
                ${avgSavings.toFixed(4)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Avg savings per session
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              💡 <strong>Tip:</strong> Switching to recommended models can reduce costs by{" "}
              <span className="text-emerald-400 font-medium">
                {summary.recommendations.length > 0
                  ? Math.round(
                      (summary.recommendations.reduce((sum, r) => sum + r.recommendation.potentialSavings.percentage, 0) /
                        summary.recommendations.length)
                    )
                  : 0}%
              </span>{" "}
              on average while maintaining quality for each task&apos;s complexity level.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations List */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">
          Recommendations by Session ({summary.recommendations.length})
        </h3>
        <div className="grid gap-3">
          {summary.recommendations.map((rec) => {
            const { recommendation } = rec;
            const isSameModel = recommendation.currentModel === recommendation.recommendedModel;

            return (
              <Card key={rec.sessionId} className="hover:border-emerald-500/30 transition-colors">
                <CardContent className="p-4">
                  {/* Desktop layout */}
                  <div className="hidden md:flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-medium text-foreground truncate">
                          {rec.title}
                        </h4>
                        <Badge
                          variant="outline"
                          className={`text-xs px-2 py-0 ${complexityConfig[recommendation.complexity].color}`}
                        >
                          {complexityConfig[recommendation.complexity].label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-mono">
                          {formatModel(recommendation.currentModel)}
                        </span>
                        <span className="text-muted-foreground/50">→</span>
                        <span className={`font-mono ${isSameModel ? "text-muted-foreground/70" : "text-emerald-400"}`}>
                          {formatModel(recommendation.recommendedModel)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <div className="text-sm font-semibold text-emerald-400">
                          {isSameModel ? "—" : `$${recommendation.potentialSavings.costUsd.toFixed(4)}`}
                        </div>
                        {!isSameModel && (
                          <div className="text-xs text-muted-foreground">
                            {recommendation.potentialSavings.percentage.toFixed(1)}% savings
                          </div>
                        )}
                      </div>
                      <div
                        className="size-2 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            recommendation.confidence > 0.8
                              ? "#10b981"
                              : recommendation.confidence > 0.5
                              ? "#3b82f6"
                              : "#6b7280",
                        }}
                        title={`Confidence: ${(recommendation.confidence * 100).toFixed(0)}%`}
                      />
                    </div>
                  </div>

                  {/* Mobile layout */}
                  <div className="md:hidden space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-medium text-foreground flex-1 min-w-0">
                        {rec.title}
                      </h4>
                      <Badge
                        variant="outline"
                        className={`text-xs px-2 py-0 shrink-0 ${complexityConfig[recommendation.complexity].color}`}
                      >
                        {complexityConfig[recommendation.complexity].label}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="font-mono">
                          {formatModel(recommendation.currentModel)}
                        </span>
                        <span className="text-muted-foreground/50">→</span>
                        <span className={`font-mono ${isSameModel ? "text-muted-foreground/70" : "text-emerald-400"}`}>
                          {formatModel(recommendation.recommendedModel)}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-emerald-400">
                          {isSameModel ? "—" : `$${recommendation.potentialSavings.costUsd.toFixed(4)}`}
                        </div>
                        {!isSameModel && (
                          <div className="text-[10px] text-muted-foreground">
                            {recommendation.potentialSavings.percentage.toFixed(1)}%
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Reasons (same for both layouts) */}
                  {recommendation.reasons.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/30">
                      <ul className="space-y-1">
                        {recommendation.reasons.map((reason, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                            <span className="text-emerald-400/60 mt-0.5">•</span>
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
