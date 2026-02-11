/**
 * Multi-Model Review Panel
 * Runs multiple AI models in parallel for comprehensive code review
 *
 * Panel Members:
 * - Gemini: Architecture and patterns perspective
 * - OpenAI: Logic and security perspective
 * - Grok: Devil's advocate / chaos perspective
 *
 * Synthesis: Combines all reviews into unified verdict
 */

import { createLogger } from '../utils/logger.js';
import { getGeminiClient, GeminiClient } from './gemini-client.js';
import { getOpenAIClient, OpenAIClient } from './openai-client.js';
import { getGrokClient, GrokClient } from './grok-client.js';

const logger = createLogger('MultiModel');

export interface ReviewFinding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  category: string;
  description: string;
  location?: string;
  suggestion?: string;
}

export interface ModelReview {
  provider: 'gemini' | 'openai' | 'grok';
  perspective: string;
  findings: ReviewFinding[];
  rawOutput: string;
  duration: number;
  error?: string;
}

export interface PanelResult {
  unanimous: ReviewFinding[];      // All 3 agree
  majority: ReviewFinding[];       // 2 of 3 agree
  geminiOnly: ReviewFinding[];     // Only Gemini found
  openaiOnly: ReviewFinding[];     // Only OpenAI found
  grokOnly: ReviewFinding[];       // Only Grok found
  contradictions: string[];        // Disagreements
  verdict: 'APPROVE' | 'CONCERNS' | 'REJECT';
  confidence: number;              // 0-100
  reviews: ModelReview[];
  totalDuration: number;
  totalCost: number;
}

export class MultiModelPanel {
  private gemini: GeminiClient;
  private openai: OpenAIClient;
  private grok: GrokClient;

  constructor() {
    this.gemini = getGeminiClient();
    this.openai = getOpenAIClient();
    this.grok = getGrokClient();
  }

  /**
   * Check which models are available
   */
  getAvailableModels(): string[] {
    const available: string[] = [];
    if (this.gemini.isConfigured()) available.push('gemini');
    if (this.openai.isConfigured()) available.push('openai');
    if (this.grok.isConfigured()) available.push('grok');
    return available;
  }

  /**
   * Run full code review with all available models
   */
  async reviewCode(code: string, context?: string): Promise<PanelResult> {
    const startTime = Date.now();
    const reviews: ModelReview[] = [];

    logger.info('Starting multi-model code review');

    // Run all reviews in parallel
    const reviewPromises: Promise<ModelReview>[] = [];

    if (this.gemini.isConfigured()) {
      reviewPromises.push(this.runGeminiReview(code, context));
    }
    if (this.openai.isConfigured()) {
      reviewPromises.push(this.runOpenAIReview(code, context));
    }
    if (this.grok.isConfigured()) {
      reviewPromises.push(this.runGrokReview(code, context));
    }

    if (reviewPromises.length === 0) {
      throw new Error('No AI models configured for multi-model review');
    }

    // Wait for all reviews
    const results = await Promise.allSettled(reviewPromises);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        reviews.push(result.value);
      } else {
        logger.error(`Review failed: ${result.reason}`);
      }
    }

    // Synthesize results
    const panelResult = this.synthesize(reviews);
    panelResult.totalDuration = Date.now() - startTime;
    panelResult.reviews = reviews;

    logger.info(`Multi-model review completed (${panelResult.totalDuration}ms, verdict: ${panelResult.verdict})`);

    return panelResult;
  }

  /**
   * Run security-focused review
   */
  async securityReview(code: string, context?: string): Promise<PanelResult> {
    const startTime = Date.now();
    const reviews: ModelReview[] = [];

    logger.info('Starting multi-model SECURITY review');

    const reviewPromises: Promise<ModelReview>[] = [];

    if (this.gemini.isConfigured()) {
      reviewPromises.push(this.runGeminiSecurityReview(code, context));
    }
    if (this.openai.isConfigured()) {
      reviewPromises.push(this.runOpenAISecurityReview(code, context));
    }
    if (this.grok.isConfigured()) {
      reviewPromises.push(this.runGrokSecurityReview(code, context));
    }

    const results = await Promise.allSettled(reviewPromises);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        reviews.push(result.value);
      }
    }

    const panelResult = this.synthesize(reviews);
    panelResult.totalDuration = Date.now() - startTime;
    panelResult.reviews = reviews;

    return panelResult;
  }

  /**
   * Run Gemini review (architecture/patterns focus)
   */
  private async runGeminiReview(code: string, _context?: string): Promise<ModelReview> {
    const startTime = Date.now();

    try {
      const output = await this.gemini.analyzeCode(code, 'architecture');

      return {
        provider: 'gemini',
        perspective: 'Architecture & Patterns',
        findings: this.parseFindings(output),
        rawOutput: output,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        provider: 'gemini',
        perspective: 'Architecture & Patterns',
        findings: [],
        rawOutput: '',
        duration: Date.now() - startTime,
        error: String(error),
      };
    }
  }

  /**
   * Run OpenAI review (logic/security focus)
   */
  private async runOpenAIReview(code: string, _context?: string): Promise<ModelReview> {
    const startTime = Date.now();

    try {
      const output = await this.openai.reviewCode(code, 'logic');

      return {
        provider: 'openai',
        perspective: 'Logic & Flow',
        findings: this.parseFindings(output),
        rawOutput: output,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        provider: 'openai',
        perspective: 'Logic & Flow',
        findings: [],
        rawOutput: '',
        duration: Date.now() - startTime,
        error: String(error),
      };
    }
  }

  /**
   * Run Grok review (devil's advocate)
   */
  private async runGrokReview(code: string, context?: string): Promise<ModelReview> {
    const startTime = Date.now();

    try {
      const output = await this.grok.devilsAdvocate(code, context);

      return {
        provider: 'grok',
        perspective: "Devil's Advocate",
        findings: this.parseFindings(output),
        rawOutput: output,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        provider: 'grok',
        perspective: "Devil's Advocate",
        findings: [],
        rawOutput: '',
        duration: Date.now() - startTime,
        error: String(error),
      };
    }
  }

  /**
   * Security-focused Gemini review
   */
  private async runGeminiSecurityReview(code: string, _context?: string): Promise<ModelReview> {
    const startTime = Date.now();

    try {
      const output = await this.gemini.analyzeCode(code, 'security');

      return {
        provider: 'gemini',
        perspective: 'Security Analysis',
        findings: this.parseFindings(output),
        rawOutput: output,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        provider: 'gemini',
        perspective: 'Security Analysis',
        findings: [],
        rawOutput: '',
        duration: Date.now() - startTime,
        error: String(error),
      };
    }
  }

  /**
   * Security-focused OpenAI review (red team)
   */
  private async runOpenAISecurityReview(code: string, _context?: string): Promise<ModelReview> {
    const startTime = Date.now();

    try {
      const output = await this.openai.redTeam(code);

      return {
        provider: 'openai',
        perspective: 'Red Team Analysis',
        findings: this.parseFindings(output),
        rawOutput: output,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        provider: 'openai',
        perspective: 'Red Team Analysis',
        findings: [],
        rawOutput: '',
        duration: Date.now() - startTime,
        error: String(error),
      };
    }
  }

  /**
   * Security-focused Grok review (abuse scenarios)
   */
  private async runGrokSecurityReview(code: string, _context?: string): Promise<ModelReview> {
    const startTime = Date.now();

    try {
      const output = await this.grok.abuseScenarios(code);

      return {
        provider: 'grok',
        perspective: 'Abuse Scenarios',
        findings: this.parseFindings(output),
        rawOutput: output,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        provider: 'grok',
        perspective: 'Abuse Scenarios',
        findings: [],
        rawOutput: '',
        duration: Date.now() - startTime,
        error: String(error),
      };
    }
  }

  /**
   * Parse AI output into structured findings
   */
  private parseFindings(output: string): ReviewFinding[] {
    const findings: ReviewFinding[] = [];

    // Look for severity markers
    const severityPatterns = [
      { pattern: /\*\*CRITICAL\*\*:?\s*(.+?)(?=\n\*\*|\n\n|$)/gi, severity: 'CRITICAL' as const },
      { pattern: /\*\*HIGH\*\*:?\s*(.+?)(?=\n\*\*|\n\n|$)/gi, severity: 'HIGH' as const },
      { pattern: /\*\*MEDIUM\*\*:?\s*(.+?)(?=\n\*\*|\n\n|$)/gi, severity: 'MEDIUM' as const },
      { pattern: /\*\*LOW\*\*:?\s*(.+?)(?=\n\*\*|\n\n|$)/gi, severity: 'LOW' as const },
    ];

    for (const { pattern, severity } of severityPatterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        findings.push({
          severity,
          category: 'General',
          description: match[1].trim(),
        });
      }
    }

    // If no structured findings, try to extract bullet points
    if (findings.length === 0) {
      const bulletPattern = /^[-*]\s+(.+)$/gm;
      let match;
      while ((match = bulletPattern.exec(output)) !== null) {
        findings.push({
          severity: 'MEDIUM',
          category: 'General',
          description: match[1].trim(),
        });
      }
    }

    return findings;
  }

  /**
   * Synthesize multiple reviews into unified result
   */
  private synthesize(reviews: ModelReview[]): PanelResult {
    const result: PanelResult = {
      unanimous: [],
      majority: [],
      geminiOnly: [],
      openaiOnly: [],
      grokOnly: [],
      contradictions: [],
      verdict: 'APPROVE',
      confidence: 100,
      reviews: [],
      totalDuration: 0,
      totalCost: 0,
    };

    // Collect all findings by provider
    const geminiFindings = reviews.find(r => r.provider === 'gemini')?.findings || [];
    const openaiFindings = reviews.find(r => r.provider === 'openai')?.findings || [];
    const grokFindings = reviews.find(r => r.provider === 'grok')?.findings || [];

    // Simple similarity check (could be improved with embeddings)
    const allFindings = [...geminiFindings, ...openaiFindings, ...grokFindings];

    // Count critical/high findings
    const criticalCount = allFindings.filter(f => f.severity === 'CRITICAL').length;
    const highCount = allFindings.filter(f => f.severity === 'HIGH').length;

    // Determine verdict
    if (criticalCount > 0) {
      result.verdict = 'REJECT';
      result.confidence = 95;
    } else if (highCount >= 2) {
      result.verdict = 'CONCERNS';
      result.confidence = 80;
    } else if (highCount === 1) {
      result.verdict = 'CONCERNS';
      result.confidence = 70;
    } else {
      result.verdict = 'APPROVE';
      result.confidence = 90;
    }

    // Categorize findings
    result.geminiOnly = geminiFindings;
    result.openaiOnly = openaiFindings;
    result.grokOnly = grokFindings;

    // Estimate cost
    result.totalCost = reviews.length * 0.05; // Rough estimate

    return result;
  }

  /**
   * Generate summary report
   */
  generateReport(result: PanelResult): string {
    const lines: string[] = [
      '# Multi-Model Code Review Report',
      '',
      `**Verdict**: ${result.verdict}`,
      `**Confidence**: ${result.confidence}%`,
      `**Duration**: ${result.totalDuration}ms`,
      `**Estimated Cost**: $${result.totalCost.toFixed(4)}`,
      '',
      '## Reviews by Model',
      '',
    ];

    for (const review of result.reviews) {
      lines.push(`### ${review.provider.toUpperCase()} - ${review.perspective}`);
      lines.push(`Duration: ${review.duration}ms`);
      lines.push('');

      if (review.error) {
        lines.push(`**Error**: ${review.error}`);
      } else if (review.findings.length === 0) {
        lines.push('No significant findings.');
      } else {
        for (const finding of review.findings) {
          lines.push(`- **${finding.severity}**: ${finding.description}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

// Singleton
let multiModelPanel: MultiModelPanel | null = null;

export function getMultiModelPanel(): MultiModelPanel {
  if (!multiModelPanel) {
    multiModelPanel = new MultiModelPanel();
  }
  return multiModelPanel;
}
