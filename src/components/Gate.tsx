import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, CalendarRange, CircleCheck, Gauge, Mail, Sparkles, Users } from 'lucide-react';
import { EMAIL_RE, listAccounts, recordSignup, signIn } from '../account';
import { toast } from '../feedback';
import { ease, staggerChild, staggerParent } from '../lib/motion';

/**
 * Sign-in gate shown before onboarding. Not authentication yet: it scopes
 * data to an email on this device and collects opt-ins for the update list.
 */
export default function Gate() {
  const accounts = useMemo(listAccounts, []);
  const [mode, setMode] = useState<'signin' | 'waitlist' | 'joined'>('signin');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [optIn, setOptIn] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const known = accounts.find((a) => a.email === email.trim().toLowerCase());
  const valid = EMAIL_RE.test(email.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || busy) return;
    setBusy(true);
    if (mode === 'waitlist') {
      await recordSignup(email.trim().toLowerCase(), name.trim() || undefined, 'waitlist');
      setMode('joined');
      setBusy(false);
      return;
    }
    const { broughtOver } = await signIn({ email, name: name || known?.name || '', marketingOptIn: optIn || !!known?.marketingOptIn });
    if (broughtOver) toast('Your existing plans were moved into this account', { tone: 'success' });
  };

  const quick = async (acc: (typeof accounts)[number]) => {
    setBusy(true);
    await signIn({ email: acc.email, name: acc.name, marketingOptIn: acc.marketingOptIn });
  };

  return (
    <div className="gate">
      <motion.aside className="gate-hero" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        <div className="brand" style={{ color: '#fff' }}>
          <span className="brand-mark" aria-hidden style={{ background: 'rgb(255 255 255 / 0.18)' }}><i /><i /><i /><i /></span>
          The Quad
        </div>
        <div className="col" style={{ gap: 14 }}>
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5, ease: ease.out }}>
            Quarterly planning your design team will actually believe.
          </motion.h1>
          <p className="gate-lede">Balance workloads, compare scenarios and see who’s over capacity before it happens.</p>
          <motion.ul className="gate-points" variants={staggerParent} initial="initial" animate="animate">
            {[
              [Gauge, 'Week-by-week capacity for every designer'],
              [CalendarRange, 'Drag-and-drop Gantt with plan scenarios'],
              [Sparkles, 'Paste a spreadsheet or Jira export, done'],
            ].map(([Icon, text]) => {
              const I = Icon as typeof Gauge;
              return (
                <motion.li key={text as string} variants={staggerChild}><span><I size={15} /></span>{text as string}</motion.li>
              );
            })}
          </motion.ul>
        </div>
        <HeatmapArt />
      </motion.aside>

      <main className="gate-main">
        <motion.div className="gate-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: ease.out }}>
          <AnimatePresence mode="wait" initial={false}>
            {mode === 'joined' ? (
              <motion.div key="joined" className="col" style={{ gap: 12, alignItems: 'center', textAlign: 'center' }} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
                <span className="ready-icon"><CircleCheck size={22} /></span>
                <h2>You’re on the list</h2>
                <p className="muted">We’ll email <b>{email.trim()}</b> when there’s news. You can still sign in and start planning now.</p>
                <button className="btn primary" onClick={() => setMode('signin')}>Sign in <ArrowRight size={14} /></button>
              </motion.div>
            ) : (
              <motion.form key={mode} onSubmit={submit} className="col" style={{ gap: 14 }} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} noValidate>
                <div className="col" style={{ gap: 4 }}>
                  <h2>{mode === 'waitlist' ? 'Get product updates' : 'Sign in to The Quad'}</h2>
                  <p className="small muted">
                    {mode === 'waitlist'
                      ? 'Leave your email and we’ll let you know about new features. No spam.'
                      : 'Your plans are saved to your account on this device.'}
                  </p>
                </div>

                {mode === 'signin' && accounts.length > 0 && (
                  <div className="col" style={{ gap: 6 }}>
                    <span className="label">Continue as</span>
                    {accounts.slice(0, 3).map((a) => (
                      <button key={a.email} type="button" className="account-row" onClick={() => quick(a)} disabled={busy}>
                        <span className="nav-avatar" style={{ background: 'var(--accent)', width: 28, height: 28, borderRadius: 8, fontSize: 12 }}>{a.name[0]?.toUpperCase()}</span>
                        <span className="col" style={{ gap: 0, flex: 1, minWidth: 0, textAlign: 'left' }}>
                          <b className="small ellipsis">{a.name}</b>
                          <span className="tiny faint ellipsis">{a.email}</span>
                        </span>
                        <ArrowRight size={14} className="faint" />
                      </button>
                    ))}
                    <div className="or"><span>or use another email</span></div>
                  </div>
                )}

                <div className="field">
                  <label htmlFor="gate-email">Work email</label>
                  <div className={`input-icon ${touched && !valid ? 'invalid' : ''}`}>
                    <Mail size={15} />
                    <input
                      id="gate-email"
                      className="input"
                      type="email"
                      autoComplete="email"
                      autoFocus={!accounts.length}
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => email && setTouched(true)}
                      aria-invalid={touched && !valid}
                    />
                  </div>
                  {touched && !valid && <span className="tiny" style={{ color: 'var(--over)' }}>Enter a valid email address.</span>}
                </div>

                <AnimatePresence initial={false}>
                  {!known && (
                    <motion.div className="field" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                      <label htmlFor="gate-name">Name {mode === 'waitlist' && <span className="faint">(optional)</span>}</label>
                      <input id="gate-name" className="input" autoComplete="name" placeholder="Alex Morgan" value={name} onChange={(e) => setName(e.target.value)} />
                    </motion.div>
                  )}
                </AnimatePresence>
                {known && mode === 'signin' && <span className="small muted">Welcome back, {known.name.split(' ')[0]}.</span>}

                {mode === 'signin' && !known?.marketingOptIn && (
                  <label className="row small" style={{ gap: 8, alignItems: 'flex-start' }}>
                    <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} style={{ marginTop: 2 }} />
                    <span>Email me occasional product updates. <span className="faint">Unsubscribe anytime.</span></span>
                  </label>
                )}

                <button className="btn primary gate-submit" type="submit" disabled={busy}>
                  {mode === 'waitlist' ? 'Keep me posted' : known ? 'Continue' : 'Create account & continue'} <ArrowRight size={15} />
                </button>

                <div className="row tiny faint" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  {mode === 'signin' ? (
                    <button type="button" className="link-btn" style={{ color: 'var(--accent)' }} onClick={() => setMode('waitlist')}>Not ready? Just get updates</button>
                  ) : (
                    <button type="button" className="link-btn" style={{ color: 'var(--accent)' }} onClick={() => setMode('signin')}>Sign in instead</button>
                  )}
                  <span><Users size={11} style={{ verticalAlign: -1 }} /> No password yet. Data stays in this browser.</span>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </main>
    </div>
  );
}

/** Decorative animated capacity grid for the hero panel. */
function HeatmapArt() {
  const cells = useMemo(() => {
    let seed = 7;
    const r = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: 6 * 13 }, () => r());
  }, []);
  return (
    <div className="gate-art" aria-hidden>
      {cells.map((v, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 0.35 + v * 0.6, scale: 1 }}
          transition={{ delay: 0.3 + (i % 13) * 0.03 + Math.floor(i / 13) * 0.05, duration: 0.4 }}
          style={{ background: v > 0.86 ? '#f2726a' : v > 0.62 ? '#eab54a' : v > 0.12 ? '#4ccb84' : 'rgb(255 255 255 / 0.15)' }}
        />
      ))}
    </div>
  );
}
