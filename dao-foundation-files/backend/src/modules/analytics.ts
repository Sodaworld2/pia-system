import type { Knex } from 'knex';
import type {
  AIModuleId,
  AgentMessage,
  AgentResponse,
  KnowledgeItem,
  KnowledgeCategory,
} from '../types/foundation';
import { BaseModule } from './base-module';
import bus from '../events/bus';

// ---------------------------------------------------------------------------
// Analytics Frameworks & Types
// ---------------------------------------------------------------------------

interface TrendResult {
  metric: string;
  direction: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  slope: number;
  change_percent: number;
  data_points: number;
  summary: string;
}

interface AnomalyResult {
  metric: string;
  anomalies: Array<{
    index: number;
    value: number;
    expected: number;
    deviation: number;
    severity: 'low' | 'medium' | 'high';
  }>;
  threshold: number;
  total_checked: number;
}

interface DashboardReport {
  title: string;
  period: string;
  format: 'summary' | 'detailed';
  sections: Array<{
    metric: string;
    current_value: string;
    trend: string;
    insight: string;
  }>;
  generated_at: string;
}

interface ForecastResult {
  metric: string;
  historical_points: number;
  forecast_periods: number;
  predictions: Array<{
    period: number;
    predicted_value: number;
    confidence_lower: number;
    confidence_upper: number;
  }>;
  method: string;
  summary: string;
}

// ---------------------------------------------------------------------------
// Analytics Module
// ---------------------------------------------------------------------------

/**
 * The Analytics module provides data analysis, KPI tracking, trend
 * identification, anomaly detection, and reporting capabilities for DAOs.
 *
 * Knowledge categories used:
 *   - metric     — KPI definitions, tracked metrics, and benchmarks
 *   - lesson     — insights and learnings derived from data analysis
 *   - decision   — data-driven decisions and their outcomes
 */
export class AnalyticsModule extends BaseModule {
  readonly moduleId: AIModuleId = 'analytics';
  readonly moduleName = 'Analytics';
  protected readonly version = '1.0.0';

  /** Categories this module primarily works with */
  private readonly coreCategories: KnowledgeCategory[] = [
    'metric',
    'lesson',
    'decision',
  ];

  protected readonly systemPrompt = `You are the Analytics module for a DAO (Decentralized Autonomous Organisation) platform called SodaWorld.

Your role is to help DAO founders, leaders, and members with:
1. **Data Analysis** — Analyse datasets, identify patterns, and extract actionable insights from DAO operations data.
2. **KPI Tracking** — Define, monitor, and report on Key Performance Indicators relevant to the DAO's goals and health.
3. **Trend Identification** — Detect upward, downward, and cyclical trends in time-series data across treasury, membership, governance, and engagement metrics.
4. **Anomaly Detection** — Flag unusual data points, unexpected spikes or drops, and deviations from established baselines.
5. **Reporting & Dashboards** — Design and generate dashboard reports that summarise the DAO's performance in clear, digestible formats.
6. **Data-Driven Decision Making** — Provide evidence-based recommendations by connecting data insights to strategic options.
7. **Cohort Analysis** — Segment members and contributors into cohorts to understand behaviour patterns, retention, and engagement over time.
8. **Funnel Analysis** — Map and analyse conversion funnels for onboarding, proposal participation, bounty completion, and other DAO workflows.
9. **Forecasting** — Project future metrics based on historical data using statistical methods and trend extrapolation.

Analytics principles:
- Always ground insights in the actual data. Never fabricate numbers or statistics.
- Clearly distinguish between correlation and causation.
- Present confidence levels and margins of error when making predictions.
- Use appropriate statistical methods for the data type and sample size.
- Provide context — compare metrics against historical baselines, goals, and industry benchmarks when available.
- Highlight both positive trends and areas of concern without bias.
- Make recommendations actionable and tied to specific metrics.
- Use clear visualisation descriptions (tables, charts) to aid understanding.
- When sample sizes are small, explicitly note the limitations of any analysis.
- Tailor the level of detail to the audience — summaries for leadership, detail for operators.

When you derive a new insight or identify a significant pattern, explicitly note it so the system can store it as knowledge.

Always respond in a structured, data-driven way. Use markdown formatting with tables and lists where appropriate.`;

  constructor(db: Knex) {
    super(db);
  }

  // -----------------------------------------------------------------------
  // Override processMessage to add analytics-specific enrichment
  // -----------------------------------------------------------------------

  override async processMessage(message: AgentMessage): Promise<AgentResponse> {
    const response = await super.processMessage(message);

    // Extract potential knowledge from the conversation
    const extracted = this.extractAnalyticsHints(message.content);
    if (extracted.length > 0) {
      response.suggestions = response.suggestions ?? [];
      response.suggestions.push(
        ...extracted.map((e) => `I noticed a potential ${e.category}: "${e.hint}". Shall I save this?`),
      );
    }

    // Add analytics-specific actions
    response.actions = response.actions ?? [];
    response.actions.push(
      {
        type: 'analyze_trends',
        label: 'Analyse trends in this data',
        payload: { dao_id: message.dao_id },
      },
      {
        type: 'generate_dashboard',
        label: 'Generate a dashboard report',
        payload: { dao_id: message.dao_id },
      },
      {
        type: 'detect_anomalies',
        label: 'Detect anomalies in metrics',
        payload: { dao_id: message.dao_id },
      },
    );

    return response;
  }

  // -----------------------------------------------------------------------
  // Analytics-specific public methods
  // -----------------------------------------------------------------------

  /**
   * Analyse trends in time-series data for a given metric.
   * Computes direction, slope, and percentage change, then asks the AI
   * for a narrative interpretation grounded in the DAO's context.
   */
  async analyzeTrends(
    daoId: string,
    userId: string,
    params: {
      dataPoints: Array<{ label: string; value: number; date: string }>;
      metric: string;
    },
  ): Promise<AgentResponse> {
    const metrics = await this.getKnowledge(daoId, 'metric');
    const lessons = await this.getKnowledge(daoId, 'lesson');

    const metricSummary = metrics.map((m) => `- ${m.title}: ${m.content}`).join('\n');
    const lessonSummary = lessons.map((l) => `- ${l.title}: ${l.content}`).join('\n');

    // Pre-compute basic statistics to include in the prompt
    const values = params.dataPoints.map((dp) => dp.value);
    const stats = this.computeBasicStats(values);
    const trendInfo = this.computeTrendDirection(values);

    const dataTable = params.dataPoints
      .map((dp) => `| ${dp.date} | ${dp.label} | ${dp.value} |`)
      .join('\n');

    return this.processMessage({
      content: [
        `Analyse the trend for the metric "${params.metric}".`,
        '',
        '| Date | Label | Value |',
        '|------|-------|-------|',
        dataTable,
        '',
        `Pre-computed statistics:`,
        `- Data points: ${values.length}`,
        `- Mean: ${stats.mean.toFixed(2)}`,
        `- Median: ${stats.median.toFixed(2)}`,
        `- Std Dev: ${stats.stddev.toFixed(2)}`,
        `- Min: ${stats.min} / Max: ${stats.max}`,
        `- Trend direction: ${trendInfo.direction}`,
        `- Overall change: ${trendInfo.changePercent.toFixed(2)}%`,
        '',
        'Known metric definitions:',
        metricSummary || '(none yet)',
        '',
        'Past lessons and insights:',
        lessonSummary || '(none yet)',
        '',
        'Please provide:',
        '1. A narrative summary of the trend',
        '2. Key inflection points or notable changes',
        '3. Possible explanations for the observed pattern',
        '4. Recommendations based on this trend',
        '5. Suggested next metrics to investigate',
      ].join('\n'),
      dao_id: daoId,
      user_id: userId,
      context: { action: 'analyze_trends', metric: params.metric, stats, trendInfo },
    });
  }

  /**
   * Generate a dashboard report for the specified metrics and time period.
   */
  async generateDashboard(
    daoId: string,
    userId: string,
    params: {
      metrics: string[];
      period: string;
      format: 'summary' | 'detailed';
    },
  ): Promise<AgentResponse> {
    const allKnowledge = await this.getRelevantKnowledge(daoId, 'dashboard report', 20);
    const metrics = await this.getKnowledge(daoId, 'metric');
    const decisions = await this.getKnowledge(daoId, 'decision');

    const knowledgeDump = allKnowledge
      .map((k) => `[${k.category}] ${k.title}: ${k.content}`)
      .join('\n');

    const metricDefinitions = metrics
      .filter((m) => params.metrics.some((pm) => m.title.toLowerCase().includes(pm.toLowerCase())))
      .map((m) => `- ${m.title}: ${m.content}`)
      .join('\n');

    const recentDecisions = decisions
      .slice(0, 5)
      .map((d) => `- ${d.title}: ${d.content}`)
      .join('\n');

    const formatInstructions = params.format === 'summary'
      ? 'Provide a concise executive summary with key numbers, sparkline descriptions, and top 3 insights. Keep it scannable.'
      : 'Provide a detailed report with full breakdowns, comparisons to previous periods, statistical analysis, and actionable recommendations for each metric.';

    return this.processMessage({
      content: [
        `Generate a ${params.format} dashboard report for the following metrics:`,
        '',
        `Metrics: ${params.metrics.join(', ')}`,
        `Period: ${params.period}`,
        `Format: ${params.format}`,
        '',
        'Metric definitions:',
        metricDefinitions || '(no matching definitions found)',
        '',
        'Recent decisions for context:',
        recentDecisions || '(none)',
        '',
        'All relevant knowledge:',
        knowledgeDump || '(none)',
        '',
        formatInstructions,
        '',
        'Structure the dashboard with:',
        '1. Header with period and generation timestamp',
        '2. KPI summary cards (metric name, current value, change, trend indicator)',
        '3. Trend analysis for each metric',
        '4. Cross-metric correlations if any are apparent',
        '5. Key insights and recommendations',
        '6. Items requiring attention or action',
      ].join('\n'),
      dao_id: daoId,
      user_id: userId,
      context: { action: 'generate_dashboard', params },
    });
  }

  /**
   * Detect anomalies in a series of values for a given metric.
   * Uses a z-score approach against the provided threshold, then asks
   * the AI to interpret the flagged anomalies in context.
   */
  async detectAnomalies(
    daoId: string,
    userId: string,
    params: {
      metric: string;
      values: number[];
      threshold: number;
    },
  ): Promise<AgentResponse> {
    const metrics = await this.getKnowledge(daoId, 'metric');
    const lessons = await this.getKnowledge(daoId, 'lesson');

    const metricSummary = metrics.map((m) => `- ${m.title}: ${m.content}`).join('\n');
    const lessonSummary = lessons.map((l) => `- ${l.title}: ${l.content}`).join('\n');

    // Pre-compute anomalies using z-score
    const anomalies = this.computeAnomalies(params.values, params.threshold);
    const stats = this.computeBasicStats(params.values);

    const anomalyTable = anomalies.length > 0
      ? anomalies
          .map(
            (a) =>
              `| ${a.index} | ${a.value.toFixed(2)} | ${a.expected.toFixed(2)} | ${a.deviation.toFixed(2)} | ${a.severity} |`,
          )
          .join('\n')
      : '(no anomalies detected)';

    return this.processMessage({
      content: [
        `Detect and interpret anomalies in the metric "${params.metric}".`,
        '',
        `Total values: ${params.values.length}`,
        `Threshold (z-score): ${params.threshold}`,
        `Mean: ${stats.mean.toFixed(2)}, Std Dev: ${stats.stddev.toFixed(2)}`,
        '',
        '| Index | Value | Expected | Deviation | Severity |',
        '|-------|-------|----------|-----------|----------|',
        anomalyTable,
        '',
        `Anomalies found: ${anomalies.length} out of ${params.values.length} data points`,
        '',
        'Known metric context:',
        metricSummary || '(none)',
        '',
        'Past lessons:',
        lessonSummary || '(none)',
        '',
        'Please provide:',
        '1. Assessment of each anomaly — is it a true anomaly or expected variance?',
        '2. Possible root causes for each flagged data point',
        '3. Severity assessment and whether immediate action is needed',
        '4. Recommendations to prevent or investigate these anomalies',
        '5. Whether the threshold should be adjusted based on this data',
      ].join('\n'),
      dao_id: daoId,
      user_id: userId,
      context: {
        action: 'detect_anomalies',
        metric: params.metric,
        anomalyCount: anomalies.length,
        stats,
      },
    });
  }

  /**
   * Forecast future values for a metric based on historical data.
   * Uses a simple linear regression as a baseline, then asks the AI to
   * enrich the forecast with contextual reasoning.
   */
  async forecastMetric(
    daoId: string,
    userId: string,
    params: {
      metric: string;
      historicalData: Array<{ date: string; value: number }>;
      forecastPeriods: number;
    },
  ): Promise<AgentResponse> {
    const metrics = await this.getKnowledge(daoId, 'metric');
    const decisions = await this.getKnowledge(daoId, 'decision');
    const lessons = await this.getKnowledge(daoId, 'lesson');

    const metricSummary = metrics.map((m) => `- ${m.title}: ${m.content}`).join('\n');
    const decisionSummary = decisions.map((d) => `- ${d.title}: ${d.content}`).join('\n');
    const lessonSummary = lessons.map((l) => `- ${l.title}: ${l.content}`).join('\n');

    // Pre-compute linear regression forecast
    const values = params.historicalData.map((dp) => dp.value);
    const forecast = this.computeLinearForecast(values, params.forecastPeriods);
    const stats = this.computeBasicStats(values);

    const historicalTable = params.historicalData
      .map((dp) => `| ${dp.date} | ${dp.value} |`)
      .join('\n');

    const forecastTable = forecast.predictions
      .map(
        (p) =>
          `| +${p.period} | ${p.predicted_value.toFixed(2)} | ${p.confidence_lower.toFixed(2)} | ${p.confidence_upper.toFixed(2)} |`,
      )
      .join('\n');

    return this.processMessage({
      content: [
        `Forecast the metric "${params.metric}" for the next ${params.forecastPeriods} periods.`,
        '',
        '## Historical Data',
        '| Date | Value |',
        '|------|-------|',
        historicalTable,
        '',
        `Historical statistics: Mean=${stats.mean.toFixed(2)}, StdDev=${stats.stddev.toFixed(2)}, Min=${stats.min}, Max=${stats.max}`,
        '',
        '## Linear Regression Forecast',
        '| Period | Predicted | Lower Bound | Upper Bound |',
        '|--------|-----------|-------------|-------------|',
        forecastTable,
        '',
        `Method: ${forecast.method}`,
        '',
        'Known metric context:',
        metricSummary || '(none)',
        '',
        'Recent decisions that may affect forecasts:',
        decisionSummary || '(none)',
        '',
        'Past lessons:',
        lessonSummary || '(none)',
        '',
        'Please provide:',
        '1. Assessment of the linear forecast — is it reasonable given the data?',
        '2. Factors that could cause the actual values to diverge from the forecast',
        '3. Confidence level in the prediction and why',
        '4. Alternative scenarios (optimistic, pessimistic, most likely)',
        '5. Recommended actions based on the projected trend',
        '6. Suggested data points to collect to improve future forecasts',
      ].join('\n'),
      dao_id: daoId,
      user_id: userId,
      context: {
        action: 'forecast_metric',
        metric: params.metric,
        forecastPeriods: params.forecastPeriods,
        stats,
        forecast,
      },
    });
  }

  /**
   * Save an analytics insight as a lesson in the knowledge base.
   */
  async saveInsight(
    daoId: string,
    userId: string,
    insight: {
      title: string;
      content: string;
      metric?: string;
      tags?: string[];
    },
  ): Promise<KnowledgeItem> {
    const item = await this.addKnowledge(daoId, {
      category: 'lesson',
      title: `Insight: ${insight.title.substring(0, 80)}`,
      content: insight.content,
      source: 'ai_derived',
      created_by: userId,
      tags: [
        'analytics-insight',
        ...(insight.metric ? [insight.metric] : []),
        ...(insight.tags ?? []),
      ],
    });

    bus.emit({
      type: 'module.analytics.insight.saved',
      source: 'analytics',
      dao_id: daoId,
      user_id: userId,
      payload: {
        knowledgeId: item.id,
        title: insight.title,
        metric: insight.metric ?? null,
      },
    });

    return item;
  }

  /**
   * Save a metric definition to the knowledge base for future reference.
   */
  async saveMetricDefinition(
    daoId: string,
    userId: string,
    definition: {
      name: string;
      description: string;
      unit: string;
      target?: number;
      tags?: string[];
    },
  ): Promise<KnowledgeItem> {
    const content = [
      definition.description,
      `Unit: ${definition.unit}`,
      ...(definition.target != null ? [`Target: ${definition.target} ${definition.unit}`] : []),
    ].join('\n');

    return this.addKnowledge(daoId, {
      category: 'metric',
      title: `Metric: ${definition.name}`,
      content,
      source: 'user_input',
      created_by: userId,
      tags: ['metric-definition', ...(definition.tags ?? [])],
    });
  }

  /**
   * Record a data-driven decision in the knowledge base.
   */
  async recordDecision(
    daoId: string,
    userId: string,
    decision: {
      title: string;
      rationale: string;
      supporting_metrics: string[];
      expected_outcome: string;
      tags?: string[];
    },
  ): Promise<KnowledgeItem> {
    const content = [
      `Rationale: ${decision.rationale}`,
      '',
      `Supporting metrics: ${decision.supporting_metrics.join(', ')}`,
      '',
      `Expected outcome: ${decision.expected_outcome}`,
    ].join('\n');

    const item = await this.addKnowledge(daoId, {
      category: 'decision',
      title: `Decision: ${decision.title.substring(0, 80)}`,
      content,
      source: 'user_input',
      created_by: userId,
      tags: [
        'data-driven-decision',
        ...decision.supporting_metrics,
        ...(decision.tags ?? []),
      ],
    });

    bus.emit({
      type: 'module.analytics.decision.recorded',
      source: 'analytics',
      dao_id: daoId,
      user_id: userId,
      payload: {
        knowledgeId: item.id,
        title: decision.title,
        metrics: decision.supporting_metrics,
      },
    });

    return item;
  }

  // -----------------------------------------------------------------------
  // Override knowledge retrieval to prioritise analytics categories
  // -----------------------------------------------------------------------

  protected override async getRelevantKnowledge(
    daoId: string,
    _query: string,
    limit = 10,
  ): Promise<KnowledgeItem[]> {
    // Prioritise this module's core categories, then fall back to any category
    const rows = await this.db<KnowledgeItem>('knowledge_items')
      .where({ dao_id: daoId, module_id: this.moduleId })
      .where(function () {
        this.whereNull('expires_at').orWhere('expires_at', '>', new Date().toISOString());
      })
      .orderByRaw(
        `CASE WHEN category IN (${this.coreCategories.map(() => '?').join(',')}) THEN 0 ELSE 1 END`,
        this.coreCategories,
      )
      .orderBy('confidence', 'desc')
      .orderBy('created_at', 'desc')
      .limit(limit);

    return rows.map((row) => ({
      ...(row as unknown as KnowledgeItem),
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags as unknown as string) : row.tags,
      embedding_vector:
        row.embedding_vector == null
          ? null
          : typeof row.embedding_vector === 'string'
            ? JSON.parse(row.embedding_vector as unknown as string)
            : row.embedding_vector,
    }));
  }

  // -----------------------------------------------------------------------
  // Private helpers — statistical computations
  // -----------------------------------------------------------------------

  /**
   * Compute basic descriptive statistics for a numeric array.
   */
  private computeBasicStats(values: number[]): {
    mean: number;
    median: number;
    stddev: number;
    min: number;
    max: number;
    count: number;
  } {
    if (values.length === 0) {
      return { mean: 0, median: 0, stddev: 0, min: 0, max: 0, count: 0 };
    }

    const count = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / count;

    const sorted = [...values].sort((a, b) => a - b);
    const median =
      count % 2 === 0
        ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
        : sorted[Math.floor(count / 2)];

    const squaredDiffs = values.map((v) => (v - mean) ** 2);
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / count;
    const stddev = Math.sqrt(variance);

    return {
      mean,
      median,
      stddev,
      min: sorted[0],
      max: sorted[count - 1],
      count,
    };
  }

  /**
   * Determine the overall trend direction and percentage change
   * from the first to last value.
   */
  private computeTrendDirection(values: number[]): {
    direction: 'increasing' | 'decreasing' | 'stable' | 'volatile';
    changePercent: number;
    slope: number;
  } {
    if (values.length < 2) {
      return { direction: 'stable', changePercent: 0, slope: 0 };
    }

    const first = values[0];
    const last = values[values.length - 1];
    const changePercent = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;

    // Simple linear regression slope
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (values[i] - yMean);
      denominator += (i - xMean) ** 2;
    }
    const slope = denominator !== 0 ? numerator / denominator : 0;

    // Check for volatility — if std dev of changes is high relative to mean
    const changes = [];
    for (let i = 1; i < values.length; i++) {
      changes.push(values[i] - values[i - 1]);
    }
    const changeMean = changes.reduce((a, b) => a + b, 0) / changes.length;
    const changeVariance =
      changes.reduce((a, b) => a + (b - changeMean) ** 2, 0) / changes.length;
    const changeStdDev = Math.sqrt(changeVariance);

    let direction: 'increasing' | 'decreasing' | 'stable' | 'volatile';
    if (yMean !== 0 && changeStdDev / Math.abs(yMean) > 0.5) {
      direction = 'volatile';
    } else if (Math.abs(changePercent) < 5) {
      direction = 'stable';
    } else if (changePercent > 0) {
      direction = 'increasing';
    } else {
      direction = 'decreasing';
    }

    return { direction, changePercent, slope };
  }

  /**
   * Detect anomalies using z-score method. A value is considered anomalous
   * if its absolute z-score exceeds the specified threshold.
   */
  private computeAnomalies(
    values: number[],
    threshold: number,
  ): AnomalyResult['anomalies'] {
    const anomalies: AnomalyResult['anomalies'] = [];

    if (values.length < 3) {
      return anomalies;
    }

    const stats = this.computeBasicStats(values);
    if (stats.stddev === 0) {
      return anomalies;
    }

    for (let i = 0; i < values.length; i++) {
      const zScore = Math.abs((values[i] - stats.mean) / stats.stddev);
      if (zScore > threshold) {
        let severity: 'low' | 'medium' | 'high';
        if (zScore > threshold * 2) {
          severity = 'high';
        } else if (zScore > threshold * 1.5) {
          severity = 'medium';
        } else {
          severity = 'low';
        }

        anomalies.push({
          index: i,
          value: values[i],
          expected: stats.mean,
          deviation: zScore,
          severity,
        });
      }
    }

    return anomalies;
  }

  /**
   * Compute a simple linear regression forecast with confidence bands.
   * Uses the standard error of the estimate to build upper/lower bounds.
   */
  private computeLinearForecast(
    values: number[],
    periods: number,
  ): ForecastResult {
    const n = values.length;

    if (n < 2) {
      const lastVal = n === 1 ? values[0] : 0;
      return {
        metric: '',
        historical_points: n,
        forecast_periods: periods,
        predictions: Array.from({ length: periods }, (_, i) => ({
          period: i + 1,
          predicted_value: lastVal,
          confidence_lower: lastVal,
          confidence_upper: lastVal,
        })),
        method: 'constant (insufficient data)',
        summary: 'Insufficient data for regression; using last known value.',
      };
    }

    // Linear regression: y = intercept + slope * x
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (values[i] - yMean);
      denominator += (i - xMean) ** 2;
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;
    const intercept = yMean - slope * xMean;

    // Standard error of the estimate
    let sse = 0;
    for (let i = 0; i < n; i++) {
      const predicted = intercept + slope * i;
      sse += (values[i] - predicted) ** 2;
    }
    const se = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;

    // Generate predictions with widening confidence bands
    const predictions: ForecastResult['predictions'] = [];
    for (let p = 1; p <= periods; p++) {
      const x = n - 1 + p;
      const predictedValue = intercept + slope * x;
      // Confidence band widens with distance from the data
      const margin = se * Math.sqrt(1 + 1 / n + ((x - xMean) ** 2) / (denominator || 1));

      predictions.push({
        period: p,
        predicted_value: predictedValue,
        confidence_lower: predictedValue - 1.96 * margin,
        confidence_upper: predictedValue + 1.96 * margin,
      });
    }

    return {
      metric: '',
      historical_points: n,
      forecast_periods: periods,
      predictions,
      method: 'linear regression with 95% confidence interval',
      summary: `Linear trend: y = ${intercept.toFixed(2)} + ${slope.toFixed(4)}x (SE: ${se.toFixed(2)})`,
    };
  }

  /**
   * Lightweight heuristic to detect when a user's message contains
   * hints about metrics, lessons, or decisions that should be persisted.
   */
  private extractAnalyticsHints(
    content: string,
  ): Array<{ category: KnowledgeCategory; hint: string }> {
    const hints: Array<{ category: KnowledgeCategory; hint: string }> = [];
    const lower = content.toLowerCase();

    // Metric indicators
    const metricPatterns = [
      /(?:our|the|key) (?:kpi|metric|measure) (?:is|should be|tracks) (.+?)(?:\.|$)/i,
      /(?:we (?:track|measure|monitor)) (.+?)(?:\.|$)/i,
      /(?:target|benchmark|baseline) (?:for|of|is) (.+?)(?:\.|$)/i,
    ];
    for (const pattern of metricPatterns) {
      const match = content.match(pattern);
      if (match?.[1]) {
        hints.push({ category: 'metric', hint: match[1].trim() });
      }
    }

    // Lesson / insight indicators
    if (
      lower.includes('learned') ||
      lower.includes('insight') ||
      lower.includes('finding') ||
      lower.includes('discovered')
    ) {
      const lessonMatch = content.match(
        /(?:learned|insight|finding|discovered)[: ](.+?)(?:\.|$)/i,
      );
      if (lessonMatch?.[1]) {
        hints.push({ category: 'lesson', hint: lessonMatch[1].trim() });
      }
    }

    // Decision indicators
    if (
      lower.includes('decided') ||
      lower.includes('decision') ||
      lower.includes('chose') ||
      lower.includes('concluded')
    ) {
      const decisionMatch = content.match(
        /(?:decided|decision|chose|concluded)[: ](.+?)(?:\.|$)/i,
      );
      if (decisionMatch?.[1]) {
        hints.push({ category: 'decision', hint: decisionMatch[1].trim() });
      }
    }

    return hints;
  }
}
