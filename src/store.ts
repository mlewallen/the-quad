import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Designer, Disruption, ID, PersistedState, Plan, Project, Schedule, Settings, Size, TeamType, Workspace,
} from './types';
import { DEFAULT_SETTINGS, DESIGNER_COLORS, defaultConfig } from './lib/defaults';
import { currentQuarter } from './lib/quarters';
import { defaultAllocation, recommendedDuration } from './lib/sizing';

export const STORAGE_KEY = 'the-quad';
export const STATE_VERSION = 2;

export const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

export const planKey = (workspaceId: ID, quarter: number) => `${workspaceId}:${quarter}`;

export interface Celebration {
  id: number;
  message: string;
}

export interface NewInitiative {
  name: string;
  designerId?: ID | null;
  size?: Size;
  workType?: string;
  priority?: Project['priority'];
  startWeek?: number;
  extra?: Partial<Project>;
}

interface Actions {
  completeOnboarding(input: {
    workspaceName: string;
    teamType: TeamType;
    fiscalStartMonth: number;
    disruptionTypes: string[];
    milestoneTypes: string[];
    designers: { name: string; color: string }[];
    initiatives: { name: string; designerIndex: number | null; size: Size }[];
  }): void;
  setQuarter(q: number): void;
  setActiveWorkspace(id: ID): void;
  createWorkspace(name: string, teamType: TeamType): ID;
  updateWorkspace(id: ID, patch: Partial<Omit<Workspace, 'id'>>): void;
  deleteWorkspace(id: ID): void;
  addDesigner(name: string, color?: string): void;
  updateDesigner(id: ID, patch: Partial<Designer>): void;
  removeDesigner(id: ID): void;
  ensurePlan(): void;
  setActivePlan(id: ID): void;
  createPlan(name?: string): ID;
  duplicatePlan(id: ID): ID;
  renamePlan(id: ID, name: string): void;
  deletePlan(id: ID): void;
  addInitiatives(items: NewInitiative[]): ID[];
  updateProject(id: ID, patch: Partial<Project>): void;
  updateSchedule(projectId: ID, patch: Partial<Schedule>, planId?: ID): void;
  bulkUpdate(ids: ID[], project: Partial<Project>, schedule: Partial<Schedule>): void;
  deleteProjects(ids: ID[]): void;
  addDisruption(d: Omit<Disruption, 'id' | 'workspaceId'>): void;
  updateDisruption(id: ID, patch: Partial<Disruption>): void;
  removeDisruption(id: ID): void;
  updateSettings(patch: Partial<Settings>): void;
  clearQuarter(): void;
  factoryReset(): void;
  replaceAll(data: PersistedState): void;
  celebrate(message: string): void;
  dismissCelebration(): void;
}

export type Store = PersistedState & Actions & { celebration: Celebration | null };

function initialState(): PersistedState {
  return {
    version: STATE_VERSION,
    onboarded: false,
    workspaces: [],
    activeWorkspaceId: null,
    projects: [],
    plans: [],
    disruptions: [],
    activePlan: {},
    currentQuarter: currentQuarter(DEFAULT_SETTINGS.fiscalStartMonth),
    settings: { ...DEFAULT_SETTINGS },
    totalPlansCreated: 0,
  };
}

export function defaultSchedule(ws: Workspace | undefined, project: Pick<Project, 'workType' | 'size'>): Schedule {
  const allocation = defaultAllocation(project.workType);
  return {
    designerId: null,
    pairDesignerId: null,
    phase: ws?.config.phases[0] ?? '',
    startWeek: 0,
    duration: recommendedDuration(project.workType, project.size, allocation),
    allocation,
    curve: { shape: 'flat' },
    confirmed: false,
    milestones: [],
  };
}

function blankProject(ws: Workspace, quarter: number, name: string): Project {
  return {
    id: uid(),
    workspaceId: ws.id,
    quarter,
    name,
    ticket: '',
    reference: '',
    workType: ws.config.workTypes[0] ?? 'Design',
    size: 'M',
    priority: 'P2',
    epic: false,
    pm: '',
    em: '',
    goal: '',
    gaTarget: '',
    productArea: '',
    notes: '',
    createdAt: Date.now(),
  };
}

const isApprove = (phase: string | undefined) => !!phase && /approv/i.test(phase);

function allConfirmed(plan: Plan | undefined): boolean {
  if (!plan) return false;
  const s = Object.values(plan.schedules);
  return s.length > 0 && s.every((x) => x.designerId && x.confirmed);
}

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      const ws = () => get().workspaces.find((w) => w.id === get().activeWorkspaceId);
      const activePlanId = () => {
        const s = get();
        return s.activeWorkspaceId ? s.activePlan[planKey(s.activeWorkspaceId, s.currentQuarter)] : undefined;
      };
      const mapPlan = (planId: ID | undefined, fn: (p: Plan) => Plan) =>
        set((s) => ({ plans: s.plans.map((p) => (p.id === planId ? fn(p) : p)) }));

      /** Wrap schedule mutations so celebrations fire on meaningful transitions. */
      const withScheduleCelebrations = (planId: ID | undefined, mutate: () => void, phaseTargets: ID[]) => {
        const before = get().plans.find((p) => p.id === planId);
        const wasAll = allConfirmed(before);
        const prevPhases = phaseTargets.map((id) => before?.schedules[id]?.phase);
        mutate();
        const after = get().plans.find((p) => p.id === planId);
        if (!wasAll && allConfirmed(after)) get().celebrate(`Every assignment in ${after!.name} is confirmed`);
        else if (phaseTargets.some((id, i) => !isApprove(prevPhases[i]) && isApprove(after?.schedules[id]?.phase)))
          get().celebrate('Moved to Approve — nice progress');
      };

      return {
        ...initialState(),
        celebration: null,

        completeOnboarding(input) {
          const config = defaultConfig(input.teamType);
          config.disruptionTypes = input.disruptionTypes;
          config.milestoneTypes = input.milestoneTypes;
          const workspace: Workspace = {
            id: uid(),
            name: input.workspaceName.trim() || 'Design team',
            designers: input.designers.map((d) => ({ id: uid(), name: d.name.trim(), color: d.color })),
            config,
          };
          const quarter = currentQuarter(input.fiscalStartMonth);
          const plan: Plan = { id: uid(), workspaceId: workspace.id, quarter, name: 'Plan A', createdAt: Date.now(), schedules: {} };
          const projects: Project[] = [];
          // Stagger seeded work per designer so the first view isn't a pile-up at week 1.
          const cursor: Record<string, number> = {};
          for (const item of input.initiatives) {
            if (!item.name.trim()) continue;
            const p = { ...blankProject(workspace, quarter, item.name.trim()), size: item.size };
            const sched = defaultSchedule(workspace, p);
            const designer = item.designerIndex != null ? workspace.designers[item.designerIndex] : undefined;
            if (designer) {
              sched.designerId = designer.id;
              const at = cursor[designer.id] ?? 0;
              sched.startWeek = Math.min(at, 12);
              cursor[designer.id] = at + Math.ceil(sched.duration / 2);
            }
            projects.push(p);
            plan.schedules[p.id] = sched;
          }
          set({
            onboarded: true,
            workspaces: [...get().workspaces, workspace],
            activeWorkspaceId: workspace.id,
            projects: [...get().projects, ...projects],
            plans: [...get().plans, plan],
            activePlan: { ...get().activePlan, [planKey(workspace.id, quarter)]: plan.id },
            currentQuarter: quarter,
            settings: { ...get().settings, fiscalStartMonth: input.fiscalStartMonth },
            totalPlansCreated: get().totalPlansCreated + 1,
          });
        },

        setQuarter(q) {
          set({ currentQuarter: q });
          get().ensurePlan();
        },

        setActiveWorkspace(id) {
          set({ activeWorkspaceId: id });
          get().ensurePlan();
        },

        createWorkspace(name, teamType) {
          const workspace: Workspace = { id: uid(), name, designers: [], config: defaultConfig(teamType) };
          set((s) => ({ workspaces: [...s.workspaces, workspace], activeWorkspaceId: workspace.id }));
          get().ensurePlan();
          return workspace.id;
        },

        updateWorkspace(id, patch) {
          set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, ...patch } : w)) }));
        },

        deleteWorkspace(id) {
          set((s) => {
            const workspaces = s.workspaces.filter((w) => w.id !== id);
            return {
              workspaces,
              projects: s.projects.filter((p) => p.workspaceId !== id),
              plans: s.plans.filter((p) => p.workspaceId !== id),
              disruptions: s.disruptions.filter((d) => d.workspaceId !== id),
              activeWorkspaceId: s.activeWorkspaceId === id ? workspaces[0]?.id ?? null : s.activeWorkspaceId,
            };
          });
        },

        addDesigner(name, color) {
          const w = ws();
          if (!w) return;
          const used = new Set(w.designers.map((d) => d.color));
          const c = color ?? DESIGNER_COLORS.find((x) => !used.has(x)) ?? DESIGNER_COLORS[w.designers.length % DESIGNER_COLORS.length];
          get().updateWorkspace(w.id, { designers: [...w.designers, { id: uid(), name, color: c }] });
        },

        updateDesigner(id, patch) {
          const w = ws();
          if (!w) return;
          get().updateWorkspace(w.id, { designers: w.designers.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
        },

        removeDesigner(id) {
          const w = ws();
          if (!w) return;
          get().updateWorkspace(w.id, { designers: w.designers.filter((d) => d.id !== id) });
          set((s) => ({
            plans: s.plans.map((p) => {
              const schedules: Record<ID, Schedule> = {};
              for (const [k, v] of Object.entries(p.schedules)) {
                schedules[k] = {
                  ...v,
                  designerId: v.designerId === id ? null : v.designerId,
                  pairDesignerId: v.pairDesignerId === id ? null : v.pairDesignerId,
                  confirmed: v.designerId === id ? false : v.confirmed,
                };
              }
              return { ...p, schedules };
            }),
            disruptions: s.disruptions
              .map((d) => ({ ...d, designerIds: d.designerIds.filter((x) => x !== id) }))
              .filter((d) => d.designerIds.length > 0),
          }));
        },

        ensurePlan() {
          const s = get();
          const w = ws();
          if (!w) return;
          const key = planKey(w.id, s.currentQuarter);
          const existing = s.plans.filter((p) => p.workspaceId === w.id && p.quarter === s.currentQuarter);
          if (existing.some((p) => p.id === s.activePlan[key])) return;
          if (existing.length) {
            set({ activePlan: { ...s.activePlan, [key]: existing[0].id } });
            return;
          }
          const schedules: Record<ID, Schedule> = {};
          for (const p of s.projects) if (p.workspaceId === w.id && p.quarter === s.currentQuarter) schedules[p.id] = defaultSchedule(w, p);
          const plan: Plan = { id: uid(), workspaceId: w.id, quarter: s.currentQuarter, name: 'Plan A', createdAt: Date.now(), schedules };
          set({ plans: [...s.plans, plan], activePlan: { ...s.activePlan, [key]: plan.id } });
        },

        setActivePlan(id) {
          const s = get();
          if (!s.activeWorkspaceId) return;
          set({ activePlan: { ...s.activePlan, [planKey(s.activeWorkspaceId, s.currentQuarter)]: id } });
        },

        createPlan(name) {
          const s = get();
          const w = ws()!;
          const siblings = s.plans.filter((p) => p.workspaceId === w.id && p.quarter === s.currentQuarter);
          const schedules: Record<ID, Schedule> = {};
          for (const p of s.projects) if (p.workspaceId === w.id && p.quarter === s.currentQuarter) schedules[p.id] = defaultSchedule(w, p);
          const plan: Plan = {
            id: uid(),
            workspaceId: w.id,
            quarter: s.currentQuarter,
            name: name ?? `Plan ${String.fromCharCode(65 + siblings.length)}`,
            createdAt: Date.now(),
            schedules,
          };
          registerPlan(plan);
          return plan.id;
        },

        duplicatePlan(id) {
          const src = get().plans.find((p) => p.id === id)!;
          const plan: Plan = {
            ...structuredClone(src),
            id: uid(),
            name: `${src.name} copy`,
            createdAt: Date.now(),
          };
          registerPlan(plan);
          return plan.id;
        },

        renamePlan(id, name) {
          mapPlan(id, (p) => ({ ...p, name }));
        },

        deletePlan(id) {
          const s = get();
          const plan = s.plans.find((p) => p.id === id);
          if (!plan) return;
          const siblings = s.plans.filter((p) => p.workspaceId === plan.workspaceId && p.quarter === plan.quarter && p.id !== id);
          if (!siblings.length) return;
          const key = planKey(plan.workspaceId, plan.quarter);
          set({
            plans: s.plans.filter((p) => p.id !== id),
            activePlan: s.activePlan[key] === id ? { ...s.activePlan, [key]: siblings[0].id } : s.activePlan,
          });
        },

        addInitiatives(items) {
          const s = get();
          const w = ws();
          if (!w || !items.length) return [];
          get().ensurePlan();
          const quarterWasEmpty = !s.projects.some((p) => p.workspaceId === w.id && p.quarter === s.currentQuarter);
          const active = activePlanId();
          const created: Project[] = items.map((it) => ({
            ...blankProject(w, s.currentQuarter, it.name),
            ...(it.size ? { size: it.size } : {}),
            ...(it.workType ? { workType: it.workType } : {}),
            ...(it.priority ? { priority: it.priority } : {}),
            ...it.extra,
          }));
          set((st) => ({
            projects: [...st.projects, ...created],
            plans: st.plans.map((p) => {
              if (p.workspaceId !== w.id || p.quarter !== st.currentQuarter) return p;
              const schedules = { ...p.schedules };
              created.forEach((proj, i) => {
                const sched = defaultSchedule(w, proj);
                if (p.id === active) {
                  sched.designerId = items[i].designerId ?? null;
                  sched.startWeek = items[i].startWeek ?? 0;
                }
                schedules[proj.id] = sched;
              });
              return { ...p, schedules };
            }),
          }));
          if (quarterWasEmpty) get().celebrate('First initiative of the quarter — off to a good start');
          return created.map((p) => p.id);
        },

        updateProject(id, patch) {
          set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
        },

        updateSchedule(projectId, patch, planId) {
          const pid = planId ?? activePlanId();
          withScheduleCelebrations(
            pid,
            () =>
              mapPlan(pid, (p) => {
                const cur = p.schedules[projectId];
                if (!cur) return p;
                return { ...p, schedules: { ...p.schedules, [projectId]: normalize({ ...cur, ...patch }) } };
              }),
            patch.phase ? [projectId] : [],
          );
        },

        bulkUpdate(ids, projectPatch, schedulePatch) {
          const idSet = new Set(ids);
          if (Object.keys(projectPatch).length)
            set((s) => ({ projects: s.projects.map((p) => (idSet.has(p.id) ? { ...p, ...projectPatch } : p)) }));
          if (Object.keys(schedulePatch).length) {
            const pid = activePlanId();
            withScheduleCelebrations(
              pid,
              () =>
                mapPlan(pid, (p) => {
                  const schedules = { ...p.schedules };
                  for (const id of ids) if (schedules[id]) schedules[id] = normalize({ ...schedules[id], ...schedulePatch });
                  return { ...p, schedules };
                }),
              schedulePatch.phase ? ids : [],
            );
          }
        },

        deleteProjects(ids) {
          const idSet = new Set(ids);
          set((s) => ({
            projects: s.projects.filter((p) => !idSet.has(p.id)),
            plans: s.plans.map((p) => {
              const schedules = { ...p.schedules };
              ids.forEach((id) => delete schedules[id]);
              return { ...p, schedules };
            }),
          }));
        },

        addDisruption(d) {
          const w = ws();
          if (!w) return;
          set((s) => ({ disruptions: [...s.disruptions, { ...d, id: uid(), workspaceId: w.id }] }));
        },

        updateDisruption(id, patch) {
          set((s) => ({ disruptions: s.disruptions.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
        },

        removeDisruption(id) {
          set((s) => ({ disruptions: s.disruptions.filter((d) => d.id !== id) }));
        },

        updateSettings(patch) {
          set((s) => ({ settings: { ...s.settings, ...patch } }));
        },

        clearQuarter() {
          const s = get();
          const w = ws();
          if (!w) return;
          const inQ = (x: { workspaceId: ID; quarter: number }) => x.workspaceId === w.id && x.quarter === s.currentQuarter;
          const { [planKey(w.id, s.currentQuarter)]: _drop, ...activePlan } = s.activePlan;
          set({ projects: s.projects.filter((p) => !inQ(p)), plans: s.plans.filter((p) => !inQ(p)), activePlan });
          get().ensurePlan();
        },

        factoryReset() {
          set({ ...initialState(), celebration: null });
        },

        replaceAll(data) {
          set({ ...initialState(), ...migrate(data, data.version ?? 0) });
          get().ensurePlan();
        },

        celebrate(message) {
          if (!get().settings.celebrations) return;
          set({ celebration: { id: Date.now(), message } });
        },

        dismissCelebration() {
          set({ celebration: null });
        },
      };

      function registerPlan(plan: Plan) {
        const total = get().totalPlansCreated + 1;
        set((s) => ({
          plans: [...s.plans, plan],
          activePlan: { ...s.activePlan, [planKey(plan.workspaceId, plan.quarter)]: plan.id },
          totalPlansCreated: total,
        }));
        if (total === 10) get().celebrate('Ten plans created — you are a scenario machine');
      }
    },
    {
      name: STORAGE_KEY,
      version: STATE_VERSION,
      partialize: ({ celebration: _c, ...rest }) =>
        Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v !== 'function')) as unknown as Store,
      migrate: (persisted, version) => migrate(persisted as Partial<PersistedState>, version) as unknown as Store,
    },
  ),
);

function normalize(s: Schedule): Schedule {
  return {
    ...s,
    duration: Math.max(1, Math.round(s.duration)),
    startWeek: Math.round(s.startWeek),
    allocation: Math.max(0, Math.min(100, Math.round(s.allocation))),
    pairDesignerId: s.pairDesignerId === s.designerId ? null : s.pairDesignerId,
    confirmed: s.designerId ? s.confirmed : false,
  };
}

/**
 * v1 (pre-plans) stored scheduling directly on each project:
 *   { designerId, phase, startWeek, duration, allocation, confirmed }.
 * v2 moves that into a "Plan A" per workspace/quarter.
 */
export function migrate(raw: Partial<PersistedState>, version: number): PersistedState {
  const base = initialState();
  const state: PersistedState = {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings ?? {}) },
    version: STATE_VERSION,
  } as PersistedState;

  state.workspaces = (state.workspaces ?? []).map((w) => {
    const def = defaultConfig(w.config?.teamType ?? 'product');
    return { ...w, designers: w.designers ?? [], config: { ...def, ...w.config, labels: { ...def.labels, ...w.config?.labels } } };
  });

  if (version < 2 && (!raw.plans || !raw.plans.length)) {
    const plans = new Map<string, Plan>();
    const projects: Project[] = [];
    for (const legacy of (raw.projects ?? []) as (Project & Partial<Schedule>)[]) {
      const { designerId, pairDesignerId, phase, startWeek, duration, allocation, curve, confirmed, milestones, ...meta } = legacy;
      const w = state.workspaces.find((x) => x.id === meta.workspaceId);
      const project = { ...blankProject(w ?? state.workspaces[0], meta.quarter, meta.name), ...meta } as Project;
      projects.push(project);
      const key = planKey(project.workspaceId, project.quarter);
      if (!plans.has(key))
        plans.set(key, { id: uid(), workspaceId: project.workspaceId, quarter: project.quarter, name: 'Plan A', createdAt: Date.now(), schedules: {} });
      const def = defaultSchedule(w, project);
      plans.get(key)!.schedules[project.id] = normalize({
        ...def,
        designerId: designerId ?? null,
        pairDesignerId: pairDesignerId ?? null,
        phase: phase ?? def.phase,
        startWeek: startWeek ?? def.startWeek,
        duration: duration ?? def.duration,
        allocation: allocation ?? def.allocation,
        curve: curve ?? def.curve,
        confirmed: !!confirmed,
        milestones: milestones ?? [],
      });
    }
    state.projects = projects;
    state.plans = [...plans.values()];
    state.activePlan = Object.fromEntries([...plans.entries()].map(([k, p]) => [k, p.id]));
    state.totalPlansCreated = Math.max(state.totalPlansCreated ?? 0, state.plans.length);
  }
  state.disruptions = (state.disruptions ?? []).map((d) => ({ ...d, curve: d.curve ?? { shape: 'flat' } }));
  return state;
}
