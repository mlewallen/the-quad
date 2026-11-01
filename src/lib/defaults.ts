import type { FieldLabels, Settings, TeamType, WorkspaceConfig } from '../types';

/** Every color gives bar text (white or near-black, see readableOn) at least 4.5:1. */
export const DESIGNER_COLORS = [
  '#4f46e5', '#ec4899', '#14b8a6', '#f59e0b', '#7c3aed', '#ef4444',
  '#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#06b6d4', '#84cc16',
];

/** Earlier palette colors that no text color could reach 4.5:1 on, and their one-step-darker replacements. */
export const RETIRED_DESIGNER_COLORS: Record<string, string> = { '#6366f1': '#4f46e5', '#8b5cf6': '#7c3aed' };

export const ACCENT_PRESETS = ['#5b5bd6', '#0d9488', '#e5484d', '#d97706', '#0284c7', '#9333ea', '#16a34a'];

const BASE_LABELS: FieldLabels = {
  initiative: 'Project',
  initiatives: 'Projects',
  ticket: 'Ticket',
  reference: 'Reference',
  productArea: 'Product area',
  goal: 'Quarterly goal',
  gaTarget: 'GA target',
  pm: 'PM',
  em: 'EM',
};

export function defaultConfig(teamType: TeamType): WorkspaceConfig {
  if (teamType === 'platform') {
    return {
      teamType,
      disruptionTypes: ['PTO', 'On-call', 'Interviews', 'Onboarding', 'Design system support', 'Holiday'],
      phases: ['Research', 'Explore', 'Design', 'Approve', 'Spec', 'Build support'],
      workTypes: ['Design', 'Consult', 'Monitor'],
      milestoneTypes: ['Audit', 'Proposal', 'Specs', 'Handoff', 'Release'],
      labels: { ...BASE_LABELS, productArea: 'Platform area' },
    };
  }
  if (teamType === 'custom') {
    return {
      teamType,
      disruptionTypes: ['PTO', 'On-call', 'Other'],
      phases: ['Plan', 'Design', 'Approve', 'Deliver'],
      workTypes: ['Design', 'Consult', 'Monitor'],
      milestoneTypes: ['Checkpoint', 'Handoff'],
      labels: { ...BASE_LABELS },
    };
  }
  return {
    teamType,
    disruptionTypes: ['PTO', 'On-call', 'Interviews', 'Onboarding', 'Offsite', 'Holiday'],
    phases: ['Discovery', 'Concepts', 'Design', 'Approve', 'Handoff', 'Build support'],
    workTypes: ['Design', 'Consult', 'Monitor'],
    milestoneTypes: ['Concepts', 'Crit', 'Specs', 'Handoff', 'Launch'],
    labels: { ...BASE_LABELS },
  };
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: ACCENT_PRESETS[0],
  uiScale: 1,
  celebrations: true,
  detailMode: 'panel',
  panelWidth: 460,
  fiscalStartMonth: 1,
  ganttWeeksBefore: 0,
  ganttWeeksAfter: 2,
  ganttMode: 'bars',
  sidebarCollapsed: false,
};

export const TEAM_TYPES: { id: TeamType; name: string; blurb: string }[] = [
  { id: 'product', name: 'Product group', blurb: 'Designers embedded with product teams shipping features.' },
  { id: 'platform', name: 'Platform group', blurb: 'Design systems, infrastructure, and cross-cutting platform work.' },
  { id: 'custom', name: 'Custom', blurb: 'Start minimal and shape the terminology yourself.' },
];
