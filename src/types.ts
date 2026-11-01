export type ID = string;

export type Size = 'S' | 'M' | 'L' | 'XL';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export type CurveShape = 'flat' | 'front' | 'back' | 'bell' | 'custom';
export type TeamType = 'product' | 'platform' | 'custom';
export type DetailMode = 'panel' | 'modal' | 'page';
export type ThemeMode = 'light' | 'dark' | 'system';

export const SIZES: Size[] = ['S', 'M', 'L', 'XL'];
export const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3'];
export const WEEKS_PER_QUARTER = 13;

export interface Designer {
  id: ID;
  name: string;
  color: string;
}

export interface FieldLabels {
  initiative: string;
  initiatives: string;
  ticket: string;
  reference: string;
  productArea: string;
  goal: string;
  gaTarget: string;
  pm: string;
  em: string;
}

export interface WorkspaceConfig {
  teamType: TeamType;
  disruptionTypes: string[];
  phases: string[];
  workTypes: string[];
  milestoneTypes: string[];
  labels: FieldLabels;
}

export interface Workspace {
  id: ID;
  name: string;
  designers: Designer[];
  config: WorkspaceConfig;
}

/** Metadata shared by every plan. */
export interface Project {
  id: ID;
  workspaceId: ID;
  /** Quarter index, see lib/quarters.ts */
  quarter: number;
  name: string;
  ticket: string;
  reference: string;
  workType: string;
  size: Size;
  priority: Priority;
  epic: boolean;
  pm: string;
  em: string;
  goal: string;
  gaTarget: string;
  productArea: string;
  notes: string;
  createdAt: number;
  /** Set when the project came from (or is linked to) an external tracker. */
  external?: ExternalRef;
}

export type ExternalSource = 'jira' | 'asana' | 'servicenow' | 'linear' | 'sheet' | 'paste';

export interface ExternalRef {
  source: ExternalSource;
  /** The tracker's own key/id (e.g. ABC-123, an Asana gid, a ServiceNow number). */
  id: string;
  url?: string;
  syncedAt: number;
}

export interface Milestone {
  id: ID;
  type: string;
  /** Weeks from the project's start week (fractional allowed). */
  offset: number;
  note: string;
}

export interface Curve {
  shape: CurveShape;
  /** Only for custom: per-week fraction of max allocation (0..1). */
  values?: number[];
}

/** Plan-specific scheduling for one project. */
export interface Schedule {
  designerId: ID | null;
  pairDesignerId: ID | null;
  /**
   * Manually chosen phase. Null means the phase follows the schedule
   * (see currentPhase in lib/sizing.ts).
   */
  phaseOverride: string | null;
  /** Week offset relative to the project's quarter start (may be negative or >12). */
  startWeek: number;
  duration: number;
  /** Max allocation, percent of the designer's time. */
  allocation: number;
  curve: Curve;
  confirmed: boolean;
  milestones: Milestone[];
}

export interface Plan {
  id: ID;
  workspaceId: ID;
  quarter: number;
  name: string;
  createdAt: number;
  schedules: Record<ID, Schedule>;
}

export interface Disruption {
  id: ID;
  workspaceId: ID;
  designerIds: ID[];
  type: string;
  label: string;
  /** Absolute week index, see lib/quarters.ts */
  startAbsWeek: number;
  duration: number;
  allocation: number;
  curve: Curve;
}

export interface Settings {
  theme: ThemeMode;
  accent: string;
  uiScale: number;
  celebrations: boolean;
  detailMode: DetailMode;
  panelWidth: number;
  /** 0 = January */
  fiscalStartMonth: number;
  ganttWeeksBefore: number;
  ganttWeeksAfter: number;
  ganttMode: 'bars' | 'stacked';
  sidebarCollapsed: boolean;
}

export interface PersistedState {
  version: number;
  onboarded: boolean;
  workspaces: Workspace[];
  activeWorkspaceId: ID | null;
  projects: Project[];
  plans: Plan[];
  disruptions: Disruption[];
  /** key `${workspaceId}:${quarter}` -> plan id */
  activePlan: Record<string, ID>;
  currentQuarter: number;
  settings: Settings;
  totalPlansCreated: number;
  /** Celebration id -> time first unlocked (0 = unlocked before tracking existed). */
  unlocked: Record<string, number>;
}
