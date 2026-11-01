import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Designer, Disruption, ID, PersistedState, Plan, Project, Schedule, Settings, Size, TeamType, Workspace,
} from './types';
import { DEFAULT_SETTINGS, DESIGNER_COLORS, RETIRED_DESIGNER_COLORS, defaultConfig } from './lib/defaults';
import { currentQuarter, parseLooseDate, quarterStartUtc, utcToAbsWeek } from './lib/quarters';
import { defaultAllocation, fitPhasePlan, phaseAt, recommendedDuration, weeksIntoSchedule } from './lib/sizing';
import { celebrationTitle, type CelebrationId } from './lib/celebrations';
import { buildDemo } from './lib/demo';
import { currentDataKey } from './lib/session';

/** The current account's storage key (see lib/session.ts). Read at call time; it changes on sign-in. */
export const storageKey = () => useStore.persist.getOptions().name ?? currentDataKey();
export const STATE_VERSION = 9;

export const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

export const planKey = (workspaceId: ID, quarter: number) => `${workspaceId}:${quarter}`;

export interface Celebration {
  id: number;
  message: string;
  /** Title of a celebration unlocked for the first time by this moment. */
  unlocked?: string;
}

export interface NewInitiative {
  name: string;
  designerId?: ID | null;
  size?: Size;
  workType?: string;
  priority?: Project['priority'];
  startWeek?: number;
  extra?: Partial<Project>;
  /** Schedule fields to apply in the active plan (designerId/startWeek are also accepted above). */
  schedule?: Partial<Schedule>;
}

/** One update to an existing project, produced by the ingest pipeline. */
export interface ProjectUpdate {
  id: ID;
  project: Partial<Project>;
  schedule: Partial<Schedule>;
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
  /** Add a 10-designer demo workspace for the current quarter and switch to it. */
  loadDemo(): void;
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
  /** Create and update projects in one step (imports, integrations). */
  applyImport(create: NewInitiative[], update: ProjectUpdate[]): { created: ID[]; updated: number };
  updateProject(id: ID, patch: Partial<Project>): void;
  updateSchedule(projectId: ID, patch: Partial<Schedule>, planId?: ID): void;
  bulkUpdate(ids: ID[], project: Partial<Project>, schedule: Partial<Schedule>): void;
  deleteProjects(ids: ID[]): void;
  /** Add unscheduled projects to the bottom of the backlog. */
  addToBacklog(names: string[]): ID[];
  /**
   * Move projects into a quarter (scheduled in each of its plans, unassigned) or,
   * with null, out of every plan and onto the bottom of the unscheduled backlog.
   */
  moveToQuarter(ids: ID[], quarter: number | null): void;
  /** Edit the plan of an unscheduled project (see Project.draft). */
  updateDraft(projectId: ID, patch: Partial<Schedule>): void;
  /** Swap an unscheduled project with its neighbour in the backlog ranking. */
  moveInBacklog(id: ID, dir: -1 | 1): void;
  addDisruption(d: Omit<Disruption, 'id' | 'workspaceId'>): void;
  updateDisruption(id: ID, patch: Partial<Disruption>): void;
  removeDisruption(id: ID): void;
  updateSettings(patch: Partial<Settings>): void;
  clearQuarter(): void;
  factoryReset(): void;
  replaceAll(data: PersistedState): void;
  celebrate(id: CelebrationId, message: string): void;
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
    unlocked: {},
  };
}

export function defaultSchedule(_ws: Workspace | undefined, project: Pick<Project, 'workType' | 'size'>): Schedule {
  const allocation = defaultAllocation(project.workType);
  return {
    designerId: null,
    pairDesignerId: null,
    phaseOverride: null,
    phasePlan: null,
    startWeek: 0,
    duration: recommendedDuration(project.workType, project.size, allocation),
    allocation,
    curve: { shape: 'flat' },
    confirmed: false,
    milestones: [],
  };
}

function blankProject(ws: Workspace, quarter: number | null, name: string): Project {
  return {
    id: uid(),
    workspaceId: ws.id,
    quarter,
    backlogRank: null,
    draft: null,
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
    gaTargetWeek: null,
    gaTargetText: '',
    productArea: '',
    notes: '',
    createdAt: Date.now(),
  };
}

const isApprove = (phase: string | null | undefined) => !!phase && /approv/i.test(phase);

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
        const prevPhases = phaseTargets.map((id) => before?.schedules[id]?.phaseOverride);
        mutate();
        const after = get().plans.find((p) => p.id === planId);
        if (!wasAll && allConfirmed(after)) get().celebrate('all-confirmed', `Every assignment in ${after!.name} is confirmed`);
        else if (phaseTargets.some((id, i) => !isApprove(prevPhases[i]) && isApprove(after?.schedules[id]?.phaseOverride)))
          get().celebrate('approve', 'Moved to Approve — nice progress');
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

        loadDemo() {
          const s = get();
          const quarter = s.onboarded ? s.currentQuarter : currentQuarter(s.settings.fiscalStartMonth);
          const demo = buildDemo(quarter, s.settings.fiscalStartMonth, uid);
          set({
            onboarded: true,
            workspaces: [...s.workspaces, demo.workspace],
            activeWorkspaceId: demo.workspace.id,
            projects: [...s.projects, ...demo.projects],
            plans: [...s.plans, ...demo.plans],
            disruptions: [...s.disruptions, ...demo.disruptions],
            activePlan: { ...s.activePlan, [planKey(demo.workspace.id, quarter)]: demo.plans[0].id },
            currentQuarter: quarter,
            totalPlansCreated: s.totalPlansCreated + demo.plans.length,
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
                  Object.assign(sched, items[i].schedule ?? {});
                  sched.designerId = items[i].designerId ?? sched.designerId ?? null;
                  sched.startWeek = items[i].startWeek ?? sched.startWeek;
                }
                schedules[proj.id] = normalize(sched);
              });
              return { ...p, schedules };
            }),
          }));
          if (quarterWasEmpty) get().celebrate('first-initiative', 'First project of the quarter — off to a good start');
          return created.map((p) => p.id);
        },

        applyImport(create, update) {
          const created = create.length ? get().addInitiatives(create) : [];
          if (update.length) {
            const byId = new Map(update.map((u) => [u.id, u]));
            const pid = activePlanId();
            set((st) => ({
              projects: st.projects.map((p) => (byId.has(p.id) ? { ...p, ...byId.get(p.id)!.project } : p)),
              plans: st.plans.map((p) => {
                if (p.id !== pid) return p;
                const schedules = { ...p.schedules };
                for (const u of update) if (schedules[u.id] && Object.keys(u.schedule).length) schedules[u.id] = patchSchedule(schedules[u.id], u.schedule);
                return { ...p, schedules };
              }),
            }));
          }
          return { created, updated: update.length };
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
                return { ...p, schedules: { ...p.schedules, [projectId]: patchSchedule(cur, patch) } };
              }),
            patch.phaseOverride ? [projectId] : [],
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
                  for (const id of ids) if (schedules[id]) schedules[id] = patchSchedule(schedules[id], schedulePatch);
                  return { ...p, schedules };
                }),
              schedulePatch.phaseOverride ? ids : [],
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

        addToBacklog(names) {
          const w = ws();
          if (!w) return [];
          let rank = nextRank(w.id);
          const created = names.map((n) => n.trim()).filter(Boolean).map((name) => {
            const p = { ...blankProject(w, null, name), backlogRank: rank++ };
            return { ...p, draft: defaultSchedule(w, p) };
          });
          set((s) => ({ projects: [...s.projects, ...created] }));
          return created.map((p) => p.id);
        },

        moveToQuarter(ids, quarter) {
          const idSet = new Set(ids);
          const s = get();
          const moving = s.projects.filter((p) => idSet.has(p.id) && p.quarter !== quarter);
          if (!moving.length) return;
          const wsId = moving[0].workspaceId;
          const w = s.workspaces.find((x) => x.id === wsId);
          let rank = nextRank(wsId);
          // The plan travels with the project: its draft, or its schedule in the active plan
          // of the quarter it's leaving. It needs confirming again wherever it lands.
          const carried = new Map(moving.map((p) => {
            const from = p.quarter == null ? p.draft : activePlanFor(s, wsId, p.quarter)?.schedules[p.id];
            return [p.id, { ...(from ?? defaultSchedule(w, p)), confirmed: false }];
          }));
          const moved = new Map(moving.map((p) => [p.id, {
            ...p, quarter, backlogRank: quarter == null ? rank++ : null, draft: quarter == null ? carried.get(p.id)! : null,
          }]));
          let plans = s.plans.map((plan) => {
            const schedules = { ...plan.schedules };
            for (const p of moving) delete schedules[p.id];
            if (quarter != null && plan.workspaceId === wsId && plan.quarter === quarter)
              for (const p of moving) schedules[p.id] = normalize(structuredClone(carried.get(p.id)!));
            return { ...plan, schedules };
          });
          let activePlan = s.activePlan;
          // A quarter nobody has planned yet gets its first plan.
          if (quarter != null && !plans.some((p) => p.workspaceId === wsId && p.quarter === quarter)) {
            const plan: Plan = { id: uid(), workspaceId: wsId, quarter, name: 'Plan A', createdAt: Date.now(), schedules: {} };
            for (const p of moving) plan.schedules[p.id] = normalize(structuredClone(carried.get(p.id)!));
            plans = [...plans, plan];
            activePlan = { ...activePlan, [planKey(wsId, quarter)]: plan.id };
          }
          set({ projects: s.projects.map((p) => moved.get(p.id) ?? p), plans, activePlan });
        },

        updateDraft(projectId, patch) {
          set((s) => ({
            projects: s.projects.map((p) => {
              if (p.id !== projectId || p.quarter != null) return p;
              const w = s.workspaces.find((x) => x.id === p.workspaceId);
              return { ...p, draft: patchSchedule(p.draft ?? defaultSchedule(w, p), patch) };
            }),
          }));
        },

        moveInBacklog(id, dir) {
          const s = get();
          const me = s.projects.find((p) => p.id === id);
          if (!me || me.quarter != null) return;
          const list = backlogOf(s.projects, me.workspaceId);
          const i = list.findIndex((p) => p.id === id);
          const other = list[i + dir];
          if (!other) return;
          // Re-number the whole list so ties from older data can't stall a move.
          const order = list.map((p) => p.id);
          [order[i], order[i + dir]] = [order[i + dir], order[i]];
          const rankOf = new Map(order.map((pid, r) => [pid, r]));
          set({ projects: s.projects.map((p) => (rankOf.has(p.id) ? { ...p, backlogRank: rankOf.get(p.id)! } : p)) });
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
          const inQ = (x: { workspaceId: ID; quarter: number | null }) => x.workspaceId === w.id && x.quarter === s.currentQuarter;
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

        celebrate(id, message) {
          // Unlocks are recorded even when the animation is switched off.
          const isNew = !(id in get().unlocked);
          if (isNew) set((st) => ({ unlocked: { ...st.unlocked, [id]: Date.now() } }));
          if (!get().settings.celebrations) return;
          set({ celebration: { id: Date.now(), message, unlocked: isNew ? celebrationTitle(id) : undefined } });
        },

        dismissCelebration() {
          set({ celebration: null });
        },
      };

      function nextRank(workspaceId: ID) {
        const list = backlogOf(get().projects, workspaceId);
        return list.length ? (list[list.length - 1].backlogRank ?? list.length) + 1 : 0;
      }

      function registerPlan(plan: Plan) {
        const total = get().totalPlansCreated + 1;
        set((s) => ({
          plans: [...s.plans, plan],
          activePlan: { ...s.activePlan, [planKey(plan.workspaceId, plan.quarter)]: plan.id },
          totalPlansCreated: total,
        }));
        if (total === 10) get().celebrate('ten-plans', 'Ten plans created — you are a scenario machine');
      }
    },
    {
      name: currentDataKey(),
      version: STATE_VERSION,
      partialize: ({ celebration: _c, ...rest }) =>
        Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v !== 'function')) as unknown as Store,
      migrate: (persisted, version) => migrate(persisted as Partial<PersistedState>, version) as unknown as Store,
    },
  ),
);

function activePlanFor(s: PersistedState, workspaceId: ID, quarter: number): Plan | undefined {
  const plans = s.plans.filter((p) => p.workspaceId === workspaceId && p.quarter === quarter);
  return plans.find((p) => p.id === s.activePlan[planKey(workspaceId, quarter)]) ?? plans[0];
}

/**
 * Apply a schedule patch, keeping a custom phase plan and the duration in step:
 * a new phase plan sets the duration to its total, and a new duration stretches
 * the existing phase plan to fit.
 */
export function patchSchedule(cur: Schedule, patch: Partial<Schedule>): Schedule {
  const next = { ...cur, ...patch };
  if (patch.phasePlan) next.duration = Math.max(1, patch.phasePlan.reduce((a, p) => a + p.weeks, 0));
  else if (patch.duration != null && next.phasePlan) next.phasePlan = fitPhasePlan(next.phasePlan, Math.max(1, Math.round(patch.duration)));
  return normalize(next);
}

/** A workspace's unscheduled projects in backlog order. */
export function backlogOf(projects: Project[], workspaceId: ID): Project[] {
  return projects
    .filter((p) => p.workspaceId === workspaceId && p.quarter == null)
    .sort((a, b) => (a.backlogRank ?? Infinity) - (b.backlogRank ?? Infinity) || a.createdAt - b.createdAt);
}

function normalize(s: Schedule): Schedule {
  return {
    ...s,
    duration: Math.max(1, Math.round(s.duration)),
    startWeek: Math.round(s.startWeek),
    allocation: Math.max(0, Math.min(100, Math.round(s.allocation))),
    pairDesignerId: s.pairDesignerId === s.designerId ? null : s.pairDesignerId,
    phaseOverride: s.phaseOverride || null,
    phasePlan: s.phasePlan?.length ? s.phasePlan.map((p) => ({ phase: p.phase, weeks: Math.max(0, Math.round(p.weeks)), ticket: p.ticket ?? '' })) : null,
    milestones: (s.milestones ?? []).map((m) => ({ ...m, kind: m.kind ?? 'deliver' })),
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
    for (const legacy of (raw.projects ?? []) as (Project & Partial<Schedule> & { phase?: string; quarter: number })[]) {
      const { designerId, pairDesignerId, phase, startWeek, duration, allocation, curve, confirmed, milestones, ...meta } = legacy;
      const w = state.workspaces.find((x) => x.id === meta.workspaceId);
      const project = { ...blankProject(w ?? state.workspaces[0], meta.quarter, meta.name), ...meta } as Project & { quarter: number };
      projects.push(project);
      const key = planKey(project.workspaceId, project.quarter);
      if (!plans.has(key))
        plans.set(key, { id: uid(), workspaceId: project.workspaceId, quarter: project.quarter, name: 'Plan A', createdAt: Date.now(), schedules: {} });
      const def = defaultSchedule(w, project);
      // The legacy phase rides along so the v5 step below decides whether to keep it.
      plans.get(key)!.schedules[project.id] = Object.assign(normalize({
        ...def,
        designerId: designerId ?? null,
        pairDesignerId: pairDesignerId ?? null,
        startWeek: startWeek ?? def.startWeek,
        duration: duration ?? def.duration,
        allocation: allocation ?? def.allocation,
        curve: curve ?? def.curve,
        confirmed: !!confirmed,
        milestones: milestones ?? [],
      }), { phase });
    }
    state.projects = projects;
    state.plans = [...plans.values()];
    state.activePlan = Object.fromEntries([...plans.entries()].map(([k, p]) => [k, p.id]));
    state.totalPlansCreated = Math.max(state.totalPlansCreated ?? 0, state.plans.length);
  }
  state.disruptions = (state.disruptions ?? []).map((d) => ({ ...d, curve: d.curve ?? { shape: 'flat' } }));
  // v4: "Initiative" became "Project". Only swap labels still on the old default
  // so a team's own terminology is left alone.
  if (version < 4) {
    state.workspaces = state.workspaces.map((w) => {
      const l = { ...w.config.labels };
      if (l.initiative === 'Initiative') l.initiative = 'Project';
      if (l.initiatives === 'Initiatives') l.initiatives = 'Projects';
      return { ...w, config: { ...w.config, labels: l } };
    });
  }
  // v5: phases follow the schedule. A stored phase is kept as a manual override
  // only if someone moved it off the default first phase and it disagrees with
  // where the schedule says the project is today; otherwise it goes stale.
  if (version < 5) {
    const now = Date.now();
    const sm = state.settings.fiscalStartMonth;
    const projectById = new Map(state.projects.map((p) => [p.id, p]));
    state.plans = state.plans.map((plan) => {
      const phases = state.workspaces.find((w) => w.id === plan.workspaceId)?.config.phases ?? [];
      const schedules: Record<ID, Schedule> = {};
      for (const [id, raw] of Object.entries(plan.schedules)) {
        const { phase, ...rest } = raw as Schedule & { phase?: string };
        const project = projectById.get(id) ?? { quarter: plan.quarter };
        const derived = phaseAt(phases, rest.duration, weeksIntoSchedule(project, rest, sm, now));
        const keep = rest.phaseOverride ?? (phase && phase !== phases[0] && phase !== derived ? phase : null);
        schedules[id] = { ...rest, phaseOverride: keep };
      }
      return { ...plan, schedules };
    });
  }
  // v6: GA target became a week. Text that parses as a date becomes that week;
  // anything else ("after the pricing review") is kept as text.
  if (version < 6) {
    const sm = state.settings.fiscalStartMonth;
    state.projects = state.projects.map((p) => {
      const { gaTarget, ...rest } = p as Project & { gaTarget?: string };
      if ((p as Partial<Project>).gaTargetWeek !== undefined) return rest as Project;
      const text = (gaTarget ?? '').trim();
      const parsed = text ? parseLooseDate(text, quarterStartUtc(p.quarter ?? state.currentQuarter, sm)) : null;
      return { ...rest, gaTargetWeek: parsed == null ? null : utcToAbsWeek(parsed), gaTargetText: parsed == null ? text : '' };
    });
  }
  // v7: the backlog can hold unscheduled work (quarter null), ranked by backlogRank.
  // Everything saved before this was planned into a quarter.
  if (version < 7) state.projects = state.projects.map((p) => ({ ...p, quarter: p.quarter ?? state.currentQuarter, backlogRank: p.backlogRank ?? null }));
  // v8: two palette colors were too light for readable bar text; move designers
  // still on them to the darker replacement. Custom colors are left alone.
  if (version < 8) {
    state.workspaces = state.workspaces.map((w) => ({
      ...w,
      designers: w.designers.map((d) => ({ ...d, color: RETIRED_DESIGNER_COLORS[d.color?.toLowerCase()] ?? d.color })),
    }));
  }
  // v9: schedules can carry a phase plan, milestones say whether the designer
  // delivers or advises, and unscheduled projects keep a draft plan.
  if (version < 9) {
    state.plans = state.plans.map((plan) => ({
      ...plan,
      schedules: Object.fromEntries(Object.entries(plan.schedules).map(([id, s]) => [id, normalize({ ...s, phasePlan: s.phasePlan ?? null })])),
    }));
    state.projects = state.projects.map((p) => {
      if (p.quarter != null) return { ...p, draft: null };
      const w = state.workspaces.find((x) => x.id === p.workspaceId);
      return { ...p, draft: p.draft ? normalize({ ...p.draft, phasePlan: p.draft.phasePlan ?? null }) : defaultSchedule(w, p) };
    });
  }
  // Backfill unlocks that are provable from existing data (time unknown -> 0).
  state.unlocked = { ...(state.unlocked ?? {}) };
  if (state.projects.length && !('first-initiative' in state.unlocked)) state.unlocked['first-initiative'] = 0;
  if (state.totalPlansCreated >= 10 && !('ten-plans' in state.unlocked)) state.unlocked['ten-plans'] = 0;
  return state;
}
