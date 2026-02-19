// OpenAI API adapter — implemented in E6.
// Fallback LLM provider used when Anthropic is unavailable.
// Wraps the OpenAI SDK with the same model-agnostic interface as providers/anthropic.ts.
// Business rule: never route AI calls directly — always go through ai-engine.ts which
// handles provider selection, retry, and fallback logic.
export {};
