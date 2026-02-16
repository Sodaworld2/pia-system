import type { Knex } from 'knex';
import type { AIModuleId, AgentModule } from '../types/foundation';
import { CoachModule } from './coach';
import { LegalModule } from './legal';
import { TreasuryModule } from './treasury';
import { GovernanceModule } from './governance';
import { CommunityModule } from './community';
import { ProductModule } from './product';
import { SecurityModule } from './security';
import { AnalyticsModule } from './analytics';
import { OnboardingModule } from './onboarding';
export type ModuleConstructor = new (db: Knex) => AgentModule;
export declare class ModuleRegistry {
    private modules;
    private db;
    constructor(db: Knex);
    getModule(id: AIModuleId): AgentModule;
    getAllModules(): AgentModule[];
    getStatus(): Promise<Record<string, {
        healthy: boolean;
        version: string;
        lastActive: string | null;
    }>>;
    get availableModules(): AIModuleId[];
}
export { CoachModule, LegalModule, TreasuryModule, GovernanceModule, CommunityModule, ProductModule, SecurityModule, AnalyticsModule, OnboardingModule, };
//# sourceMappingURL=index.d.ts.map