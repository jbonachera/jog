/* Jeu de données d'EXEMPLE partagé par les 3 maquettes.
   Athlète fictif suivant la Norwegian Singles Approach (NSA) sur ~14 mois.
   Tout est généré de façon déterministe (graine fixe) : mêmes chiffres à chaque chargement. */
(function () {
  let seed = 20261020;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const jitter = (a) => (rnd() * 2 - 1) * a;
  const DAY = 864e5;
  const d = (s) => new Date(s + 'T12:00:00');
  const iso = (dt) => dt.toISOString().slice(0, 10);
  const addDays = (dt, n) => { const x = new Date(dt); x.setDate(x.getDate() + n); x.setHours(12); return x; };

  const TODAY = d('2026-10-20');
  const START = d('2025-09-01');
  const HRMAX = 188, HR_EASY_CAP = 140; // ~75 % FCmax : plafond footing
  const ZONES = ['easy', 'mp', 'subt', 'hard'];
  const ZONE_LABEL = { easy: 'Facile', mp: 'Allure marathon', subt: 'Sous-seuil', hard: 'Au-dessus du seuil' };
  const W = { easy: 1, mp: 1.7, subt: 2.3, hard: 3.6 }; // charge / minute (type TRIMP)

  const athlete = {
    name: 'Athlète exemple', hrMax: HRMAX, hrRest: 46, hrEasyCap: HR_EASY_CAP,
    lt2Hr: 172, subtHrBand: [160, 168], lactateBand: [2.0, 3.5],
  };

  const plans = [
    { id: 'p1', name: 'Reprise', kind: 'base', start: '2025-09-01', end: '2025-11-16', template: 'nsa2' },
    { id: 'p2', name: 'Cycle hiver', kind: 'semi', start: '2025-11-17', end: '2026-03-08', template: 'nsa',
      race: { name: 'Semi-marathon (exemple)', date: '2026-03-08', dist: 'Semi', goal: '1:32:00', result: '1:31:42' } },
    { id: 'p3', name: 'Récup & vitesse', kind: '5k', start: '2026-03-09', end: '2026-04-26', template: 'nsa2',
      race: { name: '5 km sur route', date: '2026-04-26', dist: '5 km', goal: '20:00', result: '19:51' } },
    { id: 'p4', name: 'Cycle printemps', kind: '10k', start: '2026-04-27', end: '2026-06-21', template: 'nsa',
      race: { name: '10 km (exemple)', date: '2026-06-21', dist: '10 km', goal: '41:30', result: '41:04' } },
    { id: 'p5', name: 'Coupure', kind: 'off', start: '2026-06-22', end: '2026-07-05', template: 'off' },
    { id: 'p6', name: 'Base été', kind: 'base', start: '2026-07-06', end: '2026-08-16', template: 'nsa2' },
    { id: 'p7', name: 'Cycle automne', kind: 'marathon', start: '2026-08-17', end: '2026-12-06', template: 'marathon',
      race: { name: 'Marathon (exemple)', date: '2026-12-06', dist: 'Marathon', goal: '3:12:00', result: null } },
  ];
  const planOf = (dt) => { const k = iso(dt); return plans.find((p) => k >= p.start && k <= p.end); };

  // Allure sous-seuil de référence (s/km) : progression lente, rechute pendant la coupure.
  const t0 = START.getTime();
  function subtBase(dt) {
    const x = (dt.getTime() - t0) / (TODAY.getTime() - t0); // 0 → 1
    let p = 270 - 21 * Math.pow(Math.max(0, x), 0.8);
    if (dt >= d('2026-06-22') && dt <= d('2026-08-16')) p += 5 * Math.max(0, 1 - (dt - d('2026-07-05')) / (42 * DAY));
    return p;
  }
  const easyBase = (dt) => subtBase(dt) + 78;
  const mpBase = (dt) => subtBase(dt) + 25;

  // Semaine type NSA : L footing, M sous-seuil, M footing, J sous-seuil, V repos/footing, S sous-seuil, D sortie longue
  const FORMATS = {
    '6x6': { reps: 6, dur: 6, rest: 1, off: 0 },
    '10x3': { reps: 10, dur: 3, rest: 1, off: -6 },
    '3x10': { reps: 3, dur: 10, rest: 2, off: 6 },
    '5x8': { reps: 5, dur: 8, rest: 1.5, off: 3 },
    '4x5': { reps: 4, dur: 5, rest: 1, off: 0 },
  };

  function weekIndexInPlan(dt, plan) { return Math.floor(Math.round((dt - d(plan.start)) / DAY) / 7); }
  function planWeeks(plan) { return Math.round((d(plan.end) - d(plan.start)) / (7 * DAY) + 1 / 7); }

  function sessionFor(dt) {
    const plan = planOf(dt);
    const dow = (dt.getDay() + 6) % 7; // 0 = lundi
    const wi = weekIndexInPlan(dt, plan), nW = planWeeks(plan);
    const tpl = plan.template;
    const toRace = plan.race ? Math.round((d(plan.race.date) - dt) / DAY) : 999;
    const recov = false; // pas de semaine allégée en NSA : semaines répétitives
    const taper = plan.race && toRace <= (plan.kind === 'marathon' ? 20 : 9) && toRace > 0;
    const scale = (recov ? 0.75 : 1) * (taper ? 0.7 : 1) * (1 + Math.min(wi, 10) * 0.02);
    if (plan.race && toRace === 0) return { type: 'race', dist: plan.race.dist, plan, recov, taper };
    if (tpl === 'off') return [1, 4].includes(dow) ? { type: 'easy', min: 30 + jitter(5), plan } : { type: 'rest', plan };
    const subtDays = tpl === 'nsa2' ? [1, 3] : tpl === 'marathon' ? [1, 3] : [1, 3, 5];
    if (tpl === 'marathon' && dow === 5) {
      if (!recov && !taper && wi >= 4) return { type: 'subt', fmt: wi % 2 ? '3x10' : '5x8', plan, scale, recov, taper };
      return { type: 'easy', min: 45 * scale, plan, recov, taper };
    }
    if (subtDays.includes(dow)) {
      const fmt = dow === 1 ? '6x6' : dow === 3 ? '10x3' : '3x10';
      if (taper && dow === 5) return { type: 'easy', min: 35, plan, recov, taper };
      return { type: 'subt', fmt: (recov || taper) ? '4x5' : fmt, plan, scale, recov, taper };
    }
    if (dow === 6) {
      const lr = (tpl === 'marathon' ? 105 + Math.min(wi, 11) * 5 : tpl === 'nsa' ? 95 : 80) * (recov ? 0.75 : 1) * (taper ? 0.65 : 1);
      const mp = tpl === 'marathon' && wi >= 4 && !recov && !taper ? 20 + Math.min(wi - 4, 6) * 5 : 0;
      return { type: 'long', min: lr, mp, plan, recov, taper };
    }
    if (dow === 4) return (rnd() < 0.55) ? { type: 'rest', plan } : { type: 'easy', min: 30, plan, recov, taper };
    return { type: 'easy', min: (tpl === 'marathon' ? 55 : 45) * scale + jitter(6), plan, recov, taper, strides: dow === 2 && rnd() < 0.5 };
  }

  const RACE_SEC = { '5 km': [5, 1191], '10 km': [10, 2464], 'Semi': [21.0975, 5502] };
  const days = [], subtSessions = [], longRuns = [];
  for (let dt = START; dt <= addDays(d('2026-12-06'), 0); dt = addDays(dt, 1)) {
    const s = sessionFor(dt);
    const done = dt < TODAY;
    const z = { easy: 0, mp: 0, subt: 0, hard: 0 };
    let km = 0, hr = null, pace = null, label = 'Repos', detail = null;
    // séances manquées (vie réelle)
    const missed = done && s.type === 'easy' && rnd() < 0.06;
    if (s.type === 'easy' && !missed) {
      const min = Math.max(25, s.min);
      const p = easyBase(dt) + jitter(8);
      z.easy = min; if (s.strides) { z.hard = 1.5; }
      km = min * 60 / p; hr = Math.round(HR_EASY_CAP - 9 + jitter(5) + (p < easyBase(dt) - 4 ? 4 : 0) + (rnd() < 0.12 ? 14 + jitter(3) : 0)); // ~12 % de footings trop rapides
      pace = p; label = s.strides ? 'Footing + lignes droites' : 'Footing';
    } else if (s.type === 'subt') {
      const f = FORMATS[s.fmt];
      const target = subtBase(dt) + f.off;
      const reps = [];
      for (let i = 0; i < f.reps; i++) {
        const drift = (i / f.reps) * 2.5;
        const creep = (rnd() < 0.12) ? -7 : 0; // dérive d'allure : rep trop rapide
        reps.push({ pace: Math.round(target + jitter(3.5) + creep - drift * 0.4), hr: Math.round(160 + (i / f.reps) * 6 + jitter(1.8) + (f.dur >= 8 ? 1.5 : 0)) });
      }
      const work = f.reps * f.dur, wu = 15, cd = 10, rest = (f.reps - 1) * f.rest;
      z.subt = work; z.easy = wu + cd + rest;
      km = work * 60 / target + (wu + cd + rest) * 60 / (easyBase(dt) + 5);
      hr = Math.round(reps.reduce((a, r) => a + r.hr, 0) / reps.length);
      pace = target; label = 'Sous-seuil ' + s.fmt.replace('x', '×') + "'";
      const lactate = rnd() < 0.35 ? +(2.3 + jitter(0.5) + (f.dur >= 8 ? 0.3 : 0) + (reps.some(r => r.pace < target - 5) ? 0.6 : 0)).toFixed(1) : null;
      detail = { fmt: s.fmt, target: Math.round(target), reps, lactate, rest: f.rest, dur: f.dur };
      if (done) subtSessions.push({ date: iso(dt), ...detail });
    } else if (s.type === 'long') {
      const min = s.min, mp = s.mp;
      const p = easyBase(dt) - 5 + jitter(6);
      z.easy = min - mp; z.mp = mp;
      km = (min - mp) * 60 / p + mp * 60 / mpBase(dt);
      hr = Math.round(HR_EASY_CAP - 6 + jitter(3) + mp / 12);
      pace = (min * 60) / km; label = mp ? `Sortie longue dont ${mp}' allure marathon` : 'Sortie longue';
      const x = (dt - t0) / (TODAY - t0);
      const decoupling = +(Math.max(1.2, 7.2 - 4.2 * x + (min > 120 ? 1.2 : 0) + jitter(1.1))).toFixed(1);
      detail = { decoupling, mp };
      if (done) longRuns.push({ date: iso(dt), min: Math.round(min), km: +km.toFixed(1), decoupling, mp });
    } else if (s.type === 'race') {
      const [dist, sec] = RACE_SEC[s.dist] || [42.195, 11520];
      km = dist; z.hard = sec / 60; z.easy = 20; km += 20 * 60 / easyBase(dt);
      hr = 176; pace = sec / dist; label = 'Course : ' + s.plan.race.name;
    }
    const min = z.easy + z.mp + z.subt + z.hard;
    const load = Math.round(ZONES.reduce((a, k) => a + z[k] * W[k], 0));
    const isRest = min === 0;
    const easyOver = s.type === 'easy' && hr && hr > HR_EASY_CAP; // footing trop rapide
    days.push({
      date: iso(dt), dow: (dt.getDay() + 6) % 7, done, planned: !done, missed,
      type: missed ? 'missed' : (isRest ? 'rest' : s.type), label: missed ? 'Footing (non fait)' : label,
      plan: s.plan.id, recov: !!s.recov, taper: !!s.taper,
      min: Math.round(min), km: +km.toFixed(1), z: Object.fromEntries(ZONES.map(k => [k, Math.round(z[k])])),
      load, hr, pace: pace ? Math.round(pace) : null, easyOver, detail,
    });
  }

  // Forme : CTL (42 j), ATL (7 j), TSB = CTL − ATL (veille)
  let ctl = 38, atl = 40;
  const fitness = [];
  for (const day of days) {
    const L = day.done ? day.load : 0;
    if (!day.done) break;
    const tsb = ctl - atl;
    ctl += (L - ctl) / 42; atl += (L - atl) / 7;
    fitness.push({ date: day.date, ctl: +ctl.toFixed(1), atl: +atl.toFixed(1), tsb: +tsb.toFixed(1), load: L });
  }

  // Agrégats hebdomadaires (lundi → dimanche)
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    const wk = days.slice(i, i + 7);
    const done = wk.filter(x => x.done);
    const src = wk[0].done ? done : wk;
    const sum = (f, arr = wk) => arr.reduce((a, x) => a + f(x), 0);
    const z = Object.fromEntries(ZONES.map(k => [k, sum(x => x.z[k], src)]));
    const min = ZONES.reduce((a, k) => a + z[k], 0);
    const loads = wk.map(x => x.load);
    const mean = loads.reduce((a, b) => a + b, 0) / 7;
    const sd = Math.sqrt(loads.reduce((a, b) => a + (b - mean) ** 2, 0) / 7) || 1;
    const easyRuns = src.filter(x => x.type === 'easy');
    const plan = plans.find(p => p.id === wk[3].plan);
    weeks.push({
      start: wk[0].date, plan: plan.id, planName: plan.name, wInPlan: weekIndexInPlan(d(wk[0].date), plan) + 1, nWeeks: planWeeks(plan),
      status: wk[6].done ? 'done' : (wk[0].done ? 'current' : 'planned'),
      plannedKm: +sum(x => x.km).toFixed(0), km: +sum(x => (x.done ? x.km : 0)).toFixed(1), min, z,
      load: sum(x => x.done ? x.load : 0), plannedLoad: sum(x => x.load),
      subtPct: min ? z.subt / min : 0,
      subtSessions: src.filter(x => x.type === 'subt').length,
      easyCompliance: easyRuns.length ? easyRuns.filter(x => !x.easyOver).length / easyRuns.length : 1,
      monotony: +(mean / sd).toFixed(2), strain: Math.round(sum(x => x.load) * mean / sd),
      recov: wk[3].recov, taper: wk[3].taper,
    });
  }
  weeks.forEach((w, i) => {
    const prev = weeks.slice(Math.max(0, i - 4), i);
    const chronic = prev.length ? prev.reduce((a, x) => a + x.load, 0) / prev.length : w.load;
    w.acwr = w.status === 'done' ? +(w.load / chronic).toFixed(2) : null;
  });

  // Progression
  const byWeek = (arr, f) => weeks.filter(w => w.status !== 'planned').map(w => {
    const xs = arr.filter(s => s.date >= w.start && s.date < iso(addDays(d(w.start), 7)));
    return xs.length ? { date: w.start, v: f(xs) } : null;
  }).filter(Boolean);
  const paceAtHr = byWeek(subtSessions, xs => {
    // allure normalisée à 164 bpm (≈ 1 s/km par bpm)
    const v = xs.map(s => s.reps.reduce((a, r) => a + r.pace + (r.hr - 164) * 1.1, 0) / s.reps.length);
    return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
  });
  const efEasy = byWeek(days.filter(x => x.done && x.type === 'easy'), xs =>
    +(xs.reduce((a, x) => a + (1000 / x.pace * 60) / x.hr, 0) / xs.length).toFixed(3));

  const timeTrials = [
    { date: '2025-09-13', dist: '5 km', time: '21:08', sec: 1268, kind: 'test' },
    { date: '2025-10-25', dist: '5 km', time: '20:41', sec: 1241, kind: 'test' },
    { date: '2025-12-20', dist: '5 km', time: '20:22', sec: 1222, kind: 'test' },
    { date: '2026-02-07', dist: '5 km', time: '20:05', sec: 1205, kind: 'test' },
    { date: '2026-04-26', dist: '5 km', time: '19:51', sec: 1191, kind: 'course' },
    { date: '2026-08-08', dist: '5 km', time: '19:58', sec: 1198, kind: 'test' },
    { date: '2026-09-26', dist: '5 km', time: '19:32', sec: 1172, kind: 'test' },
  ];
  const races = plans.filter(p => p.race).map(p => ({ ...p.race, plan: p.id }));

  // Prédictions (Riegel, exposant 1.06) depuis le dernier test, et "préparation" spécifique.
  const ref = timeTrials[timeTrials.length - 1];
  const riegel = (km) => ref.sec * Math.pow(km / 5, 1.06);
  const predictions = [
    { dist: '5 km', km: 5, sec: riegel(5), pr: 1172, readiness: 1.0 },
    { dist: '10 km', km: 10, sec: riegel(10), pr: 2464, readiness: 0.97 },
    { dist: 'Semi', km: 21.0975, sec: riegel(21.0975), pr: 5502, readiness: 0.9 },
    { dist: 'Marathon', km: 42.195, sec: riegel(42.195) * 1.035, pr: null, readiness: 0.74 },
  ];

  const u = {
    pace: (s) => s == null ? '–' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`,
    dur: (sec) => { sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
      return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`; },
    hm: (min) => `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`,
    pct: (x, n = 0) => (x * 100).toFixed(n) + ' %',
    date: (s, o = { day: 'numeric', month: 'short' }) => d(s).toLocaleDateString('fr-FR', o),
    dowShort: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
    d, iso, addDays,
  };

  const curWeek = weeks.find(w => w.status === 'current');
  const curPlan = plans.find(p => p.id === curWeek.plan);
  window.JOG = {
    today: iso(TODAY), athlete, plans, races, days, fitness, weeks, subtSessions, longRuns,
    paceAtHr, efEasy, timeTrials, predictions, ZONES, ZONE_LABEL, u,
    current: {
      week: curWeek, plan: curPlan,
      days: days.filter(x => x.date >= curWeek.start && x.date < iso(addDays(d(curWeek.start), 7))),
      fitness: fitness[fitness.length - 1],
      lastSubt: subtSessions[subtSessions.length - 1],
      daysToRace: Math.round((d(curPlan.race.date) - TODAY) / DAY),
    },
  };
})();
