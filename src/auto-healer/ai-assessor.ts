/**
 * PIA AI Assessment Engine
 * Uses local AI (Ollama) to assess code changes and suggest documentation updates
 */

import { createLogger } from '../utils/logger.js';
import { config } from '../config.js';
import { EventEmitter } from 'events';

const logger = createLogger('AIAssessor');

interface AssessmentRequest {
  type: 'code-change' | 'doc-drift' | 'config-change' | 'error-analysis';
  context: string;
  files?: string[];
  content?: string;
}

interface AssessmentResult {
  success: boolean;
  analysis?: string;
  suggestions?: string[];
  priority?: 'low' | 'medium' | 'high' | 'critical';
  error?: string;
}

interface OllamaResponse {
  model: string;
  response: string;
  done: boolean;
}

export class AIAssessor extends EventEmitter {
  private ollamaUrl: string;
  private model: string;
  private isAvailable: boolean = false;

  constructor() {
    super();
    this.ollamaUrl = config.features.ollamaUrl || 'http://localhost:11434';
    this.model = 'llama3.2'; // Default to small, fast model
  }

  // Check if Ollama is available
  async checkAvailability(): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json() as { models?: Array<{ name: string }> };
        const models = data.models || [];
        this.isAvailable = models.length > 0;

        if (this.isAvailable) {
          // Check if preferred model is available
          const hasPreferred = models.some(m => m.name.includes(this.model));
          if (!hasPreferred && models.length > 0) {
            this.model = models[0].name.split(':')[0];
          }
          logger.info(`Ollama available with model: ${this.model}`);
        }
        return this.isAvailable;
      }
    } catch {
      logger.debug('Ollama not available');
    }
    this.isAvailable = false;
    return false;
  }

  // Assess code changes
  async assessCodeChange(files: string[], diff?: string): Promise<AssessmentResult> {
    if (!this.isAvailable) {
      return { success: false, error: 'AI not available' };
    }

    const prompt = `You are a code review assistant. Analyze these code changes and provide:
1. A brief summary of what changed
2. Whether documentation needs updating (README, API docs, etc.)
3. Any potential issues or improvements

Files changed: ${files.join(', ')}
${diff ? `\nDiff preview:\n${diff.substring(0, 2000)}` : ''}

Respond in JSON format:
{
  "summary": "brief description",
  "docUpdateNeeded": true/false,
  "docSuggestions": ["list", "of", "suggestions"],
  "priority": "low/medium/high",
  "issues": ["any", "potential", "issues"]
}`;

    return this.query({
      type: 'code-change',
      context: prompt,
      files,
    });
  }

  // Assess documentation drift
  async assessDocDrift(codeFiles: string[], docFiles: string[]): Promise<AssessmentResult> {
    if (!this.isAvailable) {
      return { success: false, error: 'AI not available' };
    }

    const prompt = `You are a documentation quality assistant. Given these recent code changes, assess if the documentation is likely out of date.

Code files changed: ${codeFiles.join(', ')}
Documentation files: ${docFiles.join(', ')}

Consider:
1. API changes that need doc updates
2. New features not yet documented
3. Changed behavior that needs explanation
4. Configuration changes

Respond in JSON format:
{
  "driftLikelihood": "low/medium/high",
  "priorityDocs": ["files that most need updating"],
  "suggestions": ["specific update suggestions"],
  "autoUpdatePossible": true/false
}`;

    return this.query({
      type: 'doc-drift',
      context: prompt,
    });
  }

  // Assess an agent error
  async assessAgentError(errorOutput: string, context: string): Promise<AssessmentResult> {
    if (!this.isAvailable) {
      return { success: false, error: 'AI not available' };
    }

    const prompt = `You are a debugging assistant. Analyze this error from an AI coding agent and suggest fixes.

Error output:
${errorOutput.substring(0, 1500)}

Context: ${context}

Respond in JSON format:
{
  "errorType": "syntax/runtime/dependency/permission/other",
  "rootCause": "brief explanation",
  "suggestedFixes": ["step 1", "step 2"],
  "canAutoFix": true/false,
  "priority": "low/medium/high/critical"
}`;

    return this.query({
      type: 'error-analysis',
      context: prompt,
    });
  }

  // Query Ollama
  private async query(request: AssessmentRequest): Promise<AssessmentResult> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: request.context,
          stream: false,
          options: {
            temperature: 0.3, // Lower temperature for more consistent output
            num_predict: 500,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}`);
      }

      const data = await response.json() as OllamaResponse;

      // Try to parse JSON from response
      try {
        const jsonMatch = data.response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            success: true,
            analysis: JSON.stringify(parsed),
            suggestions: parsed.suggestions || parsed.suggestedFixes || parsed.docSuggestions,
            priority: parsed.priority || 'medium',
          };
        }
      } catch {
        // Not valid JSON, return as plain text
      }

      return {
        success: true,
        analysis: data.response,
      };
    } catch (error) {
      logger.error(`AI query failed: ${error}`);
      return {
        success: false,
        error: String(error),
      };
    }
  }

  // Generate a documentation update suggestion
  async suggestDocUpdate(docPath: string, codeChanges: string[]): Promise<string | null> {
    if (!this.isAvailable) {
      return null;
    }

    const prompt = `Given these code changes, suggest a brief addition to the documentation at ${docPath}:

Changes: ${codeChanges.join('\n')}

Write 1-3 sentences that could be added to document these changes. Be concise and factual.`;

    const result = await this.query({
      type: 'doc-drift',
      context: prompt,
    });

    return result.success ? result.analysis || null : null;
  }

  // Get availability status
  getStatus(): { available: boolean; model: string; url: string } {
    return {
      available: this.isAvailable,
      model: this.model,
      url: this.ollamaUrl,
    };
  }
}

// Singleton
let aiAssessor: AIAssessor | null = null;

export function getAIAssessor(): AIAssessor {
  if (!aiAssessor) {
    aiAssessor = new AIAssessor();
  }
  return aiAssessor;
}

export async function initAIAssessor(): Promise<AIAssessor> {
  const assessor = getAIAssessor();
  await assessor.checkAvailability();
  return assessor;
}
