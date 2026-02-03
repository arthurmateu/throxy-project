import { db } from "@throxy-interview/db";
import * as schema from "@throxy-interview/db/schema";
import { eq, desc } from "drizzle-orm";
import { getAIProvider, type AIProvider } from "./ai-provider";

const { prompts, aiCallLogs } = schema;

// Evaluation lead from eval_set.csv
export interface EvalLead {
  fullName: string;
  title: string;
  company: string;
  linkedIn: string;
  employeeRange: string;
  expectedRank: number | null; // null means irrelevant ("-")
}

// Prompt candidate for genetic algorithm
export interface PromptCandidate {
  content: string;
  version: number;
  fitness: number;
  generation: number;
  parentVersion?: number;
}

// Optimization progress
export interface OptimizationProgress {
  status: "idle" | "running" | "completed" | "error";
  currentGeneration: number;
  totalGenerations: number;
  populationSize: number;
  bestFitness: number;
  currentBestPrompt?: string;
  evaluationsRun: number;
  error?: string;
}

// In-memory progress tracking
const optimizationProgressMap = new Map<string, OptimizationProgress>();

export function getOptimizationProgress(runId: string): OptimizationProgress {
  return (
    optimizationProgressMap.get(runId) || {
      status: "idle",
      currentGeneration: 0,
      totalGenerations: 0,
      populationSize: 0,
      bestFitness: 0,
      evaluationsRun: 0,
    }
  );
}

function updateOptimizationProgress(runId: string, update: Partial<OptimizationProgress>) {
  const current = getOptimizationProgress(runId);
  optimizationProgressMap.set(runId, { ...current, ...update });
}

// Parse the eval_set.csv content
export function parseEvalSet(csvContent: string): EvalLead[] {
  const lines = csvContent.trim().split("\n");
  const leads: EvalLead[] = [];

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;

    // Parse CSV with potential quoted fields
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    // Expected columns: Full Name, Title, Company, LI, Employee Range, Rank
    if (values.length >= 6) {
      const rankStr = (values[5] ?? "").trim();
      const expectedRank = rankStr === "-" || rankStr === "" ? null : parseInt(rankStr, 10);

      leads.push({
        fullName: values[0] || "",
        title: values[1] || "",
        company: values[2] || "",
        linkedIn: values[3] || "",
        employeeRange: values[4] || "",
        expectedRank: isNaN(expectedRank as number) ? null : expectedRank,
      });
    }
  }

  return leads;
}

// Evaluate a prompt against the eval set
async function evaluatePrompt(
  promptContent: string,
  evalLeads: EvalLead[],
  provider: AIProvider,
  runId: string
): Promise<{ fitness: number; predictions: Array<{ lead: EvalLead; predicted: number | null; actual: number | null }> }> {
  const ai = getAIProvider();
  const predictions: Array<{ lead: EvalLead; predicted: number | null; actual: number | null }> = [];

  // Group leads by company for batch processing
  const companiesMap = new Map<string, EvalLead[]>();
  for (const lead of evalLeads) {
    const existing = companiesMap.get(lead.company) || [];
    existing.push(lead);
    companiesMap.set(lead.company, existing);
  }

  // Process each company batch
  for (const [company, companyLeads] of companiesMap.entries()) {
    const leadsInfo = companyLeads
      .map(
        (lead, idx) =>
          `${idx + 1}. Name: ${lead.fullName}
   Title: ${lead.title}`
      )
      .join("\n\n");

    const userPrompt = `${promptContent}

---

Now rank the following leads from ${company} (${companyLeads[0]?.employeeRange || "Unknown size"} employees):

${leadsInfo}

Respond with a JSON object in this exact format:
{
  "rankings": [
    {
      "name": "<lead name>",
      "rank": <number 1-10 or null if irrelevant>
    }
  ]
}`;

    try {
      const response = await ai.chat(provider, [{ role: "user", content: userPrompt }], {
        jsonMode: true,
        temperature: 0.1,
      });

      // Log the AI call
      await db.insert(aiCallLogs).values({
        provider,
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cost: response.cost,
        durationMs: response.durationMs,
        batchId: runId,
      });

      // Parse response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.rankings)) {
          for (const result of parsed.rankings) {
            const lead = companyLeads.find(
              (l) => l.fullName.toLowerCase() === result.name?.toLowerCase()
            );
            if (lead) {
              predictions.push({
                lead,
                predicted: result.rank === null ? null : Number(result.rank),
                actual: lead.expectedRank,
              });
            }
          }
        }
      }

      // Add any missing leads as failed predictions
      for (const lead of companyLeads) {
        if (!predictions.find((p) => p.lead.fullName === lead.fullName)) {
          predictions.push({
            lead,
            predicted: null,
            actual: lead.expectedRank,
          });
        }
      }
    } catch (error) {
      // On error, mark all leads in this company as failed
      for (const lead of companyLeads) {
        predictions.push({
          lead,
          predicted: null,
          actual: lead.expectedRank,
        });
      }
    }
  }

  // Calculate fitness score
  const fitness = calculateFitness(predictions);

  return { fitness, predictions };
}

// Calculate fitness based on ranking accuracy
function calculateFitness(
  predictions: Array<{ lead: EvalLead; predicted: number | null; actual: number | null }>
): number {
  if (predictions.length === 0) return 0;

  let totalScore = 0;
  let weightedCount = 0;

  for (const { predicted, actual } of predictions) {
    // Relevance accuracy (is it relevant or not)
    const actualIsRelevant = actual !== null;
    const predictedIsRelevant = predicted !== null;

    if (actualIsRelevant === predictedIsRelevant) {
      // Correct relevance classification
      if (!actualIsRelevant) {
        // Correctly identified as irrelevant - full points
        totalScore += 1;
        weightedCount += 1;
      } else {
        // Both relevant - score based on rank distance
        const maxDist = 9; // max possible distance (1 to 10)
        const distance = Math.abs((predicted as number) - (actual as number));
        const rankScore = 1 - distance / maxDist;
        totalScore += rankScore;
        weightedCount += 1;
      }
    } else {
      // Wrong relevance classification - heavy penalty
      totalScore += 0;
      weightedCount += 1;
    }
  }

  return weightedCount > 0 ? totalScore / weightedCount : 0;
}

// Mutate a prompt using AI to create variations
async function mutatePrompt(
  parentPrompt: string,
  errorPatterns: string[],
  provider: AIProvider,
  runId: string
): Promise<string> {
  const ai = getAIProvider();

  const mutationPrompt = `You are an expert at optimizing prompts for AI lead qualification systems.

Here is the current prompt being used:
---
${parentPrompt}
---

The prompt has the following issues based on evaluation:
${errorPatterns.join("\n")}

Please create an improved version of this prompt that:
1. Addresses the identified issues
2. Maintains the core ranking criteria
3. Is clear and specific about how to rank leads
4. Handles edge cases better

Return ONLY the improved prompt text, nothing else.`;

  const response = await ai.chat(provider, [{ role: "user", content: mutationPrompt }], {
    temperature: 0.7,
    maxTokens: 4000,
  });

  // Log the mutation call
  await db.insert(aiCallLogs).values({
    provider,
    model: response.model,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    cost: response.cost,
    durationMs: response.durationMs,
    batchId: runId,
  });

  return response.content.trim();
}

// Crossover two prompts to create a child
async function crossoverPrompts(
  parent1: string,
  parent2: string,
  provider: AIProvider,
  runId: string
): Promise<string> {
  const ai = getAIProvider();

  const crossoverPrompt = `You are an expert at optimizing prompts for AI lead qualification systems.

Here are two successful prompts:

PROMPT A:
---
${parent1}
---

PROMPT B:
---
${parent2}
---

Create a new prompt that combines the best elements of both prompts. The new prompt should:
1. Take the clearest instructions from each
2. Combine their ranking criteria effectively
3. Be coherent and well-structured

Return ONLY the new combined prompt text, nothing else.`;

  const response = await ai.chat(provider, [{ role: "user", content: crossoverPrompt }], {
    temperature: 0.5,
    maxTokens: 4000,
  });

  // Log the crossover call
  await db.insert(aiCallLogs).values({
    provider,
    model: response.model,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    cost: response.cost,
    durationMs: response.durationMs,
    batchId: runId,
  });

  return response.content.trim();
}

// Analyze errors to guide mutation
function analyzeErrors(
  predictions: Array<{ lead: EvalLead; predicted: number | null; actual: number | null }>
): string[] {
  const errors: string[] = [];

  let falsePositives = 0;
  let falseNegatives = 0;
  let rankTooHigh = 0;
  let rankTooLow = 0;

  for (const { predicted, actual } of predictions) {
    const actualIsRelevant = actual !== null;
    const predictedIsRelevant = predicted !== null;

    if (predictedIsRelevant && !actualIsRelevant) {
      falsePositives++;
    } else if (!predictedIsRelevant && actualIsRelevant) {
      falseNegatives++;
    } else if (predictedIsRelevant && actualIsRelevant) {
      if ((predicted as number) < (actual as number)) {
        rankTooHigh++;
      } else if ((predicted as number) > (actual as number)) {
        rankTooLow++;
      }
    }
  }

  if (falsePositives > 0) {
    errors.push(
      `- Marking ${falsePositives} irrelevant leads as relevant. Be stricter about excluding HR, Finance, Engineering, and other non-sales roles.`
    );
  }
  if (falseNegatives > 0) {
    errors.push(
      `- Missing ${falseNegatives} relevant leads (marking them as irrelevant). Be more inclusive of sales-adjacent roles.`
    );
  }
  if (rankTooHigh > 0) {
    errors.push(
      `- Ranking ${rankTooHigh} leads too highly (predicted rank lower than actual). Be more conservative with top rankings.`
    );
  }
  if (rankTooLow > 0) {
    errors.push(
      `- Ranking ${rankTooLow} leads too low (predicted rank higher than actual). Better recognize high-value titles.`
    );
  }

  return errors;
}

// Tournament selection - pick best from random subset
function tournamentSelect(population: PromptCandidate[], tournamentSize: number): PromptCandidate {
  const tournament: PromptCandidate[] = [];
  for (let i = 0; i < tournamentSize; i++) {
    const randomIndex = Math.floor(Math.random() * population.length);
    tournament.push(population[randomIndex]!);
  }
  return tournament.reduce((best, current) =>
    current.fitness > best.fitness ? current : best
  );
}

// Main optimization function
export async function runPromptOptimization(
  evalLeads: EvalLead[],
  provider: AIProvider,
  runId: string,
  options: {
    populationSize?: number;
    generations?: number;
    mutationRate?: number;
    eliteCount?: number;
    sampleSize?: number; // Use a subset of eval leads for faster iterations
  } = {}
): Promise<void> {
  const {
    populationSize = 6,
    generations = 5,
    mutationRate = 0.7,
    eliteCount = 2,
    sampleSize = 30,
  } = options;

  try {
    updateOptimizationProgress(runId, {
      status: "running",
      totalGenerations: generations,
      populationSize,
      currentGeneration: 0,
      bestFitness: 0,
      evaluationsRun: 0,
    });

    // Get the base prompt
    const basePromptResult = await db
      .select()
      .from(prompts)
      .where(eq(prompts.isActive, true))
      .orderBy(desc(prompts.version))
      .limit(1);

    if (basePromptResult.length === 0) {
      throw new Error("No active prompt found");
    }

    const basePrompt = basePromptResult[0]!;
    let nextVersion = basePrompt.version + 1;

    // Sample eval leads for faster evaluation
    const sampledLeads =
      evalLeads.length > sampleSize
        ? evalLeads.sort(() => Math.random() - 0.5).slice(0, sampleSize)
        : evalLeads;

    // Initialize population with the base prompt
    let population: PromptCandidate[] = [
      {
        content: basePrompt.content,
        version: basePrompt.version,
        fitness: 0,
        generation: 0,
      },
    ];

    // Create initial mutations of the base prompt
    const initialErrors = [
      "- Initial evaluation: creating diverse variations to explore the solution space.",
    ];

    for (let i = 1; i < populationSize; i++) {
      const mutated = await mutatePrompt(basePrompt.content, initialErrors, provider, runId);
      population.push({
        content: mutated,
        version: nextVersion++,
        fitness: 0,
        generation: 0,
      });
    }

    // Evaluate initial population
    let evaluationsRun = 0;
    for (const candidate of population) {
      const { fitness } = await evaluatePrompt(candidate.content, sampledLeads, provider, runId);
      candidate.fitness = fitness;
      evaluationsRun++;
      updateOptimizationProgress(runId, { evaluationsRun });
    }

    // Sort by fitness
    population.sort((a, b) => b.fitness - a.fitness);
    let bestCandidate = population[0]!;

    updateOptimizationProgress(runId, {
      bestFitness: bestCandidate.fitness,
      currentBestPrompt: bestCandidate.content.substring(0, 200) + "...",
    });

    // Evolution loop
    for (let gen = 1; gen <= generations; gen++) {
      updateOptimizationProgress(runId, { currentGeneration: gen });

      const newPopulation: PromptCandidate[] = [];

      // Elitism - keep top performers
      for (let i = 0; i < eliteCount && i < population.length; i++) {
        newPopulation.push({
          ...population[i]!,
          generation: gen,
        });
      }

      // Generate new candidates through crossover and mutation
      while (newPopulation.length < populationSize) {
        const parent1 = tournamentSelect(population, 3);
        const parent2 = tournamentSelect(population, 3);

        let childContent: string;

        if (Math.random() < mutationRate) {
          // Mutation
          const parent = Math.random() < 0.5 ? parent1 : parent2;
          const { predictions } = await evaluatePrompt(
            parent.content,
            sampledLeads.slice(0, 10),
            provider,
            runId
          );
          evaluationsRun++;
          const errors = analyzeErrors(predictions);
          childContent = await mutatePrompt(
            parent.content,
            errors.length > 0 ? errors : initialErrors,
            provider,
            runId
          );
        } else {
          // Crossover
          childContent = await crossoverPrompts(parent1.content, parent2.content, provider, runId);
        }

        newPopulation.push({
          content: childContent,
          version: nextVersion++,
          fitness: 0,
          generation: gen,
          parentVersion: parent1.version,
        });
      }

      // Evaluate new candidates (skip elites since they're already evaluated)
      for (let i = eliteCount; i < newPopulation.length; i++) {
        const candidate = newPopulation[i]!;
        const { fitness } = await evaluatePrompt(candidate.content, sampledLeads, provider, runId);
        candidate.fitness = fitness;
        evaluationsRun++;
        updateOptimizationProgress(runId, { evaluationsRun });
      }

      // Sort and update best
      population = newPopulation.sort((a, b) => b.fitness - a.fitness);
      
      if (population[0]!.fitness > bestCandidate.fitness) {
        bestCandidate = population[0]!;
        updateOptimizationProgress(runId, {
          bestFitness: bestCandidate.fitness,
          currentBestPrompt: bestCandidate.content.substring(0, 200) + "...",
        });
      }

      console.log(
        `Generation ${gen}: Best fitness = ${bestCandidate.fitness.toFixed(3)}`
      );
    }

    // Save the best prompt to the database
    await db.insert(prompts).values({
      version: bestCandidate.version,
      content: bestCandidate.content,
      evalScore: bestCandidate.fitness,
      isActive: false, // Don't automatically activate
      generation: bestCandidate.generation,
      parentVersion: bestCandidate.parentVersion,
    });

    updateOptimizationProgress(runId, {
      status: "completed",
      bestFitness: bestCandidate.fitness,
    });
  } catch (error) {
    updateOptimizationProgress(runId, {
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

// Get optimization history
export async function getOptimizationHistory() {
  const history = await db
    .select({
      version: prompts.version,
      evalScore: prompts.evalScore,
      isActive: prompts.isActive,
      generation: prompts.generation,
      createdAt: prompts.createdAt,
    })
    .from(prompts)
    .orderBy(desc(prompts.version));

  return history;
}

// Activate a specific prompt version
export async function activatePrompt(version: number) {
  // Deactivate all prompts
  await db.update(prompts).set({ isActive: false });
  
  // Activate the selected one
  await db.update(prompts).set({ isActive: true }).where(eq(prompts.version, version));
}
