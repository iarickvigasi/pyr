// AI engine — implemented in E6 (AI Communication Engine).
// Model-agnostic LLM abstraction: routes calls to Anthropic (primary) or OpenAI (fallback).
// Business rule: ALL AI-generated content is a draft — never auto-send without human approval.
// The engine logs token usage and cost on every call. Temperature: 0.3–0.5 for factual
// responses, 0.6–0.7 for creative guest replies.
// See: providers/anthropic.ts, providers/openai.ts, draft-generator.ts, context-builder.ts
export {};
