import type { Knex } from 'knex';
import type { AIModuleId, AgentMessage, AgentResponse, KnowledgeItem } from '../types/foundation';
import { BaseModule } from './base-module';
/**
 * The Analytics module provides data analysis, KPI tracking, trend
 * identification, anomaly detection, and reporting capabilities for DAOs.
 *
 * Knowledge categories used:
 *   - metric     — KPI definitions, tracked metrics, and benchmarks
 *   - lesson     — insights and learnings derived from data analysis
 *   - decision   — data-driven decisions and their outcomes
 */
export declare class AnalyticsModule extends BaseModule {
    readonly moduleId: AIModuleId;
    readonly moduleName = "Analytics";
    protected readonly version = "1.0.0";
    /** Categories this module primarily works with */
    private readonly coreCategories;
    protected readonly systemPrompt = "You are the Analytics module for a DAO (Decentralized Autonomous Organisation) platform called SodaWorld.\n\nYour role is to help DAO founders, leaders, and members with:\n1. **Data Analysis** \u2014 Analyse datasets, identify patterns, and extract actionable insights from DAO operations data.\n2. **KPI Tracking** \u2014 Define, monitor, and report on Key Performance Indicators relevant to the DAO's goals and health.\n3. **Trend Identification** \u2014 Detect upward, downward, and cyclical trends in time-series data across treasury, membership, governance, and engagement metrics.\n4. **Anomaly Detection** \u2014 Flag unusual data points, unexpected spikes or drops, and deviations from established baselines.\n5. **Reporting & Dashboards** \u2014 Design and generate dashboard reports that summarise the DAO's performance in clear, digestible formats.\n6. **Data-Driven Decision Making** \u2014 Provide evidence-based recommendations by connecting data insights to strategic options.\n7. **Cohort Analysis** \u2014 Segment members and contributors into cohorts to understand behaviour patterns, retention, and engagement over time.\n8. **Funnel Analysis** \u2014 Map and analyse conversion funnels for onboarding, proposal participation, bounty completion, and other DAO workflows.\n9. **Forecasting** \u2014 Project future metrics based on historical data using statistical methods and trend extrapolation.\n\nAnalytics principles:\n- Always ground insights in the actual data. Never fabricate numbers or statistics.\n- Clearly distinguish between correlation and causation.\n- Present confidence levels and margins of error when making predictions.\n- Use appropriate statistical methods for the data type and sample size.\n- Provide context \u2014 compare metrics against historical baselines, goals, and industry benchmarks when available.\n- Highlight both positive trends and areas of concern without bias.\n- Make recommendations actionable and tied to specific metrics.\n- Use clear visualisation descriptions (tables, charts) to aid understanding.\n- When sample sizes are small, explicitly note the limitations of any analysis.\n- Tailor the level of detail to the audience \u2014 summaries for leadership, detail for operators.\n\nWhen you derive a new insight or identify a significant pattern, explicitly note it so the system can store it as knowledge.\n\nAlways respond in a structured, data-driven way. Use markdown formatting with tables and lists where appropriate.";
    constructor(db: Knex);
    processMessage(message: AgentMessage): Promise<AgentResponse>;
    /**
     * Analyse trends in time-series data for a given metric.
     * Computes direction, slope, and percentage change, then asks the AI
     * for a narrative interpretation grounded in the DAO's context.
     */
    analyzeTrends(daoId: string, userId: string, params: {
        dataPoints: Array<{
            label: string;
            value: number;
            date: string;
        }>;
        metric: string;
    }): Promise<AgentResponse>;
    /**
     * Generate a dashboard report for the specified metrics and time period.
     */
    generateDashboard(daoId: string, userId: string, params: {
        metrics: string[];
        period: string;
        format: 'summary' | 'detailed';
    }): Promise<AgentResponse>;
    /**
     * Detect anomalies in a series of values for a given metric.
     * Uses a z-score approach against the provided threshold, then asks
     * the AI to interpret the flagged anomalies in context.
     */
    detectAnomalies(daoId: string, userId: string, params: {
        metric: string;
        values: number[];
        threshold: number;
    }): Promise<AgentResponse>;
    /**
     * Forecast future values for a metric based on historical data.
     * Uses a simple linear regression as a baseline, then asks the AI to
     * enrich the forecast with contextual reasoning.
     */
    forecastMetric(daoId: string, userId: string, params: {
        metric: string;
        historicalData: Array<{
            date: string;
            value: number;
        }>;
        forecastPeriods: number;
    }): Promise<AgentResponse>;
    /**
     * Save an analytics insight as a lesson in the knowledge base.
     */
    saveInsight(daoId: string, userId: string, insight: {
        title: string;
        content: string;
        metric?: string;
        tags?: string[];
    }): Promise<KnowledgeItem>;
    /**
     * Save a metric definition to the knowledge base for future reference.
     */
    saveMetricDefinition(daoId: string, userId: string, definition: {
        name: string;
        description: string;
        unit: string;
        target?: number;
        tags?: string[];
    }): Promise<KnowledgeItem>;
    /**
     * Record a data-driven decision in the knowledge base.
     */
    recordDecision(daoId: string, userId: string, decision: {
        title: string;
        rationale: string;
        supporting_metrics: string[];
        expected_outcome: string;
        tags?: string[];
    }): Promise<KnowledgeItem>;
    protected getRelevantKnowledge(daoId: string, _query: string, limit?: number): Promise<KnowledgeItem[]>;
    /**
     * Compute basic descriptive statistics for a numeric array.
     */
    private computeBasicStats;
    /**
     * Determine the overall trend direction and percentage change
     * from the first to last value.
     */
    private computeTrendDirection;
    /**
     * Detect anomalies using z-score method. A value is considered anomalous
     * if its absolute z-score exceeds the specified threshold.
     */
    private computeAnomalies;
    /**
     * Compute a simple linear regression forecast with confidence bands.
     * Uses the standard error of the estimate to build upper/lower bounds.
     */
    private computeLinearForecast;
    /**
     * Lightweight heuristic to detect when a user's message contains
     * hints about metrics, lessons, or decisions that should be persisted.
     */
    private extractAnalyticsHints;
}
//# sourceMappingURL=analytics.d.ts.map