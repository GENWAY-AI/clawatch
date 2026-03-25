import { SessionDetail, SessionSummary } from "./sessions.js";

/**
 * Session complexity classification
 */
export type SessionComplexity = "simple" | "moderate" | "complex";

export interface SessionClassification {
  complexity: SessionComplexity;
  confidence: number; // 0-1
  reasons: string[];
  metrics: {
    avgMessageLength: number;
    toolCallsPerMessage: number;
    userTurnCount: number;
    hasFileOperations: boolean;
    hasCodeExecution: boolean;
    hasSubAgents: boolean;
  };
}

/**
 * Classify a session's complexity based on heuristics
 */
export function classifySession(session: SessionDetail): SessionClassification {
  const metrics = analyzeSessionMetrics(session);
  const { complexity, confidence, reasons } = determineComplexity(metrics);

  return {
    complexity,
    confidence,
    reasons,
    metrics,
  };
}

function analyzeSessionMetrics(session: SessionDetail) {
  const messages = session.messages;
  const userMessages = messages.filter((m) => m.role === "user");
  const assistantMessages = messages.filter((m) => m.role === "assistant");

  // Calculate average message length
  const totalChars = userMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  const avgMessageLength = userMessages.length > 0 ? totalChars / userMessages.length : 0;

  // Count tool calls
  const toolCalls = assistantMessages.filter((m) => m.toolName).length;
  const toolCallsPerMessage = assistantMessages.length > 0 ? toolCalls / assistantMessages.length : 0;

  // Check for specific tool types
  const toolNames = new Set(messages.filter((m) => m.toolName).map((m) => m.toolName!));
  const hasFileOperations = ["read", "write", "edit", "Read", "Write", "Edit"].some((t) => toolNames.has(t));
  const hasCodeExecution = toolNames.has("exec");
  const hasSubAgents = toolNames.has("sessions_spawn") || toolNames.has("subagents");

  return {
    avgMessageLength,
    toolCallsPerMessage,
    userTurnCount: userMessages.length,
    hasFileOperations,
    hasCodeExecution,
    hasSubAgents,
  };
}

function determineComplexity(
  metrics: ReturnType<typeof analyzeSessionMetrics>
): { complexity: SessionComplexity; confidence: number; reasons: string[] } {
  const reasons: string[] = [];
  let complexityScore = 0; // 0-10 scale

  // Factor 1: Message complexity (0-3 points)
  if (metrics.avgMessageLength < 100) {
    complexityScore += 0;
    reasons.push("Short, simple messages");
  } else if (metrics.avgMessageLength < 300) {
    complexityScore += 1.5;
    reasons.push("Moderate message length");
  } else {
    complexityScore += 3;
    reasons.push("Detailed, complex messages");
  }

  // Factor 2: Tool usage (0-3 points)
  if (metrics.toolCallsPerMessage < 0.3) {
    complexityScore += 0;
    reasons.push("Minimal tool usage");
  } else if (metrics.toolCallsPerMessage < 1.0) {
    complexityScore += 1.5;
    reasons.push("Moderate tool usage");
  } else {
    complexityScore += 3;
    reasons.push("Heavy tool usage");
  }

  // Factor 3: Advanced features (0-4 points)
  if (metrics.hasSubAgents) {
    complexityScore += 2;
    reasons.push("Uses sub-agent orchestration");
  }
  if (metrics.hasCodeExecution) {
    complexityScore += 1;
    reasons.push("Executes code/commands");
  }
  if (metrics.hasFileOperations) {
    complexityScore += 1;
    reasons.push("File operations");
  }

  // Determine complexity based on score
  let complexity: SessionComplexity;
  let confidence: number;

  if (complexityScore <= 3) {
    complexity = "simple";
    confidence = 1 - complexityScore / 6; // Higher confidence for very simple tasks
  } else if (complexityScore <= 6) {
    complexity = "moderate";
    confidence = 0.7; // Moderate confidence in the middle range
  } else {
    complexity = "complex";
    confidence = 0.5 + (complexityScore - 6) / 8; // Higher confidence for very complex tasks
  }

  return { complexity, confidence: Math.min(confidence, 0.95), reasons };
}

/**
 * Quick classification from summary (no message details needed)
 * Less accurate but faster for bulk analysis
 */
export function classifySessionSummary(session: SessionSummary): SessionComplexity {
  // Heuristic based on available summary data
  const hasMultipleModels = session.costByModel.length > 1;
  const highMessageCount = session.messageCount > 20;
  const longDuration = session.duration > 30 * 60 * 1000; // > 30 min
  const expensiveModel = session.model.includes("opus") || session.model.includes("gpt-4");

  if (hasMultipleModels || highMessageCount || longDuration) {
    return "complex";
  }

  if (session.messageCount > 5 || expensiveModel) {
    return "moderate";
  }

  return "simple";
}
