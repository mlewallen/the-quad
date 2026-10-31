import { useState } from 'react';
import { useStore } from '../store';
import { navigate } from '../hooks';
import type { Size, TeamType } from '../types';
import { SIZES } from '../types';
import { DESIGNER_COLORS, defaultConfig, TEAM_TYPES } from '../lib/defaults';
import { MONTHS } from '../lib/quarters';
import { recommendedDuration, defaultAllocation } from '../lib/sizing';
import { ListEditor } from './ui';

interface DesignerDraft { name: string; color: string }
interface InitDraft { name: string; designerIndex: number | null; size: Size }

export default function Onboarding() {
  const complete = useStore((s) => s.completeOnboarding);
  const hasExisting = useStore((s) => s.workspaces.length > 0);
  const [step, setStep] = useState(0);
  const [teamType, setTeamType] = useState<TeamType>('product');
  const [name, setName] = useState('');
  const [fiscalStartMonth, setFiscal] = useState(useStore.getState().settings.fiscalStartMonth);
  const [customize, setCustomize] = useState(false);
  const [disruptionTypes, setDisruptionTypes] = useState(defaultConfig('product').disruptionTypes);
  const [milestoneTypes, setMilestoneTypes] = useState(defaultConfig('product').milestoneTypes);
  const [designers, setDesigners] = useState<DesignerDraft[]>([
    { name: '', color: DESIGNER_COLORS[0] },
    { name: '', color: DESIGNER_COLORS[1] },
  ]);
  const [inits, setInits] = useState<InitDraft[]>([{ name: '', designerIndex: null, size: 'M' }]);

  const pickTeam = (t: TeamType) => {
    setTeamType(t);
    const c = defaultConfig(t);
    setDisruptionTypes(c.disruptionTypes);
    setMilestoneTypes(c.milestoneTypes);
  };

  const validDesigners = designers.filter((d) => d.name.trim());
  const validInits = inits.filter((i) => i.name.trim());
  const labels = defaultConfig(teamType).labels;
  const indexMap = designers.map((d) => (d.name.trim() ? validDesigners.indexOf(d) : -1));

  const finish = () => {
    complete({
      workspaceName: name,
      teamType,
      fiscalStartMonth,
      disruptionTypes,
      milestoneTypes,
      designers: validDesigners,
      initiatives: validInits.map((i) => ({
        ...i,
        designerIndex: i.designerIndex != null && indexMap[i.designerIndex] >= 0 ? indexMap[i.designerIndex] : null,
      })),
    });
    navigate({ view: 'gantt', project: null, page: false, settings: null }, true);
  };

  const steps = ['Team', 'Designers', labels.initiatives, 'Review'];
  const canNext = [!!name.trim(), validDesigners.length > 0, true, true][step];

  return (
    <div className="onboard">
      <div className="card onboard-card" style={{ padding: 28 }}>
        <div className="row" style={{ marginBottom: 18 }}>
          <div className="brand"><span className="brand-mark" aria-hidden><i /><i /><i /><i /></span>The Quad</div>
          <span className="spacer" />
          <span className="tiny faint">Step {step + 1} of 4 · {steps[step]}</span>
        </div>
        <div className="steps">{steps.map((s, i) => <div key={s} className={i <= step ? 'on' : ''} />)}</div>

        {step === 0 && (
          <div className="col" style={{ gap: 16 }}>
            <div>
              <h1>{hasExisting ? 'Set up another team' : 'Plan your design team’s quarter'}</h1>
              <p className="muted" style={{ marginTop: 4 }}>Everything stays in this browser. No account needed.</p>
            </div>
            <div className="grid3">
              {TEAM_TYPES.map((t) => (
                <button key={t.id} className={`choice ${teamType === t.id ? 'on' : ''}`} onClick={() => pickTeam(t.id)}>
                  <b>{t.name}</b>
                  <p className="small muted" style={{ marginTop: 4 }}>{t.blurb}</p>
                </button>
              ))}
            </div>
            <div className="grid2">
              <div className="field">
                <label htmlFor="ws-name">Workspace name</label>
                <input id="ws-name" className="input" autoFocus value={name} placeholder="e.g. Growth Design" onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="fy">Fiscal year starts in</label>
                <select id="fy" className="select" value={fiscalStartMonth} onChange={(e) => setFiscal(Number(e.target.value))}>
                  {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
              </div>
            </div>
            <label className="row small">
              <input type="checkbox" checked={customize} onChange={(e) => setCustomize(e.target.checked)} />
              Customize disruption and milestone types
            </label>
            {customize && (
              <div className="grid2">
                <div className="field"><label>Disruption types</label><ListEditor items={disruptionTypes} onChange={setDisruptionTypes} /></div>
                <div className="field"><label>Milestone types</label><ListEditor items={milestoneTypes} onChange={setMilestoneTypes} /></div>
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="col" style={{ gap: 12 }}>
            <h1>Who’s on the team?</h1>
            <p className="muted">Add each designer and pick a color — it’s how their work shows up everywhere.</p>
            {designers.map((d, i) => (
              <div key={i} className="row">
                <input type="color" value={d.color} aria-label="Color" onChange={(e) => setDesigners(designers.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} />
                <input
                  className="input"
                  value={d.name}
                  autoFocus={i === 0}
                  placeholder={`Designer ${i + 1}`}
                  onChange={(e) => setDesigners(designers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  onKeyDown={(e) => e.key === 'Enter' && i === designers.length - 1 && setDesigners([...designers, { name: '', color: DESIGNER_COLORS[designers.length % DESIGNER_COLORS.length] }])}
                />
                <button className="btn icon ghost" aria-label="Remove" disabled={designers.length < 2} onClick={() => setDesigners(designers.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setDesigners([...designers, { name: '', color: DESIGNER_COLORS[designers.length % DESIGNER_COLORS.length] }])}>
              + Designer
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="col" style={{ gap: 12 }}>
            <h1>What’s on deck?</h1>
            <p className="muted">Add a few {labels.initiatives.toLowerCase()} to start. Size sets a sensible duration; you can fine-tune everything later. You can skip this.</p>
            {inits.map((it, i) => {
              const weeks = recommendedDuration('Design', it.size, defaultAllocation('Design'));
              return (
                <div key={i} className="row">
                  <input
                    className="input"
                    value={it.name}
                    autoFocus={i === 0}
                    placeholder={`${labels.initiative} name`}
                    onChange={(e) => setInits(inits.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    onKeyDown={(e) => e.key === 'Enter' && i === inits.length - 1 && setInits([...inits, { name: '', designerIndex: null, size: 'M' }])}
                  />
                  <select
                    className="select"
                    style={{ width: 160 }}
                    value={it.designerIndex ?? ''}
                    onChange={(e) => setInits(inits.map((x, j) => (j === i ? { ...x, designerIndex: e.target.value === '' ? null : Number(e.target.value) } : x)))}
                    aria-label="Designer"
                  >
                    <option value="">Unassigned</option>
                    {designers.map((d, j) => d.name.trim() && <option key={j} value={j}>{d.name}</option>)}
                  </select>
                  <div className="segmented">
                    {SIZES.map((s) => (
                      <button key={s} className={it.size === s ? 'on' : ''} onClick={() => setInits(inits.map((x, j) => (j === i ? { ...x, size: s } : x)))}>{s}</button>
                    ))}
                  </div>
                  <span className="tiny faint nowrap" style={{ width: 40 }}>{weeks}w</span>
                  <button className="btn icon ghost" aria-label="Remove" onClick={() => setInits(inits.length > 1 ? inits.filter((_, j) => j !== i) : [{ name: '', designerIndex: null, size: 'M' }])}>✕</button>
                </div>
              );
            })}
            <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setInits([...inits, { name: '', designerIndex: null, size: 'M' }])}>
              + {labels.initiative}
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="col" style={{ gap: 14 }}>
            <h1>Ready to plan</h1>
            <div className="card card-pad col" style={{ gap: 8 }}>
              <div className="row"><span className="muted" style={{ width: 140 }}>Workspace</span><b>{name}</b> <span className="chip">{TEAM_TYPES.find((t) => t.id === teamType)!.name}</span></div>
              <div className="row"><span className="muted" style={{ width: 140 }}>Fiscal year starts</span>{MONTHS[fiscalStartMonth]}</div>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <span className="muted" style={{ width: 140 }}>Designers</span>
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  {validDesigners.map((d, i) => <span key={i} className="chip"><span className="dot" style={{ background: d.color, width: 8, height: 8 }} />{d.name}</span>)}
                </div>
              </div>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <span className="muted" style={{ width: 140 }}>{labels.initiatives}</span>
                <div className="col" style={{ gap: 2 }}>
                  {validInits.length ? validInits.map((it, i) => (
                    <span key={i} className="small">{it.name} <span className="faint">· {it.size} · {it.designerIndex != null ? designers[it.designerIndex]?.name || 'Unassigned' : 'Unassigned'}</span></span>
                  )) : <span className="faint small">None yet — add them from the planning view.</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="row" style={{ marginTop: 24 }}>
          {step > 0 && <button className="btn ghost" onClick={() => setStep(step - 1)}>Back</button>}
          <span className="spacer" />
          {step < 3 ? (
            <button className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</button>
          ) : (
            <button className="btn primary" onClick={finish}>Open planning view →</button>
          )}
        </div>
      </div>
    </div>
  );
}
