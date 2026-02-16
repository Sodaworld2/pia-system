/**
 * Gemini Vision — Browser-aware screenshot analysis
 *
 * Prompt templates for:
 * - Page description
 * - Next action decision (for multi-step tasks)
 * - Text extraction
 */

import { getGeminiClient } from '../ai/gemini-client.js';
import type { GeminiVisionResponse } from './types.js';

const DEFAULT_MODEL = 'gemini-2.0-flash';

/**
 * Describe what's visible on the page.
 */
export async function describePage(
  screenshotBase64: string,
  model?: string,
): Promise<GeminiVisionResponse> {
  const client = getGeminiClient();
  const prompt = `Describe this web page screenshot concisely. Include:
1. The page title or heading
2. Key interactive elements (buttons, forms, links)
3. Any error messages or alerts visible
4. The overall purpose of the page

Be factual and brief (3-5 sentences).`;

  return client.generateWithImage(prompt, screenshotBase64, 'image/png', model || DEFAULT_MODEL);
}

/**
 * Decide the next browser action given a task and current page state.
 * Returns structured JSON with the action to take.
 */
export async function decideNextAction(
  screenshotBase64: string,
  taskDescription: string,
  previousSteps: string[],
  model?: string,
): Promise<GeminiVisionResponse> {
  const client = getGeminiClient();

  const stepsContext = previousSteps.length > 0
    ? `\nSteps already taken:\n${previousSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n`
    : '';

  const prompt = `You are a browser automation agent. Analyze this screenshot and decide the next action.

Task: ${taskDescription}
${stepsContext}
Based on what you see in the screenshot, respond with EXACTLY ONE JSON object (no markdown, no explanation outside the JSON):

{
  "done": false,
  "action": "click" | "fill" | "navigate" | "scroll" | "wait" | "goBack",
  "selector": "CSS selector of the target element",
  "value": "text to fill (for fill action only)",
  "coords": [x, y],
  "reasoning": "Brief explanation of why this action"
}

If the task is complete, respond with:
{
  "done": true,
  "reasoning": "Brief explanation of why the task is complete"
}

Rules:
- Prefer CSS selectors over coordinates when possible
- For click: provide selector OR coords, not both
- For fill: provide both selector and value
- If you see a CAPTCHA or login wall you cannot bypass, set done=true and explain
- If stuck after seeing the same state twice, try a different approach`;

  return client.generateWithImage(prompt, screenshotBase64, 'image/png', model || DEFAULT_MODEL);
}

/**
 * Extract text content from the visible page.
 */
export async function extractPageText(
  screenshotBase64: string,
  focus?: string,
  model?: string,
): Promise<GeminiVisionResponse> {
  const client = getGeminiClient();
  const focusClause = focus ? `Focus on: ${focus}` : 'Extract all visible text content.';
  const prompt = `Extract the text content from this web page screenshot. ${focusClause}

Return the text in a clean, readable format. Preserve headings, lists, and paragraph structure.
Do not describe the page layout — only return the actual text content.`;

  return client.generateWithImage(prompt, screenshotBase64, 'image/png', model || DEFAULT_MODEL);
}

/**
 * Check if the Gemini client is configured and ready for vision calls.
 */
export function isVisionReady(): boolean {
  try {
    const client = getGeminiClient();
    return client.isConfigured();
  } catch {
    return false;
  }
}
