# African Worldview & Ideology Sensemaking Engine
## Module Spec for the Digital Twin Brain
**Created:** 2026-02-25
**Author:** Michael Balkind
**Status:** Design Spec — Ready for integration into PIA Brain architecture

---

## Purpose

Help Mic (and the digital twin) understand how people's worldviews shape:
- What they trust
- What they fear
- What they think is "right"
- How they interpret power
- How they respond to change

...without stereotyping, assigning protected traits, or pretending certainty.

---

## 1. Module Outputs

### Output A: "Perspective Map" (not labels)

Instead of "liberal/conservative," produce a multi-axis profile:

| Axis | Low ↔ High |
|------|-----------|
| Stability ↔ Change | |
| Collective duty (Ubuntu) ↔ Individual autonomy | |
| Institution-trust ↔ Institution-skeptic | |
| Tradition/sacred ↔ Secular/experimental | |
| Hierarchy/elders ↔ Egalitarian/peer | |
| Localism ↔ Globalism | |
| Restorative justice ↔ Retributive justice | |
| Market-first ↔ Social-first | |
| Story-based truth ↔ Data-based truth | |
| Trauma-aware ↔ Trauma-blind | |

Each axis scored: **low / medium / high** with confidence level and supporting evidence quotes.

### Output B: "Communication Strategy"
- What framing will resonate
- What words to avoid
- What topics may trigger identity threat
- How to ask clarifying questions safely

### Output C: "Ethics Report"
- What the model inferred
- What it refused to infer
- What assumptions are risky
- What it needs to ask to improve confidence

---

## 2. Africa-Specific Lens Layer

### A) Coloniality & Power Memory
- Suspicion of institutions
- Sensitivity to extraction
- "Who benefits?" reflex
- Preference for sovereignty and local ownership

### B) Community-First Social Logic (Ubuntu)
- Personhood through relationships
- Obligation and reciprocity
- Dignity and communal continuity

### C) Spiritual Realism
- Sacred framing
- Ancestors/faith references
- Moral surveillance / God-as-witness
- **No judgment** — detect, don't evaluate

### D) Patronage vs Bureaucracy Reality
- Networks, gatekeepers, informal trust systems
- "Corruption talk" blends moral + survival logic

### E) Urban Hybridity
- People can be simultaneously: traditional at home, hyper-modern online, globally fluent, locally rooted
- **Multi-identity coexistence** must be allowed

---

## 3. Allowed Evidence Signals

Only observable signals:
- Language choices ("order," "freedom," "dignity," "tradition," "innovation")
- Moral vocabulary (harm, fairness, loyalty, authority, sanctity, liberty)
- Authority stance (elders, law, institutions, decentralization)
- Change stance (risk language, nostalgia vs future talk)
- Social orientation (we/us/community vs me/my autonomy)
- Causal style (story-based vs metric-based)
- Trust style (credentials vs lived experience)
- Conflict style (restorative vs punitive)

**Always show:** "Here's the line that made me think this."

---

## 4. Hard Ethical Guardrails

### Must NOT:
- Infer race, religion, sexuality, nationality, tribe/ethnicity
- Claim political ideology as fact
- Use proxies ("accent means X")
- Generate stereotypes ("Africans are…")

### Must:
- Use probability language ("may," "likely," "uncertain")
- Request clarification when confidence is low
- Give multiple plausible interpretations
- Allow people to be mixed/contradictory

---

## 5. The "Soul of Humans" Component

**Soul = Value Core + Sacred Commitments + Identity Wounds + Hope Narrative**

### A) Value Core Hypotheses
What they protect at all costs: dignity, freedom, community, faith, security, achievement, fairness, tradition

### B) Sacred Commitments
What is "non-negotiable" to them.

### C) Identity Wounds / Threats (handle gently)
Triggers: disrespect, humiliation, exclusion, "selling out," tribal betrayal, loss of control, moral shame

### D) Hope Narrative
Motivating future story: progress/modernity, restoration of dignity, stability and safety, spiritual fulfillment, prosperity

---

## 6. Integration Into Brain Architecture

```
SOUL LAYER
  └─ Ethics & Dignity Guard (always on)
  └─ African Worldview Lens (context)

MIND LAYER
  └─ Perspective Mapping Engine  ← THIS MODULE
  └─ Narrative Framing Engine
  └─ Leverage + Systems Synthesizer

BRAIN LAYER
  └─ Conversation Planner (questions, probes)
  └─ Evidence Extractor (quotes, behaviors)
  └─ Uncertainty + Confidence Scorer

MEMORY LAYER
  └─ Person Profiles (versioned, editable, consent-aware)
```

---

## 7. Real-Time Output Example

> "Based on their repeated emphasis on 'respect,' 'elders,' and 'order,' they may prefer stability-oriented solutions and authority legitimacy. **Confidence: medium.**
> Alternative interpretation: they may be reacting to recent insecurity rather than holding a fixed ideology.
> Recommended framing: continuity, dignity, and practical safety.
> Clarifying question: 'When you say order, do you mean stronger rules, stronger community norms, or stronger leadership?'"

---

## 8. Academic Backbone (Knowledge Base Spine)

### Africa-First
- African philosophy (Ubuntu / personhood / community ethics)
- Postcolonial thought (coloniality of power, identity, extraction)
- Political anthropology (informal power, patronage, legitimacy)
- Trauma + collective memory

### Global Classics
- Moral psychology (Moral Foundations Theory — Haidt)
- Narrative identity (McAdams)
- Political psychology (ideology as motivated cognition)

### Scope Decision
**All three lenses** (default):
- Southern Africa (SA/Zim/Bots/Lesotho) civic + post-apartheid lenses
- Pan-African postcolonial + sovereignty lenses
- Urban youth / digital Africa culture lenses

---

## Design Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Label system | Axes not categories | Avoids reductive political labels |
| Africa lens | All 3 (Southern + Pan-African + Urban) | Mic operates across all contexts |
| Ethics approach | Observable signals only | POPIA + dignity compliance |
| Soul definition | Operational (Value Core + Sacred + Wounds + Hope) | Avoids mysticism, keeps analytical power |
