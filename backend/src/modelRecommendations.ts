import { SessionDetail, SessionSummary } from "./sessions.js";
import { classifySession, classifySessionSummary, SessionComplexity } from "./modelClassifier.js";

export interface ModelRecommendation {
  currentModel: string;
  recommendedModel: string;
  complexity: SessionComplexity;
  confidence: number;
  reasons: string[];
  potentialSavings: {
    costUsd: number;
    percentage: number;
  };
}

export interface BulkRecommendationSummary {
  totalSessions: number;
  potentialTotalSavings: number;
  recommendations: Array<{
    sessionId: string;
    title: string;
    recommendation: ModelRecommendation;
  }>;
}

/**
 * Model cost estimates (rough estimates per 1M tokens)
 * Based on typical pricing as of March 2024
 */
const MODEL_COSTS = {
  // Anthropic
  "claude-opus": { input: 15.0, output: 75.0 },
  "claude-sonnet": { input: 3.0, output: 15.0 },
  "claude-haiku": { input: 0.25, output: 1.25 },

  // OpenAI
  "gpt-4": { input: 30.0, output: 60.0 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },

  // Gemini
  "gemini-pro": { input: 0.5, output: 1.5 },
  "gemini-flash": { input: 0.075, output: 0.3 },

  // Default fallback
  unknown: { input: 5.0, output: 15.0 },
};

function normalizeModelName(model: string): keyof typeof MODEL_COSTS {
  const lower = model.toLowerCase();
  if (lower.includes("opus")) return "claude-opus";
  if (lower.includes("sonnet")) return "claude-sonnet";
  if (lower.includes("haiku")) return "claude-haiku";
  if (lower.includes("gpt-4-turbo") || lower.includes("gpt-4o")) return "gpt-4-turbo";
  if (lower.includes("gpt-4")) return "gpt-4";
  if (lower.includes("gpt-3.5")) return "gpt-3.5-turbo";
  if (lower.includes("gemini") && lower.includes("flash")) return "gemini-flash";
  if (lower.includes("gemini")) return "gemini-pro";
  return "unknown";
}

function estimateSessionCost(tokenCount: number, model: string): number {
  const normalized = normalizeModelName(model);
  const costs = MODEL_COSTS[normalized];
  // Rough estimate: assume 50/50 input/output split
  const avgCost = (costs.input + costs.output) / 2;
  return (tokenCount / 1_000_000) * avgCost;
}

function mapComplexityToModel(
  complexity: SessionComplexity,
  currentModel: string
): { model: string; reason: string } {
  const normalized = normalizeModelName(currentModel);

  switch (complexity) {
    case "simple":
      // Recommend cheapest tier
      if (normalized === "claude-opus" || normalized === "claude-sonnet") {
        return { model: "claude-haiku", reason: "Simple tasks work great with Haiku" };
      }
      if (normalized === "gpt-4" || normalized === "gpt-4-turbo") {
        return { model: "gpt-3.5-turbo", reason: "GPT-3.5 handles simple queries well" };
      }
      if (normalized === "gemini-pro") {
        return { model: "gemini-flash", reason: "Gemini Flash is fast and cheap for simple tasks" };
      }
      break;

    case "moderate":
      // Recommend mid-tier
      if (normalized === "claude-opus") {
        return { model: "claude-sonnet", reason: "Sonnet balances cost and capability" };
      }
      if (normalized === "gpt-4") {
        return { model: "gpt-4-turbo", reason: "GPT-4 Turbo is faster and cheaper" };
      }
      if (normalized === "claude-haiku") {
        return { model: "claude-haiku", reason: "Already using an efficient model" };
      }
      if (normalized === "gpt-3.5-turbo") {
        return { model: "gpt-3.5-turbo", reason: "Already cost-optimized" };
      }
      break;

    case "complex":
      // Keep current model or recommend upgrade if on cheapest tier
      if (normalized === "claude-haiku" || normalized === "gpt-3.5-turbo") {
        return { model: currentModel, reason: "Consider upgrading for complex tasks, but testing recommended" };
      }
      return { model: currentModel, reason: "Complex task — current model is appropriate" };
  }

  // Default: no change
  return { model: currentModel, reason: "Current model matches task complexity" };
}

/**
 * Generate recommendation for a session (requires full detail)
 */
export function recommendModelForSession(session: SessionDetail): ModelRecommendation {
  // Edge case: no messages or no model info
  if (!session.model || session.messageCount === 0) {
    return {
      currentModel: session.model || "unknown",
      recommendedModel: session.model || "unknown",
      complexity: "simple",
      confidence: 0,
      reasons: ["Insufficient data to analyze this session"],
      potentialSavings: { costUsd: 0, percentage: 0 },
    };
  }

  const classification = classifySession(session);
  const recommendation = mapComplexityToModel(classification.complexity, session.model);

  // Edge case: zero cost session — no savings to compute
  if (session.costUsd === 0 || session.tokenCount === 0) {
    return {
      currentModel: session.model,
      recommendedModel: recommendation.model,
      complexity: classification.complexity,
      confidence: classification.confidence,
      reasons: [...classification.reasons, recommendation.reason],
      potentialSavings: { costUsd: 0, percentage: 0 },
    };
  }

  // Calculate potential savings
  const currentCost = session.costUsd;
  const estimatedNewCost = estimateSessionCost(session.tokenCount, recommendation.model);
  const savings = Math.max(0, currentCost - estimatedNewCost);
  const savingsPercentage = currentCost > 0 ? (savings / currentCost) * 100 : 0;

  return {
    currentModel: session.model,
    recommendedModel: recommendation.model,
    complexity: classification.complexity,
    confidence: classification.confidence,
    reasons: [...classification.reasons, recommendation.reason],
    potentialSavings: {
      costUsd: Math.round(savings * 10000) / 10000, // Round to 4 decimal places
      percentage: Math.round(savingsPercentage * 10) / 10,
    },
  };
}

/**
 * Generate recommendations for recent sessions (uses summary data only)
 * Faster but less accurate than full detail analysis
 */
export function recommendForRecentSessions(
  sessions: SessionSummary[],
  limit: number = 20
): BulkRecommendationSummary {
  const recentSessions = sessions
    .filter((s) => s.status === "active" || s.status === "idle")
    .slice(0, limit);

  const recommendations = recentSessions
    .map((session) => {
      const complexity = classifySessionSummary(session);
      const recommendation = mapComplexityToModel(complexity, session.model);

      const currentCost = session.costUsd;
      const estimatedNewCost = estimateSessionCost(session.tokenCount, recommendation.model);
      const savings = Math.max(0, currentCost - estimatedNewCost);
      const savingsPercentage = currentCost > 0 ? (savings / currentCost) * 100 : 0;

      return {
        sessionId: session.id,
        title: session.title,
        recommendation: {
          currentModel: session.model,
          recommendedModel: recommendation.model,
          complexity,
          confidence: 0.6, // Lower confidence without full detail
          reasons: [recommendation.reason],
          potentialSavings: {
            costUsd: savings,
            percentage: savingsPercentage,
          },
        },
      };
    })
    .filter((r) => r.recommendation.potentialSavings.costUsd > 0.001); // Filter out negligible savings

  const totalSavings = recommendations.reduce((sum, r) => sum + r.recommendation.potentialSavings.costUsd, 0);

  return {
    totalSessions: recentSessions.length,
    potentialTotalSavings: totalSavings,
    recommendations,
  };
}
