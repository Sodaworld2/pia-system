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

const MODULE_MAP: Record<AIModuleId, ModuleConstructor> = {
  coach: CoachModule,
  legal: LegalModule,
  treasury: TreasuryModule,
  governance: GovernanceModule,
  community: CommunityModule,
  product: ProductModule,
  security: SecurityModule,
  analytics: AnalyticsModule,
  onboarding: OnboardingModule,
};

export class ModuleRegistry {
  private modules: Map<AIModuleId, AgentModule> = new Map();
  private db: Knex;

  constructor(db: Knex) {
    this.db = db;
  }

  getModule(id: AIModuleId): AgentModule {
    let mod = this.modules.get(id);
    if (!mod) {
      const Ctor = MODULE_MAP[id];
      if (!Ctor) throw new Error(`Unknown module: ${id}`);
      mod = new Ctor(this.db);
      this.modules.set(id, mod);
    }
    return mod;
  }

  getAllModules(): AgentModule[] {
    const ids = Object.keys(MODULE_MAP) as AIModuleId[];
    return ids.map((id) => this.getModule(id));
  }

  async getStatus(): Promise<Record<string, { healthy: boolean; version: string; lastActive: string | null }>> {
    const result: Record<string, { healthy: boolean; version: string; lastActive: string | null }> = {};
    for (const [id, mod] of this.modules) {
      result[id] = await mod.getStatus();
    }
    return result;
  }

  get availableModules(): AIModuleId[] {
    return Object.keys(MODULE_MAP) as AIModuleId[];
  }
}

export {
  CoachModule,
  LegalModule,
  TreasuryModule,
  GovernanceModule,
  CommunityModule,
  ProductModule,
  SecurityModule,
  AnalyticsModule,
  OnboardingModule,
};
