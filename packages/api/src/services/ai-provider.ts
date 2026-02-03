import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export type AIProvider = "openai" | "anthropic";

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

// Pricing per 1M tokens (as of 2024)
const PRICING = {
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
} as const;

function calculateCost(
  provider: AIProvider,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const providerPricing = PRICING[provider] as Record<
    string,
    { input: number; output: number }
  >;
  const modelPricing = providerPricing[model];

  if (!modelPricing) {
    // Default to a reasonable estimate if model not found
    return (inputTokens * 3 + outputTokens * 15) / 1_000_000;
  }

  return (
    (inputTokens * modelPricing.input + outputTokens * modelPricing.output) /
    1_000_000
  );
}

export class AIProviderFactory {
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;

  constructor(openaiApiKey?: string, anthropicApiKey?: string) {
    if (openaiApiKey) {
      this.openai = new OpenAI({ apiKey: openaiApiKey });
    }
    if (anthropicApiKey) {
      this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
    }
  }

  async chat(
    provider: AIProvider,
    messages: AIMessage[],
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      jsonMode?: boolean;
    } = {}
  ): Promise<AIResponse> {
    const startTime = Date.now();

    if (provider === "openai") {
      return this.chatOpenAI(messages, options, startTime);
    } else {
      return this.chatAnthropic(messages, options, startTime);
    }
  }

  private async chatOpenAI(
    messages: AIMessage[],
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      jsonMode?: boolean;
    },
    startTime: number
  ): Promise<AIResponse> {
    if (!this.openai) {
      throw new Error("OpenAI API key not configured");
    }

    const model = options.model || "gpt-4o-mini";

    const response = await this.openai.chat.completions.create({
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 4096,
      response_format: options.jsonMode ? { type: "json_object" } : undefined,
    });

    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;

    return {
      content: response.choices[0]?.message?.content ?? "",
      inputTokens,
      outputTokens,
      model,
      provider: "openai",
      cost: calculateCost("openai", model, inputTokens, outputTokens),
      durationMs: Date.now() - startTime,
    };
  }

  private async chatAnthropic(
    messages: AIMessage[],
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      jsonMode?: boolean;
    },
    startTime: number
  ): Promise<AIResponse> {
    if (!this.anthropic) {
      throw new Error("Anthropic API key not configured");
    }

    const model = options.model || "claude-sonnet-4-20250514";

    // Extract system message and convert to Anthropic format
    const systemMessage = messages.find((m) => m.role === "system");
    const chatMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const response = await this.anthropic.messages.create({
      model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.3,
      system: systemMessage?.content,
      messages: chatMessages,
    });

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const content =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    return {
      content,
      inputTokens,
      outputTokens,
      model,
      provider: "anthropic",
      cost: calculateCost("anthropic", model, inputTokens, outputTokens),
      durationMs: Date.now() - startTime,
    };
  }

  getAvailableProviders(): AIProvider[] {
    const providers: AIProvider[] = [];
    if (this.openai) providers.push("openai");
    if (this.anthropic) providers.push("anthropic");
    return providers;
  }
}

// Singleton instance - will be initialized with env vars
let providerInstance: AIProviderFactory | null = null;

export function getAIProvider(): AIProviderFactory {
  if (!providerInstance) {
    providerInstance = new AIProviderFactory(
      process.env.OPENAI_API_KEY,
      process.env.ANTHROPIC_API_KEY
    );
  }
  return providerInstance;
}

export function initAIProvider(
  openaiKey?: string,
  anthropicKey?: string
): AIProviderFactory {
  providerInstance = new AIProviderFactory(openaiKey, anthropicKey);
  return providerInstance;
}
