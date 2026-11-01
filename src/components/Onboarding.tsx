import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Moon, Pipette, Plus, Sun, X } from 'lucide-react';
import { ease, spring } from '../lib/motion';
import { useStore } from '../store';
import { navigate } from '../hooks';
import type { Size, TeamType, ThemeMode } from '../types';
import { SIZES } from '../types';
import { DESIGNER_COLORS, defaultConfig, TEAM_TYPES } from '../lib/defaults';
import { MONTHS } from '../lib/quarters';
import { recommendedDuration, defaultAllocation } from '../lib/sizing';
import { ListEditor } from './ui';

/** "Favorite color" picks: each sets the accent and a light or dark theme to match its mood. */
const FAVORITES: { name: string; vibe: string; accent: string; theme: Exclude<ThemeMode, 'system'> }[] = [
  { name: 'Indigo', vibe: 'Calm and focused', accent: '#5b5bd6', theme: 'light' },
  { name: 'Teal', vibe: 'Fresh and clear', accent: '#0d9488', theme: 'light' },
  { name: 'Coral', vibe: 'Bold and warm', accent: '#e5484d', theme: 'light' },
  { name: 'Marigold', vibe: 'Sunny and upbeat', accent: '#d97706', theme: 'light' },
  { name: 'Sky', vibe: 'Bright and open', accent: '#0284c7', theme: 'light' },
  { name: 'Bubblegum', vibe: 'Playful and loud', accent: '#db2777', theme: 'light' },
  { name: 'Forest', vibe: 'Deep and grounded', accent: '#22a55b', theme: 'dark' },
  { name: 'Nebula', vibe: 'Moody and creative', accent: '#9d5cf0', theme: 'dark' },
];

interface DesignerDraft { name: string; color: string }
interface InitDraft { name: string; designerIndex: number | null; size: Size }

export default function Onboarding() {
  const complete = useStore((s) => s.completeOnboarding);
  const hasExisting = useStore((s) => s.workspaces.length > 0);
  const [step, setStepRaw] = useState(0);
  const [dir, setDir] = useState(1);
  const setStep = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStepRaw(n);
  };
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
  // Favorite color previews live by writing straight to settings; skipping restores what was there.
  const updateSettings = useStore((s) => s.updateSettings);
  const [original] = useState(() => {
    const { accent, theme } = useStore.getState().settings;
    return { accent, theme };
  });
  const [favorite, setFavorite] = useState<string | null>(null);
  const [customAccent, setCustomAccent] = useState<string | null>(null);
  const pickFavorite = (f: (typeof FAVORITES)[number]) => {
    setFavorite(f.name);
    updateSettings({ accent: f.accent, theme: f.theme });
  };
  const pickCustom = (accent: string) => {
    setFavorite('custom');
    setCustomAccent(accent);
    updateSettings({ accent, theme: original.theme });
  };
  const clearFavorite = () => {
    setFavorite(null);
    updateSettings(original);
  };
  const chosen = FAVORITES.find((f) => f.name === favorite);

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

  const steps = ['Team', 'Color', 'Designers', labels.initiatives, 'Review'];
  const last = steps.length - 1;
  const canNext = [!!name.trim(), true, validDesigners.length > 0, true, true][step];

  return (
    <div className="onboard">
      <motion.div className="card onboard-card" style={{ padding: 32, overflow: 'hidden' }} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring.smooth} layout="size">
        <div className="row" style={{ marginBottom: 18 }}>
          <div className="brand"><span className="brand-mark" aria-hidden><i /><i /><i /><i /></span>The Quad</div>
          <span className="spacer" />
          <span className="tiny faint">Step {step + 1} of {steps.length} · {steps[step]}</span>
        </div>
        <div className="steps">
          {steps.map((s, i) => (
            <div key={s}>
              <motion.span initial={false} animate={{ scaleX: i <= step ? 1 : 0 }} transition={{ duration: 0.4, ease: ease.out }} />
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div
          key={step}
          custom={dir}
          initial={{ opacity: 0, x: dir * 24 }}
          animate={{ opacity: 1, x: 0, transition: { duration: 0.26, ease: ease.out } }}
          exit={{ opacity: 0, x: dir * -16, transition: { duration: 0.14, ease: ease.in } }}
        >
        {step === 0 && (
          <div className="col" style={{ gap: 16 }}>
            <div>
              <h1>{hasExisting ? 'Set up another team' : 'Plan your design team’s quarter'}</h1>
              <p className="muted" style={{ marginTop: 4 }}>
                Everything stays in this browser. No account needed.{' '}
                <button className="link-btn" style={{ color: 'var(--accent)', fontWeight: 500 }} onClick={() => { useStore.getState().loadDemo(); navigate({ view: 'home', project: null, page: false, settings: null, designer: null }, true); }}>
                  Or explore with a demo team →
                </button>
              </p>
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
          <div className="col" style={{ gap: 14 }}>
            <div>
              <span className="chip" style={{ marginBottom: 8 }}>Optional</span>
              <h1>Quick one: what’s your favorite color?</h1>
              <p className="muted" style={{ marginTop: 4 }}>We’ll theme The Quad around it. You can change it anytime in Settings → Appearance.</p>
            </div>
            <div className="fav-grid" role="radiogroup" aria-label="Favorite color">
              {FAVORITES.map((f) => (
                <button
                  key={f.name}
                  role="radio"
                  aria-checked={favorite === f.name}
                  className={`choice fav ${favorite === f.name ? 'on' : ''}`}
                  style={{ '--fav': f.accent } as React.CSSProperties}
                  onClick={() => pickFavorite(f)}
                >
                  <span className="fav-swatch" aria-hidden>{favorite === f.name && <Check size={16} strokeWidth={3} />}</span>
                  <b>{f.name}</b>
                  <span className="tiny muted">{f.vibe}</span>
                  <span className="fav-theme tiny faint">{f.theme === 'dark' ? <Moon size={11} /> : <Sun size={11} />}{f.theme === 'dark' ? 'Dark' : 'Light'}</span>
                </button>
              ))}
            </div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <label className={`btn ${favorite === 'custom' ? 'fav-custom-on' : ''}`} style={{ position: 'relative' }}>
                {favorite === 'custom' ? <span className="dot" style={{ background: customAccent ?? undefined, width: 10, height: 10 }} /> : <Pipette size={14} />}
                Something else…
                <input type="color" className="fav-custom-input" value={customAccent ?? original.accent} onChange={(e) => pickCustom(e.target.value)} aria-label="Pick any color" />
              </label>
              {favorite && <button className="btn ghost" onClick={clearFavorite}>Keep the default</button>}
            </div>
          </div>
        )}

        {step === 2 && (
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
                <button className="btn icon ghost" aria-label="Remove" disabled={designers.length < 2} onClick={() => setDesigners(designers.filter((_, j) => j !== i))}><X size={15} /></button>
              </div>
            ))}
            <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setDesigners([...designers, { name: '', color: DESIGNER_COLORS[designers.length % DESIGNER_COLORS.length] }])}>
              <Plus size={15} /> Designer
            </button>
          </div>
        )}

        {step === 3 && (
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
                    style={{ width: 150, flex: 'none' }}
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
                  <button className="btn icon ghost" aria-label="Remove" onClick={() => setInits(inits.length > 1 ? inits.filter((_, j) => j !== i) : [{ name: '', designerIndex: null, size: 'M' }])}><X size={15} /></button>
                </div>
              );
            })}
            <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setInits([...inits, { name: '', designerIndex: null, size: 'M' }])}>
              <Plus size={15} /> {labels.initiative}
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="col" style={{ gap: 14 }}>
            <h1>Ready to plan</h1>
            <div className="card card-pad col" style={{ gap: 8 }}>
              <div className="row"><span className="muted" style={{ width: 140 }}>Workspace</span><b>{name}</b> <span className="chip">{TEAM_TYPES.find((t) => t.id === teamType)!.name}</span></div>
              <div className="row"><span className="muted" style={{ width: 140 }}>Fiscal year starts</span>{MONTHS[fiscalStartMonth]}</div>
              <div className="row">
                <span className="muted" style={{ width: 140 }}>Theme</span>
                {favorite ? (
                  <span className="chip"><span className="dot" style={{ background: 'var(--accent)', width: 8, height: 8 }} />{chosen ? `${chosen.name} · ${chosen.theme === 'dark' ? 'Dark' : 'Light'}` : 'Custom color'}</span>
                ) : <span className="faint">Default</span>}
              </div>
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

        </motion.div>
        </AnimatePresence>

        <div className="row" style={{ marginTop: 28 }}>
          {step > 0 && <button className="btn ghost" onClick={() => setStep(step - 1)}><ArrowLeft size={15} /> Back</button>}
          <span className="spacer" />
          {step < last ? (
            <button className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>{step === 1 && !favorite ? 'Skip' : 'Continue'} <ArrowRight size={15} /></button>
          ) : (
            <button className="btn primary" onClick={finish}>Open planning view <ArrowRight size={15} /></button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
