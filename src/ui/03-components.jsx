/* ---------------------------------------------------------------------- */
/* Wiederverwendbare UI-Bausteine                                          */
/* ---------------------------------------------------------------------- */

function StatCard({ icon, label, value, valueClass = '', sub }) {
  return (
    <div className="stat-card">
      <div className="stat-card-head"><Icon name={icon} size={14} /><span>{label}</span></div>
      <div className={`stat-card-value ${valueClass}`} title={typeof value === 'string' ? value : undefined}>{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}

function Metric({ label, value, valueClass = '', sub, help }) {
  return (
    <div className="metric">
      <span>{label}{help && <i className="help-dot" title={help}>?</i>}</span>
      <strong className={valueClass}>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function Pill({ children, tone = 'neutral' }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function ResultPill({ result }) {
  if (!result) return null;
  return <Pill tone={RESULT_TONE[result]}>{RESULT_LABELS[result]}</Pill>;
}

function DirectionPill({ direction }) {
  return <Pill tone={direction === 'long' ? 'profit' : 'loss'}>{direction === 'long' ? '▲ Long' : '▼ Short'}</Pill>;
}

function EmptyState({ icon, title, text, actionLabel, onAction, secondaryLabel, onSecondaryAction }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon name={icon} size={26} strokeWidth={1.6} /></div>
      <h3>{title}</h3>
      <p>{text}</p>
      <div className="empty-state-actions">
        {actionLabel && <button className="btn-primary" onClick={onAction}><Icon name="Plus" size={15} /> {actionLabel}</button>}
        {secondaryLabel && <button className="btn-ghost" onClick={onSecondaryAction}><Icon name="Upload" size={14} /> {secondaryLabel}</button>}
      </div>
    </div>
  );
}

function CircularProgress({ percent, size = 100, stroke = 9, color = 'var(--accent)', label }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  const gid = useMemo(() => `ring-${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--grid)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r} stroke={`url(#${gid})`} strokeWidth={stroke} fill="none"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)', filter: `drop-shadow(0 0 6px ${color})` }}
      />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" fill="var(--text)" fontSize={size * 0.2} fontFamily="'Space Grotesk', sans-serif" fontWeight="600">
        {label ?? `${Math.round(clamped)}%`}
      </text>
    </svg>
  );
}

/* Interaktives Flächendiagramm mit Hover-Tooltip */
function AreaChart({ data, valueKey, color, height = 140, currency = '$', showTip = true }) {
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);
  if (!data || data.length === 0) return null;
  const width = 600;
  const values = data.map(d => d[valueKey]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.12 || Math.abs(max) * 0.05 || 1;
  const lo = valueKey === 'drawdown' ? min - pad : min - pad;
  const hi = valueKey === 'drawdown' ? 0 : max + pad;
  const range = hi - lo || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const pts = data.map((d, i) => [data.length > 1 ? i * stepX : width / 2, height - ((d[valueKey] - lo) / range) * height]);
  const line = pts.map((p, i) => {
    if (i === 0) return `M ${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    const prev = pts[i - 1];
    const cx = (prev[0] + p[0]) / 2;
    return `C ${cx.toFixed(1)} ${prev[1].toFixed(1)} ${cx.toFixed(1)} ${p[1].toFixed(1)} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  }).join(' ');
  const baseY = valueKey === 'drawdown' ? 0 : height;
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${baseY} L ${pts[0][0].toFixed(1)} ${baseY} Z`;
  const gradId = `grad-${valueKey}-${color.replace(/[^a-z0-9]/gi, '')}`;

  const onMove = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const idx = clamp(Math.round(x / (stepX || 1)), 0, data.length - 1);
    setHover(idx);
  };
  const hp = hover != null ? pts[hover] : null;

  return (
    <div className="chart-wrap" ref={wrapRef} onMouseMove={showTip ? onMove : undefined} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block', overflow: 'visible' }} role="img" aria-label={`Verlauf von ${fmtMoney(values[0], currency)} bis ${fmtMoney(values[values.length - 1], currency)}`}>
        <defs>
          <linearGradient id={gradId} x1="0" y1={valueKey === 'drawdown' ? '1' : '0'} x2="0" y2={valueKey === 'drawdown' ? '0' : '1'}>
            <stop offset="0%" stopColor={color} stopOpacity="0.38" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} stroke="none" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 5px ${color}66)` }} />
        {hp && <line x1={hp[0]} x2={hp[0]} y1="0" y2={height} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      </svg>
      {hp && (
        <>
          <div style={{ position: 'absolute', left: `${(hp[0] / width) * 100}%`, top: hp[1], width: 10, height: 10, marginLeft: -5, marginTop: -5, borderRadius: '50%', background: color, boxShadow: `0 0 0 3px rgba(0,0,0,0.4), 0 0 12px ${color}`, pointerEvents: 'none' }} />
          <div className="chart-tip glass-strong" style={{ left: `${clamp((hp[0] / width) * 100, 8, 92)}%`, top: -8 }}>
            <div className="tt-date">{data[hover].label ? `${data[hover].label} · ` : ''}{fmtDateShort(data[hover].date)}</div>
            <div className="tt-val" style={{ color }}>{fmtMoney(data[hover][valueKey], currency)}</div>
          </div>
        </>
      )}
    </div>
  );
}

/* Radar-Diagramm für den Trader-Score */
function RadarChart({ axes, size = 260 }) {
  const cx = size / 2, cy = size / 2, R = size / 2 - 58;
  const n = axes.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v]; };
  const poly = axes.map((a, i) => pt(i, a.value / 100).join(',')).join(' ');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="radar" role="img" aria-label={`Trader-Score: ${axes.map(a => `${a.label} ${Math.round(a.value)}`).join(', ')}`}>
      <defs>
        <radialGradient id="radar-fill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.45" />
        </radialGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map(l => (
        <polygon key={l} points={axes.map((_, i) => pt(i, l).join(',')).join(' ')} fill="none" stroke="var(--grid)" />
      ))}
      {axes.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--grid)" />; })}
      <polygon points={poly} fill="url(#radar-fill)" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 10px hsl(var(--accent-h) 80% 55% / .5))' }} />
      {axes.map((a, i) => { const [x, y] = pt(i, a.value / 100); return <circle key={a.key} cx={x} cy={y} r="3.5" fill="#fff" stroke="var(--accent)" strokeWidth="2" />; })}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 1.24);
        return (
          <text key={a.key} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill="var(--text-muted)" fontSize="10.5" fontFamily="Inter, sans-serif">
            <tspan x={x} dy="-0.4em">{a.short || a.label}</tspan>
            <tspan x={x} dy="1.25em" fill="var(--text)" fontWeight="600" fontFamily="'IBM Plex Mono', monospace">{Math.round(a.value)}</tspan>
          </text>
        );
      })}
    </svg>
  );
}

function RuleList({ rules, onChange, placeholder = 'Neue Regel hinzufügen' }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    if (!draft.trim()) return;
    onChange([...rules, draft.trim()]);
    setDraft('');
  };
  const remove = (idx) => onChange(rules.filter((_, i) => i !== idx));
  return (
    <div className="rule-list">
      {rules.map((r, i) => (
        <div key={i} className="rule-item">
          <span className="rule-dot" />
          <span className="rule-text">{r}</span>
          <button className="rule-remove" onClick={() => remove(i)} aria-label="Regel entfernen"><Icon name="X" size={13} /></button>
        </div>
      ))}
      <div className="rule-add">
        <Icon name="Plus" size={14} />
        <input value={draft} placeholder={placeholder} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
      </div>
    </div>
  );
}

function ChipEditor({ tags, onChange, placeholder = 'Tag hinzufügen' }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v || tags.includes(v)) return;
    onChange([...tags, v]);
    setDraft('');
  };
  const remove = (tag) => onChange(tags.filter(t => t !== tag));
  return (
    <div className="chip-editor">
      {tags.length > 0 && (
        <div className="chip-row">
          {tags.map(t => (
            <span key={t} className="chip removable">
              {t}
              <button onClick={() => remove(t)} aria-label={`${t} entfernen`}><Icon name="X" size={11} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="chip-add">
        <input value={draft} placeholder={placeholder} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" className="icon-btn" onClick={add} aria-label="Hinzufügen"><Icon name="Plus" size={14} /></button>
      </div>
    </div>
  );
}

function MarketToggle({ options, selected, onChange }) {
  const toggle = (opt) => onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]);
  return (
    <div className="chip-row">
      {options.map(opt => (
        <button key={opt} type="button" className={`chip toggle ${selected.includes(opt) ? 'active' : ''}`} onClick={() => toggle(opt)}>{opt}</button>
      ))}
    </div>
  );
}

function SingleChipSelect({ options, selected, onChange }) {
  return (
    <div className="chip-row">
      {options.map(o => (
        <button key={o.key} type="button" className={`chip toggle ${o.key === 'mistake' ? 'warn' : o.key === 'followed' ? 'good' : ''} ${selected === o.key ? 'active' : ''}`} onClick={() => onChange(selected === o.key ? null : o.key)}>
          {o.emoji ? `${o.emoji} ` : ''}{o.label}
        </button>
      ))}
    </div>
  );
}

function StarRating({ value, onChange, size = 20 }) {
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" className={`star-btn ${n <= value ? 'on' : ''}`} onClick={() => onChange && onChange(n === value ? 0 : n)} aria-label={`${n} Sterne`}>
          <Icon name="Star" size={size} strokeWidth={1.6} style={n <= value ? { fill: 'currentColor' } : undefined} />
        </button>
      ))}
    </div>
  );
}

function Switch({ on, onChange, label }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;
}

function PlanSection({ icon, tone = 'neutral', title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel plan-section">
      <button type="button" className="plan-section-head" onClick={() => setOpen(o => !o)}>
        <div className="plan-section-title">
          <span className={`plan-icon tone-${tone}`}><Icon name={icon} size={17} /></span>
          <h3>{title}</h3>
        </div>
        <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={16} />
      </button>
      {open && <div className="plan-section-body">{children}</div>}
    </div>
  );
}

/* Liquid-Glass-Tab-Leiste mit gleitendem Indikator */
function TabNav({ tabs, active, onChange }) {
  const navRef = useRef(null);
  const btnRefs = useRef({});
  const [ind, setInd] = useState({ x: 0, w: 0, ready: false });

  const measure = useCallback(() => {
    const el = btnRefs.current[active];
    if (!el) return;
    setInd({ x: el.offsetLeft, w: el.offsetWidth, ready: true });
    if (navRef.current && navRef.current.scrollWidth > navRef.current.clientWidth) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  }, [active]);

  useLayoutEffect(() => { measure(); }, [measure]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    const t = setTimeout(measure, 300); // nach dem Laden der Webfonts
    return () => { window.removeEventListener('resize', measure); clearTimeout(t); };
  }, [measure]);

  return (
    <nav className="tab-nav glass-strong" ref={navRef} role="tablist" aria-label="Bereiche">
      <div className="tab-indicator" style={{ width: ind.w, transform: `translateX(${ind.x}px)`, opacity: ind.ready ? 1 : 0 }} />
      {tabs.map(t => (
        <button key={t.id} ref={el => { btnRefs.current[t.id] = el; }} role="tab" aria-selected={active === t.id} className={`tab-btn ${active === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          <Icon name={t.icon} size={15} /> <span>{t.label}</span>
          {t.pro && <span className="tab-pro">PRO</span>}
        </button>
      ))}
    </nav>
  );
}

function ScreenshotThumb({ id, onOpen, onRemove }) {
  const src = useImage(id);
  return (
    <div className="shot" {...pressable(() => src && onOpen && onOpen(src), 'Screenshot vergrößern')}>
      {src ? <img src={src} alt="Chart-Screenshot" />
        : src === false ? <div className="shot-missing"><Icon name="CloudOff" size={16} /> nicht verfügbar</div>
        : <div className="loading-shell" style={{ minHeight: '100%' }}><div className="loader" /></div>}
      {onRemove && <button type="button" className="shot-remove" onClick={e => { e.stopPropagation(); onRemove(); }} aria-label="Screenshot entfernen"><Icon name="X" size={13} /></button>}
    </div>
  );
}

function Lightbox({ src, onClose }) {
  const ref = useDialog(onClose);
  return (
    <div className="lightbox" ref={ref} data-dialog tabIndex={-1} role="dialog" aria-modal="true" aria-label="Screenshot" onClick={onClose}>
      {src && <img src={src} alt="Screenshot vergrößert" />}
    </div>
  );
}

/* Dialog-Verhalten: Esc schließt (nur den obersten Dialog), Tab bleibt im Dialog,
   beim Schließen springt der Fokus zurück zum auslösenden Element. */
function useDialog(onClose) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current;
    const isTop = () => { const all = document.querySelectorAll('[data-dialog]'); return all[all.length - 1] === el; };
    const focusables = () => el ? [...el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(x => !x.disabled && x.offsetParent !== null) : [];
    const t = setTimeout(() => { if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true }); }, 20);
    const onKey = (e) => {
      if (!el || !isTop()) return;
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      if (prev && prev.focus && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, []);
  return ref;
}

/* Macht Tabellenzeilen & Karten per Tastatur bedienbar */
function pressable(fn, label) {
  return {
    role: 'button', tabIndex: 0, 'aria-label': label, onClick: fn,
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); } }
  };
}
