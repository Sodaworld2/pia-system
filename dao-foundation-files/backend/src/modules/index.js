import { CoachModule } from './coach';
import { LegalModule } from './legal';
import { TreasuryModule } from './treasury';
import { GovernanceModule } from './governance';
import { CommunityModule } from './community';
import { ProductModule } from './product';
import { SecurityModule } from './security';
import { AnalyticsModule } from './analytics';
import { OnboardingModule } from './onboarding';
const MODULE_MAP = {
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
    modules = new Map();
    db;
    constructor(db) {
        this.db = db;
    }
    getModule(id) {
        let mod = this.modules.get(id);
        if (!mod) {
            const Ctor = MODULE_MAP[id];
            if (!Ctor)
                throw new Error(`Unknown module: ${id}`);
            mod = new Ctor(this.db);
            this.modules.set(id, mod);
        }
        return mod;
    }
    getAllModules() {
        const ids = Object.keys(MODULE_MAP);
        return ids.map((id) => this.getModule(id));
    }
    async getStatus() {
        const result = {};
        for (const [id, mod] of this.modules) {
            result[id] = await mod.getStatus();
        }
        return result;
    }
    get availableModules() {
        return Object.keys(MODULE_MAP);
    }
}
export { CoachModule, LegalModule, TreasuryModule, GovernanceModule, CommunityModule, ProductModule, SecurityModule, AnalyticsModule, OnboardingModule, };
//# sourceMappingURL=index.js.map