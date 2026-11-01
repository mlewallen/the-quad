import type { Curve, Designer, Disruption, Milestone, Plan, Priority, Project, Schedule, Size, Workspace } from '../types';
import { WEEKS_PER_QUARTER } from '../types';
import { defaultConfig, DESIGNER_COLORS } from './defaults';
import { weeklyAllocation } from './curves';
import { quarterStartAbsWeek } from './quarters';
import { defaultPhasePlan, recommendedDuration } from './sizing';

/**
 * A realistic 10-designer workspace for demos and stress testing: ~44
 * projects, two plan scenarios, disruptions, milestones, pairs, a few
 * overloads, some unassigned work and a ranked backlog of unscheduled ideas. Deterministic, so screenshots and
 * bug reports are reproducible.
 */

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DESIGNERS = [
  'Ava Thompson', 'Kai Nakamura', 'Zoe Martinez', 'Omar Haddad', 'Lily Chen',
  'Mateo Rossi', 'Nia Okafor', 'Ethan Park', 'Isla Murphy', 'Ravi Patel',
];

const AREAS: Record<string, { pm: string; em: string; projects: [string, Size, Priority, string][] }> = {
  Checkout: {
    pm: 'Dana Ruiz', em: 'Sean Brooks',
    projects: [
      ['One-page checkout', 'XL', 'P0', 'Design'], ['Saved payment methods', 'M', 'P1', 'Design'], ['Order confirmation refresh', 'S', 'P2', 'Design'],
      ['Promo code UX', 'S', 'P3', 'Design'], ['Checkout analytics review', 'M', 'P2', 'Consult'], ['Tax & shipping estimator', 'M', 'P1', 'Design'],
    ],
  },
  Search: {
    pm: 'Priya Shah', em: 'Tom Becker',
    projects: [
      ['Faceted filters v2', 'L', 'P1', 'Design'], ['Search results density', 'M', 'P2', 'Design'], ['Typeahead suggestions', 'M', 'P1', 'Design'],
      ['Zero-results recovery', 'S', 'P2', 'Design'], ['Search relevance study', 'M', 'P3', 'Consult'],
    ],
  },
  Onboarding: {
    pm: 'Marcus Lee', em: 'Ana Costa',
    projects: [
      ['New user checklist', 'L', 'P0', 'Design'], ['Workspace templates', 'M', 'P1', 'Design'], ['Invite teammates flow', 'M', 'P1', 'Design'],
      ['Empty states audit', 'S', 'P2', 'Design'], ['Activation metrics consult', 'S', 'P3', 'Consult'],
    ],
  },
  Mobile: {
    pm: 'Grace Liu', em: 'Ben Ortiz',
    projects: [
      ['Mobile navigation redesign', 'XL', 'P0', 'Design'], ['Offline mode states', 'M', 'P2', 'Design'], ['Push notification settings', 'S', 'P2', 'Design'],
      ['Tablet layouts', 'L', 'P3', 'Design'], ['App store screenshots', 'S', 'P3', 'Design'], ['Mobile perf monitoring', 'M', 'P2', 'Monitor'],
    ],
  },
  Growth: {
    pm: 'Elena Novak', em: 'Chris Hall',
    projects: [
      ['Pricing page experiment', 'M', 'P1', 'Design'], ['Upgrade prompts', 'M', 'P1', 'Design'], ['Referral program', 'L', 'P2', 'Design'],
      ['Trial expiry emails', 'S', 'P2', 'Design'], ['Growth experiment reviews', 'M', 'P3', 'Monitor'],
    ],
  },
  'Design system': {
    pm: 'Jules Martin', em: 'Ivy Chen',
    projects: [
      ['Color tokens v3', 'L', 'P1', 'Design'], ['Data table component', 'XL', 'P0', 'Design'], ['Date picker', 'M', 'P2', 'Design'],
      ['Icon library refresh', 'M', 'P2', 'Design'], ['Accessibility audit', 'L', 'P1', 'Consult'], ['Component adoption tracking', 'M', 'P3', 'Monitor'],
    ],
  },
  Platform: {
    pm: 'Noor Aziz', em: 'Leo Grant',
    projects: [
      ['Admin console IA', 'L', 'P1', 'Design'], ['Audit log viewer', 'M', 'P2', 'Design'], ['SSO setup wizard', 'M', 'P1', 'Design'],
      ['Usage & billing dashboard', 'L', 'P0', 'Design'], ['API keys management', 'S', 'P2', 'Design'], ['Permissions model consult', 'M', 'P2', 'Consult'],
      ['Status page', 'S', 'P3', 'Design'], ['Platform reliability reviews', 'S', 'P3', 'Monitor'],
    ],
  },
};

/** Unscheduled ideas waiting in the backlog, already ranked. */
const UNSCHEDULED: [string, Size, Priority, string, string][] = [
  ['Notifications inbox', 'L', 'P1', 'Design', 'Platform'],
  ['Dark mode', 'XL', 'P2', 'Design', 'Design system'],
  ['Help center redesign', 'M', 'P2', 'Design', 'Onboarding'],
  ['Localization readiness review', 'M', 'P2', 'Consult', 'Platform'],
  ['Wishlist and saved items', 'L', 'P3', 'Design', 'Checkout'],
];

const GOALS = ['Grow paid conversion 15%', 'Halve time-to-value for new teams', 'Ship mobile parity', 'Raise accessibility to WCAG AA', 'Enterprise readiness'];
const AREA_GOAL: Record<string, string> = {
  Checkout: GOALS[0], Growth: GOALS[0], Search: GOALS[1], Onboarding: GOALS[1], Mobile: GOALS[2], 'Design system': GOALS[3], Platform: GOALS[4],
};
const CURVES: Curve['shape'][] = ['flat', 'flat', 'flat', 'front', 'back', 'bell'];

export interface DemoData {
  workspace: Workspace;
  projects: Project[];
  plans: Plan[];
  disruptions: Disruption[];
}

export function buildDemo(quarter: number, startMonth: number, makeId: () => string): DemoData {
  const rand = rng(20261030);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const config = defaultConfig('product');
  const designers: Designer[] = DESIGNERS.map((name, i) => ({ id: makeId(), name, color: DESIGNER_COLORS[i % DESIGNER_COLORS.length] }));
  const workspace: Workspace = { id: makeId(), name: 'Demo · Product Design (10)', designers, config };
  const qStart = quarterStartAbsWeek(quarter, startMonth);
  const H = WEEKS_PER_QUARTER + 8;

  // --- disruptions -------------------------------------------------------
  const disruptions: Disruption[] = [];
  const addD = (ids: string[], type: string, label: string, start: number, duration: number, allocation: number, shape: Curve['shape'] = 'flat') =>
    disruptions.push({ id: makeId(), workspaceId: workspace.id, designerIds: ids, type, label, startAbsWeek: qStart + start, duration, allocation, curve: { shape } });
  const d = (n: string) => designers.find((x) => x.name.startsWith(n))!.id;
  addD([d('Ava')], 'PTO', 'Family trip', 6, 2, 100);
  addD([d('Omar')], 'PTO', 'Holiday', 8, 1, 100);
  addD([d('Lily')], 'PTO', 'Wedding', 3, 1, 100);
  addD([d('Ethan')], 'PTO', '', 11, 2, 100);
  addD([d('Ravi')], 'Onboarding', 'New hire ramp-up', 0, 4, 60, 'front');
  designers.slice(0, 8).forEach((x, i) => addD([x.id], 'On-call', 'Design support rotation', (i * 2) % 12, 1, 20));
  addD(designers.map((x) => x.id), 'Offsite', 'Team offsite', 5, 1, 20);
  addD([d('Zoe'), d('Kai'), d('Nia')], 'Interviews', 'Hiring loop', 1, 10, 10);

  // Seed per-designer weekly load with disruptions so placement accounts for them.
  const load: Record<string, number[]> = Object.fromEntries(designers.map((x) => [x.id, Array(H).fill(0)]));
  for (const dis of disruptions)
    for (const id of dis.designerIds) weeklyAllocation(dis.curve, dis.duration, dis.allocation).forEach((v, i) => {
      const w = dis.startAbsWeek - qStart + i;
      if (w >= 0 && w < H) load[id][w] += v;
    });

  // --- projects ----------------------------------------------------------
  const projects: Project[] = [];
  const nextQuarter: Project[] = [];
  let ticket = 101;
  let n = 0;
  for (const [area, info] of Object.entries(AREAS)) {
    for (const [name, size, priority, workType] of info.projects) {
      // About 40% of non-P0 work is already slotted for next quarter,
      // which keeps this quarter near (not far past) the team's capacity.
      const later = priority !== 'P0' && n++ % 5 >= 3;
      (later ? nextQuarter : projects).push({
        id: makeId(), workspaceId: workspace.id, quarter: later ? quarter + 1 : quarter, backlogRank: null, draft: null, name, ticket: `DSN-${ticket++}`, reference: '',
        workType, size, priority, epic: size === 'XL', pm: info.pm, em: info.em, goal: AREA_GOAL[area], gaTargetWeek: null, gaTargetText: '',
        productArea: area, notes: '', createdAt: Date.now(),
      });
    }
  }

  // Unscheduled ideas carry a draft plan; the top two are already broken into phases and tasks.
  const unscheduled: Project[] = UNSCHEDULED.map(([name, size, priority, workType, area], i) => {
    const allocation = workType === 'Design' ? 50 : 20;
    const duration = recommendedDuration(workType, size, allocation);
    const key = `DSN-${ticket++}`;
    return {
      id: makeId(), workspaceId: workspace.id, quarter: null, backlogRank: i, name, ticket: key, reference: '',
      workType, size, priority, epic: true, pm: AREAS[area].pm, em: AREAS[area].em, goal: AREA_GOAL[area], gaTargetWeek: null, gaTargetText: '',
      productArea: area, notes: '', createdAt: Date.now(),
      draft: {
        designerId: i === 0 ? designers[0].id : null, pairDesignerId: null, phaseOverride: null, startWeek: 0, duration, allocation,
        phasePlan: i < 2 ? defaultPhasePlan(config.phases, duration).map((p) => ({ ...p, ticket: `DSN-${ticket++}` })) : null,
        curve: { shape: 'flat' }, confirmed: false,
        milestones: i < 2 ? [
          { id: makeId(), type: 'Concepts', offset: Math.floor(duration * 0.3), note: 'Review with PM', kind: 'deliver' },
          { id: makeId(), type: 'Specs', offset: Math.floor(duration * 0.7), note: 'Eng sizing', kind: 'input' },
          { id: makeId(), type: 'Handoff', offset: duration - 1, note: '', kind: 'deliver' },
        ] : [],
      },
    };
  });

  // --- Plan A: greedy, priority-first placement ---------------------------
  const PRI = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const order = projects.slice().sort((a, b) => PRI[a.priority] - PRI[b.priority] || rand() - 0.5);
  const unassigned = new Set(order.filter((p) => p.priority === 'P3').slice(0, 5).map((p) => p.id));
  unassigned.add(order.find((p) => p.priority === 'P2' && p.workType === 'Design')!.id);

  const schedulesA: Record<string, Schedule> = {};
  const phases = config.phases;
  for (const p of order) {
    const allocation = p.workType === 'Design' ? pick([30, 40, 40, 50]) : p.workType === 'Consult' ? pick([15, 20]) : 10;
    const curve: Curve = { shape: p.workType === 'Design' ? pick(CURVES) : 'flat' };
    const duration = Math.min(16, recommendedDuration(p.workType, p.size, allocation));
    const weekly = weeklyAllocation(curve, duration, allocation);
    let best = { designer: designers[0].id, start: 0, score: Infinity };
    if (!unassigned.has(p.id)) {
      for (const des of designers) {
        for (let start = 0; start <= Math.max(0, WEEKS_PER_QUARTER - Math.min(duration, WEEKS_PER_QUARTER)); start++) {
          let peak = 0;
          let sum = 0;
          weekly.forEach((v, i) => {
            const t = load[des.id][start + i] + v;
            peak = Math.max(peak, t);
            sum += t;
          });
          // Stay under 100% when any slot allows it, then spread work by average
          // load in the window; high priority prefers early starts. A little jitter
          // keeps the plan looking hand-made.
          const mean = sum / weekly.length;
          const score = (peak > 100 ? 1000 + peak * 4 : 0) + mean + start * (p.priority === 'P0' ? 4 : p.priority === 'P1' ? 2 : 0.5) + rand() * 8;
          if (score < best.score) best = { designer: des.id, start, score };
        }
      }
      weekly.forEach((v, i) => (load[best.designer][best.start + i] += v));
    }
    const assigned = !unassigned.has(p.id);
    const milestones: Milestone[] =
      p.workType === 'Design' && duration >= 4
        ? [
            { id: makeId(), type: 'Concepts', offset: Math.floor(duration * 0.3), note: '', kind: 'deliver' as const },
            { id: makeId(), type: 'Crit', offset: Math.floor(duration * 0.55), note: rand() > 0.6 ? 'With leadership' : '', kind: 'input' as const },
            { id: makeId(), type: 'Handoff', offset: duration - 1, note: '', kind: 'deliver' as const },
          ].slice(0, rand() > 0.3 ? 3 : 1)
        : [];
    schedulesA[p.id] = {
      designerId: assigned ? best.designer : null,
      pairDesignerId: null,
      // Phases follow the schedule; a few are pinned by hand below.
      phaseOverride: null,
      phasePlan: null,
      startWeek: assigned ? best.start : 0,
      duration,
      allocation,
      curve,
      confirmed: assigned && (p.priority === 'P0' || rand() > 0.45),
      milestones,
    };
  }
  // A few pairings on the biggest projects, and one deliberately stretched designer.
  // Pairs go to whoever has the most room during the project, counted at half load.
  for (const p of projects.filter((x) => x.size === 'XL' && schedulesA[x.id].designerId).slice(0, 3)) {
    const s = schedulesA[p.id];
    const weekly = weeklyAllocation(s.curve, s.duration, s.allocation).map((v) => v / 2);
    const peakFor = (id: string) => Math.max(...weekly.map((v, i) => load[id][s.startWeek + i] + v));
    const pair = designers.filter((x) => x.id !== s.designerId).sort((a, b) => peakFor(a.id) - peakFor(b.id))[0];
    if (peakFor(pair.id) > 100) continue;
    s.pairDesignerId = pair.id;
    weekly.forEach((v, i) => (load[pair.id][s.startWeek + i] += v));
  }
  // Manual phase overrides: one P0 already in review ahead of schedule, one
  // waiting on research that the schedule says should be done.
  const scheduled = order.filter((p) => schedulesA[p.id].designerId && p.workType === 'Design');
  const reviewEarly = scheduled.find((p) => p.priority === 'P0');
  if (reviewEarly) schedulesA[reviewEarly.id].phaseOverride = phases.find((x) => /approv/i.test(x)) ?? null;
  const stuck = scheduled.find((p) => p.priority === 'P1' && schedulesA[p.id].startWeek <= 2);
  if (stuck) schedulesA[stuck.id].phaseOverride = phases[0];
  // The epics are planned phase by phase, each phase a task under the epic.
  for (const p of projects.filter((x) => x.epic && schedulesA[x.id].designerId)) {
    const s = schedulesA[p.id];
    s.phasePlan = defaultPhasePlan(phases, s.duration).map((x) => ({ ...x, ticket: `DSN-${ticket++}` }));
  }
  // One deliberately stretched designer, so the overload paths have something to show.
  const kai = d('Kai');
  const extra = projects.find((x) => schedulesA[x.id].designerId && schedulesA[x.id].designerId !== kai && x.priority === 'P2');
  if (extra) schedulesA[extra.id] = { ...schedulesA[extra.id], designerId: kai, startWeek: 2, confirmed: false };

  // GA targets: most P0/P1 work launches a few weeks after design wraps; one is
  // squeezed so design runs past GA, and one still has a free-text note.
  const launches = projects.filter((p) => p.priority !== 'P2' && p.priority !== 'P3' && schedulesA[p.id].designerId);
  launches.forEach((p, i) => {
    const s = schedulesA[p.id];
    p.gaTargetWeek = qStart + s.startWeek + s.duration - 1 + (i === 1 ? -2 : 2 + (i % 3));
  });
  const noted = projects.find((p) => p.priority === 'P2' && p.gaTargetWeek == null);
  if (noted) noted.gaTargetText = 'After the pricing review';

  // --- Plan B: same work, a different staffing bet ------------------------
  const schedulesB: Record<string, Schedule> = structuredClone(schedulesA);
  const shuffled = projects.filter((p) => schedulesB[p.id].designerId).sort(() => rand() - 0.5).slice(0, 9);
  for (const p of shuffled) {
    const s = schedulesB[p.id];
    s.designerId = pick(designers.filter((x) => x.id !== s.designerId)).id;
    s.startWeek = Math.max(0, Math.min(WEEKS_PER_QUARTER - 2, s.startWeek + pick([-2, -1, 1, 2, 3])));
    s.confirmed = false;
    if (s.pairDesignerId === s.designerId) s.pairDesignerId = null;
  }
  for (const id of unassigned) if (rand() > 0.4) schedulesB[id].designerId = pick(designers).id;

  const now = Date.now();
  // Next quarter: one draft plan, everything still unassigned.
  const draft: Record<string, Schedule> = {};
  for (const p of nextQuarter) {
    const allocation = p.workType === 'Design' ? 40 : p.workType === 'Consult' ? 20 : 10;
    draft[p.id] = {
      designerId: null, pairDesignerId: null, phaseOverride: null, phasePlan: null, startWeek: 0, allocation,
      duration: recommendedDuration(p.workType, p.size, allocation), curve: { shape: 'flat' }, confirmed: false, milestones: [],
    };
  }
  const plans: Plan[] = [
    { id: makeId(), workspaceId: workspace.id, quarter, name: 'Plan A · Priority-first', createdAt: now, schedules: schedulesA },
    { id: makeId(), workspaceId: workspace.id, quarter, name: 'Plan B · Rebalanced', createdAt: now + 1, schedules: schedulesB },
    { id: makeId(), workspaceId: workspace.id, quarter: quarter + 1, name: 'Draft', createdAt: now + 2, schedules: draft },
  ];
  return { workspace, projects: [...projects, ...nextQuarter, ...unscheduled], plans, disruptions };
}
