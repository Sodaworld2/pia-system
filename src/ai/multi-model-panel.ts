/**
 * Multi-Model Review Panel
 * Runs multiple AI models in parallel for comprehensive code review
 *
 * Panel Members:
 * - Ollama: Fast local scan (FREE)
 * - Claude Haiku: Patterns & architecture perspective (CHEAP)
 * - Claude Sonnet: Deep logic & security analysis (MEDIUM)
 *
 * Synthesis: Combines all reviews into unified verdict
 */

import { createLogger } from '../utils/logger.js';
import { getOllamaClient, OllamaClient } from './ollama-client.js';
import { getClaudeClient, ClaudeClient } from './claude-client.js';

const logger = createLogger('MultiModel');

export interface ReviewFinding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  category: string;
  description: string;
  location?: string;
  suggestion?: string;
}

export interface ModelReview {
  provider: string;
  model: string;
  perspective: string;
  findings: ReviewFinding[];
  rawOutput: string;
  duration: number;
  error?: string;
}

export interface PanelResult {
  unanimous: ReviewFinding[];
  majority: ReviewFinding[];
  ollamaOnly: ReviewFinding[];
  haikuOnly: ReviewFinding[];
  sonnetOnly: ReviewFinding[];
  contradictions: string[];
  verdict: 'APPROVE' | 'CONCERNS' | 'REJECT';
  confidence: number;
  reviews: ModelReview[];
  totalDuration: number;
  totalCost: number;
}

export class MultiModelPanel {
  private ollama: OllamaClient;
  private claude: ClaudeClient;

  constructor() {
    this.ollama = getOllamaClient();
    this.claude = getClaudeClient();
  }

  /**
   * Check which models are available
   */
  getAvailableModels(): string[] {
    const available: string[] = [];
    // Ollama availability needs async check, so we just check config
    available.push('ollama'); // Always listed, checked at runtime
    if (this.claude.isConfigured()) {
      available.push('claude-haiku');
      available.push('claude-sonnet');
    }
    return available;
  }

  /**
   * Run full code review with all available models
   */
  async reviewCode(code: string, context?: string): Promise<PanelResult> {
    const startTime = Date.now();
    const reviews: ModelReview[] = [];

    logger.info('Starting multi-model code review (Ollama + Claude Haiku + Claude Sonnet)');

    const reviewPromises: Promise<ModelReview>[] = [];

    // Always try Ollama (free)
    reviewPromises.push(this.runOllamaReview(code, context));

    // Claude reviews if API key configured
    if (this.claude.isConfigured()) {
      reviewPromises.push(this.runHaikuReview(code, context));
      reviewPromises.push(this.runSonnetReview(code, context));
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

    if (reviews.length === 0) {
      throw new Error('No AI models available for multi-model review');
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

    reviewPromises.push(this.runOllamaSecurityReview(code, context));

    if (this.claude.isConfigured()) {
      reviewPromises.push(this.runHaikuSecurityReview(code, context));
      reviewPromises.push(this.runSonnetSecurityReview(code, context));
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

  // ---------------------------------------------------------------------------
  // Individual Model Reviews
  // ---------------------------------------------------------------------------

  /**
   * Ollama review - Quick local scan (FREE)
   */
  private async runOllamaReview(code: string, _context?: string): Promise<ModelReview> {
    const startTime = Date.now();

    try {
      const available = await this.ollama.isAvailable();
      if (!available) throw new Error('Ollama not available');

      const output = await this.ollama.reviewCode(code);

      return {
        provider: 'ollama',
        model: this.ollama.getDefaultModel(),
        perspective: 'Quick Local Scan',
        findings: this.parseFindings(output),
        rawOutput: output,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        provider: 'ollama',
        model: this.ollama.getDefaultModel(),
        perspective: 'Quick Local Scan',
        findings: [],
        rawOutput: '',
        duration: Date.now() - startTime,
        error: String(error),
      };
    }
  }

  /**
   * Claude Haiku review - Architecture & patterns (CHEAP)
   */
  private async runHaikuReview(code: string, context?: string): Promise<ModelReview> {
    const startTime = Date.now();

    try {
      const output = await this.claude.generate(
        context
          ? `Context: ${context}\n\nReview this code for architecture patterns, design issues, and maintainability:\n\`\`\`\n${code}\n\`\`\``
          : `Review this code for architecture patterns, design issues, and maintainability:\n\`\`\`\n${code}\n\`\`\``,
        'claude-haiku-4-5-20251001',
        {
          system: 'You are an architecture reviewer. Focus on patterns, code structure, naming, separation of concerns, and maintainability. Mark findings by severity: **CRITICAL**, **HIGH**, **MEDIUM**, **LOW**.',
          temperature: 0.3,
          maxTokens: 4096,
        }
      );

      return {
        provider: 'claude',
        model: 'claude-haiku-4-5-20251001',
        perspective: 'Architecture & Patterns',
        findings: this.parseFindings(output),
        rawOutput: output,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        provider: 'claude',
        model: 'claude-haiku-4-5-20251001',
        perspective: 'Architecture & Patterns',
        findings: [],
        rawOutput: '',
        duration: Date.now() - startTime,
        error: String(error),
      };
    }
  }

  /**
   * Claude Sonnet review - Deep logic & security (MEDIUM)
   */
  private async runSonnetReview(code: string, context?: string): Promise<ModelReview> {
    const startTime = Date.now();

    try {
      const output = await this.claude.reviewCode(code, context, 'claude-sonnet-4-6');

      return {
        provider: 'claude',
        model: 'claude-sonnet-4-6',
        perspective: 'Deep Logic & Security',
        findings: this.parseFindings(output),
        rawOutput: output,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        provider: 'claude',
        model: 'claude-sonnet-4-6',
        perspective: 'Deep Logic & Security',
        findings: [],
        rawOutput: '',
        duration: Date.now() - startTime,
        error: String(error),
      };
    }
  }

  /**
   * Security-focused Ollama review
   */
  private async runOllamaSecurityReview(code: string, _context?: string): Promise<ModelReview> {
    const startTime = Date.now();

    try {
      const available = await this.ollama.isAvailable();
      if (!available) throw new Error('Ollama not available');

      const response = await this.ollama.chat([
        {
          role: 'system',
          content: 'You are a security auditor. Check for OWASP top 10 vulnerabilities, injection flaws, auth bypass, data exposure. Mark severity: **CRITICAL**, **HIGH**, **MEDIUM**, **LOW**.',
        },
        {
          role: 'user',
          content: `Security review this code:\n\`\`\`\n${code}\n\`\`\``,
        },
      ]);

      return {
        provider: 'ollama',
        model: this.ollama.getDefaultModel(),
        perspective: 'Security Scan (Local)',
        findings: this.parseFindings(response.message.content),
        rawOutput: response.message.content,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        provider: 'ollama',
        model: this.ollama.getDefaultModel(),
        perspective: 'Security Scan (Local)',
        findings: [],
        rawOutput: '',
        duration: Date.now() - startTime,
        error: String(error),
      };
    }
  }

  /**
   * Security-focused Haiku review
   */
  private async runHaikuSecurityReview(code: string, _context?: string): Promise<ModelReview> {
    const startTime = Date.now();

    try {
      const output = await this.claude.generate(
        `Security audit this code. Check for OWASP top 10, injection, auth bypass, data exposure:\n\`\`\`\n${code}\n\`\`\``,
        'claude-haiku-4-5-20251001',
        {
          system: 'You are a security auditor. Find vulnerabilities. Mark by severity: **CRITICAL**, **HIGH**, **MEDIUM**, **LOW**. Be specific with line numbers.',
          temperature: 0.2,
          maxTokens: 4096,
        }
      );

      return {
        provider: 'claude',
        model: 'claude-haiku-4-5-20251001',
        perspective: 'Security Analysis',
        findings: this.parseFindings(output),
        rawOutput: output,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        provider: 'claude',
        model: 'claude-haiku-4-5-20251001',
        perspective: 'Security Analysis',
        findings: [],
        rawOutput: '',
        duration: Date.now() - startTime,
        error: String(error),
      };
    }
  }

  /**
   * Security-focused Sonnet review (red team)
   */
  private async runSonnetSecurityReview(code: string, _context?: string): Promise<ModelReview> {
    const startTime = Date.now();

    try {
      const output = await this.claude.generate(
        `Red team this code. Think like an attacker. How would you exploit it? What data could you exfiltrate?\n\`\`\`\n${code}\n\`\`\``,
        'claude-sonnet-4-6',
        {
          system: 'You are a red team security specialist. Find attack vectors, exploitation paths, and defense weaknesses. Mark severity: **CRITICAL**, **HIGH**, **MEDIUM**, **LOW**. Be thorough.',
          temperature: 0.4,
          maxTokens: 8192,
        }
      );

      return {
        provider: 'claude',
        model: 'claude-sonnet-4-6',
        perspective: 'Red Team Analysis',
        findings: this.parseFindings(output),
        rawOutput: output,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        provider: 'claude',
        model: 'claude-sonnet-4-6',
        perspective: 'Red Team Analysis',
        findings: [],
        rawOutput: '',
        duration: Date.now() - startTime,
        error: String(error),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Parsing & Synthesis
  // ---------------------------------------------------------------------------

  /**
   * Parse AI output into structured findings
   */
  private parseFindings(output: string): ReviewFinding[] {
    const findings: ReviewFinding[] = [];

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
      ollamaOnly: [],
      haikuOnly: [],
      sonnetOnly: [],
      contradictions: [],
      verdict: 'APPROVE',
      confidence: 100,
      reviews: [],
      totalDuration: 0,
      totalCost: 0,
    };

    // Collect findings by source
    const ollamaFindings = reviews.find(r => r.provider === 'ollama')?.findings || [];
    const haikuFindings = reviews.find(r => r.model === 'claude-haiku-4-5-20251001')?.findings || [];
    const sonnetFindings = reviews.find(r => r.model === 'claude-sonnet-4-6')?.findings || [];

    const allFindings = [...ollamaFindings, ...haikuFindings, ...sonnetFindings];

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
    result.ollamaOnly = ollamaFindings;
    result.haikuOnly = haikuFindings;
    result.sonnetOnly = sonnetFindings;

    // Estimate cost (Ollama=free, Haiku~$0.002, Sonnet~$0.01)
    result.totalCost = 0;
    for (const review of reviews) {
      if (review.model === 'claude-haiku-4-5-20251001') result.totalCost += 0.002;
      else if (review.model === 'claude-sonnet-4-6') result.totalCost += 0.01;
      // Ollama is free
    }

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
      lines.push(`### ${review.provider.toUpperCase()} (${review.model}) - ${review.perspective}`);
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
