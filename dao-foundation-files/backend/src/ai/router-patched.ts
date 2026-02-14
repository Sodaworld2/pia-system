// @ts-nocheck
/**
 * AI Router — The Heart of the Brain
 *
 * Every user input flows through this pipeline:
 * 1. Classify intent (local, fast)
 * 2. Check cache
 * 3. Select persona
 * 4. Select model (cost waterfall)
 * 5. Retrieve context (RAG)
 * 6. Generate response (streaming)
 * 7. Store in memory
 *
 * Uses Vercel AI SDK for unified multi-model interface.
 */

import { generateText, streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { classifyLocally, type Classification, getClassificationPrompt } from './classifier';
import { getPersonaForIntent, type Persona, PERSONAS } from './personas';
import { selectModel, type ModelConfig, MODELS } from './models';
import { getCached, setCache, getConversationHistory, saveMessage, getDAOContext, formatDAOContext } from './memory';
import { searchContext, formatRAGContext, isRAGAvailable } from './rag';
import { getCostGuard } from './cost-guard';

// Initialize providers
const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

// Anthropic provider (optional — only if ANTHROPIC_API_KEY is set)
let anthropic: any = null;
async function getAnthropicProvider() {
  if (anthropic) return anthropic;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const { createAnthropic } = await import('@ai-sdk/anthropic');
    anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropic;
  } catch {
    return null;
  }
}

/**
 * Get the AI SDK model instance for a given config
 */
async function getModelInstance(config: ModelConfig) {
  if (config.provider === 'anthropic') {
    const provider = await getAnthropicProvider();
    if (provider) {
      return provider(config.modelId);
    }
    // Fallback to Gemini Pro if Anthropic unavailable
    return google(MODELS.pro.modelId);
  }
  return google(config.modelId);
}

export interface BrainRequest {
  sessionId: string;
  prompt: string;
  daoId?: string;
  userRole?: string;
  learningStyle?: string;
  founderProfile?: string;
  forcePersona?: string; // Override persona selection
}

export interface BrainResponse {
  text: string;
  persona: {
    id: string;
    name: string;
    icon: string;
    color: string;
  };
  classification: Classification;
  model: string;
  ragUsed: boolean;
  cached: boolean;
}

/**
 * Main brain function — non-streaming version
 * Use for simple requests or when streaming isn't needed.
 */
export async function processBrainRequest(request: BrainRequest): Promise<BrainResponse> {
  try {
    // Cost guard check
    const costGuard = getCostGuard();
    if (!costGuard.checkBudget(request.sessionId)) {
      return {
        text: 'Daily AI budget limit reached for this session. Please try again tomorrow or contact an administrator to increase the limit.',
        persona: { id: 'system', name: 'System', icon: '⚠️', color: '#ff9800' },
        classification: { intent: 'general', complexity: 'simple', confidence: 1.0, reasoning: 'budget_exceeded' },
        model: 'none',
        ragUsed: false,
        cached: false,
      };
    }

    // Step 1: Classify intent
    const classification = classifyLocally(request.prompt);

    // Step 2: Check cache
    const cached = getCached(request.prompt);
    if (cached && cached.confidence > 0.9) {
      const persona = PERSONAS[cached.persona] || PERSONAS.coach;
      return {
        text: cached.response,
        persona: { id: persona.id, name: persona.name, icon: persona.icon, color: persona.color },
        classification,
        model: 'cache',
        ragUsed: false,
        cached: true,
      };
    }

    // Step 3: Select persona
    const persona = request.forcePersona
      ? (PERSONAS[request.forcePersona] || getPersonaForIntent(classification.intent))
      : getPersonaForIntent(classification.intent);

    // Step 4: Select model
    const modelConfig = selectModel(classification.intent, classification.complexity);

    // Step 5: Get context
    const [history, daoContext, ragResults] = await Promise.all([
      getConversationHistory(request.sessionId, 10),
      getDAOContext(request.daoId),
      isRAGAvailable() ? searchContext(request.prompt, 5) : Promise.resolve([]),
    ]);

    // Step 6: Build messages
    const messages: any[] = [];

    // Add conversation history
    for (const msg of history.slice(-8)) { // Last 8 messages for context window
      messages.push({ role: msg.role, content: msg.content });
    }

    // Add current user message
    messages.push({ role: 'user', content: request.prompt });

    // Build system prompt with context injection
    let systemPrompt = persona.systemPrompt;

    // Add DAO context
    const daoContextStr = formatDAOContext(daoContext);
    if (daoContextStr) {
      systemPrompt += `\n\n${daoContextStr}`;
    }

    // Add user context
    if (request.userRole) {
      systemPrompt += `\n\nThe user's role is: ${request.userRole}`;
    }
    if (request.learningStyle) {
      systemPrompt += `\nThe user's learning style is: ${request.learningStyle}. Adapt your responses accordingly.`;
    }
    if (request.founderProfile) {
      systemPrompt += `\nThe user's founder profile is: ${request.founderProfile}.`;
    }

    // Add RAG context
    const ragContext = formatRAGContext(ragResults);
    if (ragContext) {
      systemPrompt += `\n\n${ragContext}`;
    }

    // Step 7: Generate response
    const model = await getModelInstance(modelConfig);

    const result = await generateText({
      model,
      system: systemPrompt,
      messages,
      // @ts-ignore
      maxTokens: modelConfig.maxTokens,
    });

    const responseText = result.text;

    // Record cost
    costGuard.recordUsage(
      request.sessionId,
      modelConfig.modelId,
      result.usage?.promptTokens ?? 0,
      result.usage?.completionTokens ?? 0,
    );

    // Step 8: Store in memory
    await saveMessage(request.sessionId, 'user', request.prompt, {
      intent: classification.intent,
      persona: persona.id,
    });
    await saveMessage(request.sessionId, 'model', responseText, {
      intent: classification.intent,
      persona: persona.id,
      model: modelConfig.modelId,
    });

    // Cache the response
    setCache(request.prompt, responseText, persona.id, classification.intent);

    return {
      text: responseText,
      persona: { id: persona.id, name: persona.name, icon: persona.icon, color: persona.color },
      classification,
      model: modelConfig.modelId,
      ragUsed: ragResults.length > 0,
      cached: false,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[AI Router] processBrainRequest failed:', errorMessage);

    return {
      text: `I'm sorry, I encountered an error processing your request. Please try again.\n\nError: ${errorMessage}`,
      persona: { id: 'system', name: 'System', icon: '⚠️', color: '#ff9800' },
      classification: { intent: 'general', complexity: 'simple', confidence: 0, reasoning: 'error' },
      model: 'error',
      ragUsed: false,
      cached: false,
    };
  }
}

/**
 * Streaming brain function — for real-time response delivery.
 * Returns a ReadableStream that the Express route can pipe to the client.
 */
export async function streamBrainRequest(request: BrainRequest) {
  try {
    // Cost guard check
    const costGuard = getCostGuard();
    if (!costGuard.checkBudget(request.sessionId)) {
      throw new Error('Daily AI budget limit reached for this session.');
    }

    // Step 1: Classify intent
    const classification = classifyLocally(request.prompt);

    // Step 2: Select persona
    const persona = request.forcePersona
      ? (PERSONAS[request.forcePersona] || getPersonaForIntent(classification.intent))
      : getPersonaForIntent(classification.intent);

    // Step 3: Select model
    const modelConfig = selectModel(classification.intent, classification.complexity);

    // Step 4: Get context in parallel
    const [history, daoContext, ragResults] = await Promise.all([
      getConversationHistory(request.sessionId, 10),
      getDAOContext(request.daoId),
      isRAGAvailable() ? searchContext(request.prompt, 5) : Promise.resolve([]),
    ]);

    // Step 5: Build messages
    const messages: any[] = [];
    for (const msg of history.slice(-8)) {
      messages.push({ role: msg.role, content: msg.content });
    }
    messages.push({ role: 'user', content: request.prompt });

    // Build system prompt
    let systemPrompt = persona.systemPrompt;
    const daoContextStr = formatDAOContext(daoContext);
    if (daoContextStr) systemPrompt += `\n\n${daoContextStr}`;
    if (request.userRole) systemPrompt += `\n\nThe user's role is: ${request.userRole}`;
    if (request.learningStyle) systemPrompt += `\nLearning style: ${request.learningStyle}. Adapt accordingly.`;
    if (request.founderProfile) systemPrompt += `\nFounder profile: ${request.founderProfile}.`;
    const ragContext = formatRAGContext(ragResults);
    if (ragContext) systemPrompt += `\n\n${ragContext}`;

    // Step 6: Stream response
    const model = await getModelInstance(modelConfig);

    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      // @ts-ignore
      maxTokens: modelConfig.maxTokens,
      onFinish: async ({ text, usage }) => {
        // Record cost
        costGuard.recordUsage(
          request.sessionId,
          modelConfig.modelId,
          usage?.promptTokens ?? 0,
          usage?.completionTokens ?? 0,
        );

        // Save to memory after streaming completes
        await saveMessage(request.sessionId, 'user', request.prompt, {
          intent: classification.intent, persona: persona.id,
        });
        await saveMessage(request.sessionId, 'model', text, {
          intent: classification.intent, persona: persona.id, model: modelConfig.modelId,
        });
        // Cache
        setCache(request.prompt, text, persona.id, classification.intent);
      },
    });

    return {
      stream: result.textStream,
      persona: { id: persona.id, name: persona.name, icon: persona.icon, color: persona.color },
      classification,
      model: modelConfig.modelId,
      ragUsed: ragResults.length > 0,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[AI Router] streamBrainRequest failed:', errorMessage);
    throw error; // Re-throw for the route handler to catch
  }
}
