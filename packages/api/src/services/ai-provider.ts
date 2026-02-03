import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

// ============================================================================
// Types
// ============================================================================

export type AIProvider = "openai" | "anthropic" | "openrouter";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: AIProvider;
  cost: number;
  durationMs: number;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface AIProviderConfig {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  openrouterApiKey?: string;
}

interface AIClients {
  openai: OpenAI | null;
  anthropic: Anthropic | null;
  openrouter: OpenAI | null;
}

// ============================================================================
// Constants
// ============================================================================

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 4096;

const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-20250514",
  openrouter: "openai/gpt-4o-mini",
};

// Pricing per 1M tokens (as of 2024)
const PRICING: Record<AIProvider, Record<string, { input: number; output: number }>> = {
  openai: {
    "gpt-4o": { input: 2.5, output: 10 },
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "gpt-4-turbo": { input: 10, output: 30 },
  },
  anthropic: {
    "claude-sonnet-4-20250514": { input: 3, output: 15 },
    "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
    "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
  },
  openrouter: {
    "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
    "openai/gpt-4o": { input: 2.5, output: 10 },
    "anthropic/claude-3-5-sonnet": { input: 3, output: 15 },
    "anthropic/claude-3-haiku": { input: 0.25, output: 1.25 },
  },
};

const DEFAULT_COST_PER_MILLION = { input: 3, output: 15 };

// ============================================================================
// Pure Functions
// ============================================================================

/** Calculate the cost of an API call based on token usage */
const calculateCost = (
  provider: AIProvider,
  model: string,
  inputTokens: number,
  outputTokens: number
): number => {
  const modelPricing = PRICING[provider]?.[model];
  const { input, output } = modelPricing ?? DEFAULT_COST_PER_MILLION;
  return (inputTokens * input + outputTokens * output) / 1_000_000;
};

/** Build an AI response object from raw data */
const buildResponse = (
  content: string,
  inputTokens: number,
  outputTokens: number,
  model: string,
  provider: AIProvider,
  startTime: number
): AIResponse => ({
  content,
  inputTokens,
  outputTokens,
  model,
  provider,
  cost: calculateCost(provider, model, inputTokens, outputTokens),
  durationMs: Date.now() - startTime,
});

/** Convert AIMessages to OpenAI format */
const toOpenAIMessages = (messages: AIMessage[]) =>
  messages.map((m) => ({ role: m.role, content: m.content }));

/** Extract system message and chat messages for Anthropic */
const toAnthropicFormat = (messages: AIMessage[]) => ({
  systemMessage: messages.find((m) => m.role === "system")?.content,
  chatMessages: messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
});

/** Get available providers from config */
export const getAvailableProviders = (config: AIProviderConfig): AIProvider[] => {
  const providers: AIProvider[] = [];
  if (config.openaiApiKey) providers.push("openai");
  if (config.anthropicApiKey) providers.push("anthropic");
  if (config.openrouterApiKey) providers.push("openrouter");
  return providers;
};

// ============================================================================
// Client Factory (Pure)
// ============================================================================

/** Create AI clients from config - pure function, no side effects */
const createClients = (config: AIProviderConfig): AIClients => ({
  openai: config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null,
  anthropic: config.anthropicApiKey ? new Anthropic({ apiKey: config.anthropicApiKey }) : null,
  openrouter: config.openrouterApiKey
    ? new OpenAI({ apiKey: config.openrouterApiKey, baseURL: OPENROUTER_BASE_URL })
    : null,
});

// ============================================================================
// Provider-Specific Chat Functions
// ============================================================================

const chatWithOpenAI = async (
  client: OpenAI,
  messages: AIMessage[],
  options: ChatOptions,
  startTime: number
): Promise<AIResponse> => {
  const model = options.model ?? DEFAULT_MODELS.openai;

  const response = await client.chat.completions.create({
    model,
    messages: toOpenAIMessages(messages),
    temperature: options.temperature ?? DEFAULT_TEMPERATURE,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    response_format: options.jsonMode ? { type: "json_object" } : undefined,
  });

  return buildResponse(
    response.choices[0]?.message?.content ?? "",
    response.usage?.prompt_tokens ?? 0,
    response.usage?.completion_tokens ?? 0,
    model,
    "openai",
    startTime
  );
};

const chatWithOpenRouter = async (
  client: OpenAI,
  messages: AIMessage[],
  options: ChatOptions,
  startTime: number
): Promise<AIResponse> => {
  const model = options.model ?? DEFAULT_MODELS.openrouter;

  const response = await client.chat.completions.create({
    model,
    messages: toOpenAIMessages(messages),
    temperature: options.temperature ?? DEFAULT_TEMPERATURE,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    response_format: options.jsonMode ? { type: "json_object" } : undefined,
  });

  return buildResponse(
    response.choices[0]?.message?.content ?? "",
    response.usage?.prompt_tokens ?? 0,
    response.usage?.completion_tokens ?? 0,
    model,
    "openrouter",
    startTime
  );
};

const chatWithAnthropic = async (
  client: Anthropic,
  messages: AIMessage[],
  options: ChatOptions,
  startTime: number
): Promise<AIResponse> => {
  const model = options.model ?? DEFAULT_MODELS.anthropic;
  const { systemMessage, chatMessages } = toAnthropicFormat(messages);

  const response = await client.messages.create({
    model,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: options.temperature ?? DEFAULT_TEMPERATURE,
    system: systemMessage,
    messages: chatMessages,
  });

  const content = response.content[0]?.type === "text" ? response.content[0].text : "";

  return buildResponse(
    content,
    response.usage.input_tokens,
    response.usage.output_tokens,
    model,
    "anthropic",
    startTime
  );
};

// ============================================================================
// Main Chat Function
// ============================================================================

/** Send a chat request to the specified provider */
const chat = async (
  clients: AIClients,
  provider: AIProvider,
  messages: AIMessage[],
  options: ChatOptions = {}
): Promise<AIResponse> => {
  const startTime = Date.now();

  switch (provider) {
    case "openai": {
      if (!clients.openai) throw new Error("OpenAI API key not configured");
      return chatWithOpenAI(clients.openai, messages, options, startTime);
    }
    case "openrouter": {
      if (!clients.openrouter) throw new Error("OpenRouter API key not configured");
      return chatWithOpenRouter(clients.openrouter, messages, options, startTime);
    }
    case "anthropic": {
      if (!clients.anthropic) throw new Error("Anthropic API key not configured");
      return chatWithAnthropic(clients.anthropic, messages, options, startTime);
    }
  }
};

// ============================================================================
// AI Provider Instance Type
// ============================================================================

export interface AIProviderInstance {
  chat: (provider: AIProvider, messages: AIMessage[], options?: ChatOptions) => Promise<AIResponse>;
  getAvailableProviders: () => AIProvider[];
}

// ============================================================================
// Factory Function (Replaces Singleton)
// ============================================================================

/** Create an AI provider instance - functional replacement for class-based singleton */
export const createAIProvider = (config: AIProviderConfig): AIProviderInstance => {
  const clients = createClients(config);

  return {
    chat: (provider, messages, options = {}) => chat(clients, provider, messages, options),
    getAvailableProviders: () => getAvailableProviders(config),
  };
};

// ============================================================================
// Module-Level Instance (For Backward Compatibility)
// ============================================================================

let cachedInstance: AIProviderInstance | null = null;

/** Get or create the AI provider instance (for backward compatibility) */
export const getAIProvider = (): AIProviderInstance => {
  if (!cachedInstance) {
    cachedInstance = createAIProvider({
      openaiApiKey: process.env.OPENAI_API_KEY,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      openrouterApiKey: process.env.OPENROUTER_API_KEY,
    });
  }
  return cachedInstance;
};

/** Initialize the AI provider with specific keys (for backward compatibility) */
export const initAIProvider = (
  openaiKey?: string,
  anthropicKey?: string,
  openrouterKey?: string
): AIProviderInstance => {
  cachedInstance = createAIProvider({
    openaiApiKey: openaiKey,
    anthropicApiKey: anthropicKey,
    openrouterApiKey: openrouterKey,
  });
  return cachedInstance;
};
