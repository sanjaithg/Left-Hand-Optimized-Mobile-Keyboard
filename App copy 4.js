// App.js
import React, { useState, useCallback, useMemo, memo, useRef, useEffect } from 'react';
import {
  View,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  Platform,
  InteractionManager,
  PanResponder,
  Vibration,
  Animated,
} from 'react-native';
import * as Svg from 'react-native-svg';

const { Path, G, Text: SvgText, Polyline, Circle, Line } = Svg;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/* =========================
   CONFIG & TUNABLES
   ========================= */
const COLORS = {
  BACKGROUND: '#f7f7f8',
  KEY_PRIMARY: '#0f1724',
  KEY_SPECIAL: '#1f2937',
  WHITE: '#ffffff',
  TEXT_INPUT_BG: '#ffffff',
  ACCENT: '#f59e0b', // accent for trail and highlights
  RED: '#ef4444',
};

const KEY_ROWS = [
  { chars: ['Q','W','E','R','T','Y','U','I','O','P'], angleOffset: 38 },
  { chars: ['A','S','D','F','G','H','J','K','L'], angleOffset: 38.75 },
  { chars: ['Z','X','C','V','B','N','M'], angleOffset: 40 },
];

const KEYBOARD_CONFIG = {
  RADIUS_BASE: SCREEN_WIDTH * 1.25,
  ARC_CENTER_X_OFFSET: SCREEN_WIDTH * -0.2,
  ARC_CENTER_Y_ADJUSTMENT: 40,
  BOTTOM_INSET_PIXELS: Platform.OS === 'ios' ? 34 : 20,
  KEY_WIDTH_ANGLE: 5.5,
  KEY_PADDING_ANGLE: 0.2,
  RADIUS_STEP: 55,
  START_ANGLE: 160,
  TOUCH_AREA_WIDTH: 52,

  PAUSE_THRESHOLD_MS: 260,          // linger to force letter
  SAMPLE_THROTTLE_MS: 12,          // sampling interval while moving
  RESAMPLE_POINTS: 28,              // points for normalized stroke
  LIVE_PREDICT_INTERVAL_MS: 120,    // how often to update live suggestions while swiping
};

const RADIUS_BASE = Number(KEYBOARD_CONFIG.RADIUS_BASE) || 650;
const KEYBOARD_HEIGHT = Number(SCREEN_HEIGHT) || 800;
const CENTER_X = Number(KEYBOARD_CONFIG.ARC_CENTER_X_OFFSET) || -120;
const CENTER_Y = KEYBOARD_HEIGHT - KEYBOARD_CONFIG.BOTTOM_INSET_PIXELS + KEYBOARD_CONFIG.ARC_CENTER_Y_ADJUSTMENT;

const KEY_WIDTH_ANGLE = Number(KEYBOARD_CONFIG.KEY_WIDTH_ANGLE);
const KEY_PADDING_ANGLE = Number(KEYBOARD_CONFIG.KEY_PADDING_ANGLE);
const START_ANGLE = Number(KEYBOARD_CONFIG.START_ANGLE);

// acceptance thresholds — tuned for conservative, user-friendly behavior
const MIN_ACCEPT_SCORE = 0.62; // combined 0..1
const MIN_MARGIN = 0.12;      // difference to runner-up

/* =========================
   Demo wordlist (replace with production list)
   Slightly frequency-ordered for better UX
   ========================= */
const WORDLIST = [
  "the","be","to","of","and","a","in","that","have","i","it","for","not","on","with","he","as",
  "you","do","at","this","but","his","by","from","they","we","say","her","she","or","an","will",
  "my","one","all","would","there","their","what","so","up","out","if","about","who","get","which",
  "go","me","when","make","can","like","time","no","just","him","know","take","people","into","year",
  "your","good","some","could","them","see","other","than","then","now","look","only","come","its","over","think","also"
];

/* =========================
   Utilities
   ========================= */
const safeNum = (v, fallback = 0) => (typeof v === 'number' && isFinite(v) ? v : fallback);

const polarToCartesian = (cx, cy, radius, angleDeg) => {
  const Cx = safeNum(cx, 0);
  const Cy = safeNum(cy, 0);
  const R = Math.max(0, safeNum(radius, 0));
  const A = safeNum(angleDeg, 0);
  const rad = (A - 90) * Math.PI / 180.0;
  const x = Cx + R * Math.cos(rad);
  const y = Cy + R * Math.sin(rad);
  return { x: isFinite(x) ? x : 0, y: isFinite(y) ? y : 0 };
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* =========================
   Geometry & Key Layout
   ========================= */
const buildKeyGeometry = () => {
  const keys = [];
  const step = safeNum(KEYBOARD_CONFIG.RADIUS_STEP, 55);

  const calc = (char, idx, innerRadius, outerRadius, multiplier = 1, isSpecial = false) => {
    const angleSize = KEY_WIDTH_ANGLE * multiplier;
    const keyStartAngle = START_ANGLE + (idx * (KEY_WIDTH_ANGLE + KEY_PADDING_ANGLE));
    const keyEndAngle = keyStartAngle + angleSize;
    const keyCenterAngle = keyStartAngle + (angleSize / 2);
    return {
      keyChar: String(char).toUpperCase(),
      isSpecial: !!isSpecial,
      innerRadius,
      outerRadius,
      keyStartAngle,
      keyEndAngle,
      keyCenterAngle,
      angleMultiplier: multiplier,
    };
  };

  KEY_ROWS.forEach((row, rowIndex) => {
    const outerRadius = RADIUS_BASE - (rowIndex * step);
    const innerRadius = outerRadius - step;
    let idx = typeof row.angleOffset === 'number' ? row.angleOffset : 0;
    row.chars.forEach(c => {
      keys.push(calc(c, idx, innerRadius, outerRadius, 1, false));
      idx++;
    });
  });

  // some special keys (space/delete/return)
  const peripheralRadius = RADIUS_BASE;
  const spaceInnerRadius = RADIUS_BASE - (KEY_ROWS.length * step);
  keys.push(calc('SPACE', -3, peripheralRadius, peripheralRadius + step, 1.5, true));
  keys.push(calc('DELETE', 10, peripheralRadius, peripheralRadius + step, 1.5, true));
  keys.push(calc('RETURN', 25, peripheralRadius - (KEY_ROWS.length * step), peripheralRadius - (KEY_ROWS.length * step) + step, 2, true));

  return keys;
};

const ALL_KEYS = buildKeyGeometry();

/* precompute centers for hit-testing & visual */
const KEY_CENTERS = (() => {
  const map = {};
  ALL_KEYS.forEach(k => {
    const r = (k.innerRadius + k.outerRadius) / 2;
    const pos = polarToCartesian(CENTER_X, CENTER_Y, r, k.keyCenterAngle);
    map[k.keyChar] = { x: pos.x, y: pos.y, label: k.keyChar };
  });
  return map;
})();

/* =========================
   SVG components (visual polish)
   ========================= */
const ArcVisual = memo(({ kd }) => {
  if (!kd) return null;
  const { keyChar, isSpecial, innerRadius, outerRadius, keyStartAngle, keyEndAngle, keyCenterAngle } = kd;
  const iR = safeNum(innerRadius, 0);
  const oR = safeNum(outerRadius, 0);
  const sA = safeNum(keyStartAngle, 0);
  const eA = safeNum(keyEndAngle, sA);
  const cA = safeNum(keyCenterAngle, (sA + eA) / 2);

  const innerStart = polarToCartesian(CENTER_X, CENTER_Y, iR, sA);
  const innerEnd = polarToCartesian(CENTER_X, CENTER_Y, iR, eA);
  const outerStart = polarToCartesian(CENTER_X, CENTER_Y, oR, sA);
  const outerEnd = polarToCartesian(CENTER_X, CENTER_Y, oR, eA);

  if (![innerStart, innerEnd, outerStart, outerEnd].every(p => isFinite(p.x) && isFinite(p.y))) return null;

  const arrow = `
    M ${innerStart.x} ${innerStart.y}
    L ${outerStart.x} ${outerStart.y}
    A ${oR} ${oR} 0 0 1 ${outerEnd.x} ${outerEnd.y}
    L ${innerEnd.x} ${innerEnd.y}
    A ${iR} ${iR} 0 0 0 ${innerStart.x} ${innerStart.y}
    Z
  `;

  const textRadius = (iR + oR) / 2;
  const textPos = polarToCartesian(CENTER_X, CENTER_Y, textRadius, cA);
  const rotation = cA - 90;

  if (!isFinite(textPos.x) || !isFinite(textPos.y)) return null;

  return (
    <G>
      <Path d={arrow} fill={isSpecial ? COLORS.KEY_SPECIAL : COLORS.KEY_PRIMARY} stroke={COLORS.WHITE} strokeWidth="1" />
      <SvgText
        x={textPos.x}
        y={textPos.y}
        fontSize="14"
        fontWeight="700"
        fill={COLORS.WHITE}
        textAnchor="middle"
        alignmentBaseline="middle"
        transform={`rotate(${rotation} ${textPos.x} ${textPos.y})`}
      >
        {keyChar}
      </SvgText>
    </G>
  );
});

/* invisible touch target over each key */
const ArcKeyTouch = memo(({ kd, onPress }) => {
  if (!kd) return null;
  const iR = safeNum(kd.innerRadius, 0);
  const oR = safeNum(kd.outerRadius, iR + 1);
  const centerR = (iR + oR) / 2;
  const pos = polarToCartesian(CENTER_X, CENTER_Y, centerR, safeNum(kd.keyCenterAngle, 0));
  const rotation = safeNum(kd.keyCenterAngle, 0) - 90;
  const touchWidth = safeNum(KEYBOARD_CONFIG.TOUCH_AREA_WIDTH, 52) * safeNum(kd.angleMultiplier, 1);
  const left = isFinite(pos.x) ? pos.x - touchWidth / 2 : 0;
  const top = isFinite(pos.y) ? pos.y - (oR - iR) / 2 : 0;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{
      position: 'absolute', left, top, width: touchWidth, height: Math.max(10, oR - iR), transform: [{ rotate: `${rotation}deg` }], backgroundColor: 'transparent'
    }} />
  );
});

/* =========================
   Path helpers (resample, normalize, flatten)
   ========================= */
function resamplePath(points, n) {
  if (!points || points.length === 0) return Array.from({length:n}, () => ({x:0,y:0}));
  // distances between consecutive points
  const segLen = [];
  for (let i=1;i<points.length;i++) {
    const dx = points[i].x - points[i-1].x;
    const dy = points[i].y - points[i-1].y;
    segLen.push(Math.hypot(dx,dy));
  }
  const total = segLen.reduce((a,b)=>a+b,0);
  if (total === 0) return Array.from({length:n}, () => ({x: points[0].x, y: points[0].y}));

  // cumulative distances
  const cum = [0];
  for (let i=0;i<segLen.length;i++) cum.push(cum[i] + segLen[i]);

  const res = [];
  for (let i=0;i<n;i++) {
    const t = (i / (n-1)) * cum[cum.length-1];
    // find segment j such that cum[j] <= t < cum[j+1]
    let j = 0;
    while (j < cum.length - 1 && cum[j+1] < t) j++;
    const start = points[j];
    const end = points[Math.min(j+1, points.length-1)];
    const segTotal = cum[j+1] - cum[j] || 1;
    const localT = (t - cum[j]) / segTotal;
    const x = start.x + (end.x - start.x) * localT;
    const y = start.y + (end.y - start.y) * localT;
    res.push({x,y});
  }
  return res;
}

function normalizePath(points) {
  if (!points || points.length === 0) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  points.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  });
  const w = Math.max(1e-6, maxX - minX);
  const h = Math.max(1e-6, maxY - minY);
  const scale = 1 / Math.max(w, h);
  const cx = minX + w / 2;
  const cy = minY + h / 2;
  return points.map(p => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale }));
}

function flattenPoints(points) {
  const out = new Float32Array(points.length * 2);
  for (let i=0;i<points.length;i++) {
    out[i*2] = points[i].x;
    out[i*2+1] = points[i].y;
  }
  return out;
}

function mseBetween(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i=0;i<a.length;i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum / a.length;
}

/* =========================
   Candidate polyline cache (precompute for performance)
   ========================= */
const WORD_POLY_CACHE = (() => {
  const cache = {};
  const n = KEYBOARD_CONFIG.RESAMPLE_POINTS || 28;
  for (let w of WORDLIST) {
    const letters = w.toUpperCase().split('');
    const pts = [];
    let ok = true;
    for (let ch of letters) {
      const center = KEY_CENTERS[ch];
      if (!center) { ok = false; break; }
      pts.push({ x: center.x, y: center.y });
    }
    if (!ok) { cache[w] = null; continue; }
    if (pts.length === 1) pts.push({ x: pts[0].x + 0.001, y: pts[0].y + 0.001 });
    const res = resamplePath(pts, n);
    const norm = normalizePath(res);
    cache[w] = flattenPoints(norm);
  }
  return cache;
})();

/* subsequence scoring */
function subsequenceScore(seqLetters, word) {
  if (!seqLetters || seqLetters.length === 0) return 0;
  const seq = seqLetters.join('').toLowerCase();
  const w = word.toLowerCase();
  let i = 0, score = 0;
  for (const c of w) {
    if (i < seq.length && c === seq[i]) { score += 2; i++; }
    else if (seq.includes(c)) score += 0.4;
  }
  if (i === seq.length) score += 5;
  const denom = Math.max(1, 2 * seq.length + 5);
  return clamp(score / denom, 0, 1);
}

/* frequency weight simple map */
const WORD_FREQ_WEIGHT = (() => {
  const out = {};
  const N = WORDLIST.length;
  WORDLIST.forEach((w,i) => {
    out[w] = 0.3 + 0.7 * (1 - (i / Math.max(1, N - 1)));
  });
  return out;
})();

/* combined candidate scoring (fast) — uses cached polylines */
function scoreCandidatesForStrokeFast(seqLetters, strokeFlat, forcedLetters=[]) {
  const nPoints = KEYBOARD_CONFIG.RESAMPLE_POINTS || 28;
  const seqLen = seqLetters.length;
  const seqSet = new Set(seqLetters.map(l=>l.toLowerCase()));

  // quick prefilter by letter overlap & forced letters
  const pre = [];
  for (let w of WORDLIST) {
    if (!WORD_POLY_CACHE[w]) continue;
    if (w.length > 14 || w.length < 1) continue;
    // forced check
    if (forcedLetters && forcedLetters.length > 0) {
      let idx = -1, ok = true;
      for (const f of forcedLetters) {
        const next = w.indexOf(f, idx+1);
        if (next === -1) { ok = false; break; }
        idx = next;
      }
      if (!ok) continue;
    }
    // letter overlap
    let shared = 0;
    for (const ch of w) if (seqSet.has(ch)) shared++;
    if (seqLen > 3 && (shared / Math.max(1, w.length) < 0.25)) continue;
    pre.push(w);
  }

  // sort by length closeness
  pre.sort((a,b) => Math.abs(a.length - seqLen) - Math.abs(b.length - seqLen));
  const MAX = 220;
  const candidates = pre.slice(0, MAX);

  const scored = [];
  for (const w of candidates) {
    const poly = WORD_POLY_CACHE[w];
    if (!poly) continue;
    const geoErr = mseBetween(strokeFlat, poly); // lower better
    const geoSim = 1 / (1 + geoErr * 40); // tuned mapping
    const sub = subsequenceScore(seqLetters, w);
    const freq = WORD_FREQ_WEIGHT[w] || 0.5;
    const combined = 0.55 * geoSim + 0.30 * sub + 0.15 * freq;
    scored.push({ w, combined, geoErr, sub });
  }
  scored.sort((a,b) => b.combined - a.combined);
  return scored.slice(0, 8);
}

/* =========================
   Hit test
   ========================= */
const hitTest = (pageX, pageY) => {
  const threshold = 44;
  let best = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const k in KEY_CENTERS) {
    const c = KEY_CENTERS[k];
    const dx = pageX - c.x;
    const dy = pageY - c.y;
    const d = Math.hypot(dx,dy);
    if (d < threshold && d < bestD) { bestD = d; best = c; }
  }
  return best;
};

/* =========================
   Main App component
   ========================= */
export default function App() {
  const [typedText, setTypedText] = useState('');
  const textRef = useRef('');
  const [displayTrigger, setDisplayTrigger] = useState(0);

  const [suggestions, setSuggestions] = useState([]);
  const [liveSuggestions, setLiveSuggestions] = useState([]);
  const [strokePreview, setStrokePreview] = useState([]); // normalized points for SVG polyline
  const [trailDots, setTrailDots] = useState([]); // centers touched (visual)
  const [highlightKey, setHighlightKey] = useState(null); // center coords for magnifier
  const highlightAnim = useRef(new Animated.Value(0)).current;

  // capture stroke and discrete seq
  const rawStrokeRef = useRef([]); // raw continuous samples {x,y,t}
  const seqRef = useRef([]); // discrete sequence {label, forced, t}
  const lastSampleRef = useRef(0);

  // live predict debounce timer
  const liveTimerRef = useRef(null);

  // PanResponder
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      rawStrokeRef.current = [];
      seqRef.current = [];
      setTrailDots([]);
      setLiveSuggestions([]);
      setStrokePreview([]);
      lastSampleRef.current = 0;
      const { pageX, pageY } = evt.nativeEvent;
      const now = Date.now();
      rawStrokeRef.current.push({ x: pageX, y: pageY, t: now });
      lastSampleRef.current = now;
      const h = hitTest(pageX, pageY);
      if (h) {
        seqRef.current.push({ label: h.label.toLowerCase(), forced: false, t: now });
        setTrailDots(prev => [...prev, h]);
        // highlight
        setHighlightKey(h);
        Animated.timing(highlightAnim, { toValue: 1, duration: 120, useNativeDriver: true }).start();
      }
    },
    onPanResponderMove: (evt) => {
      const { pageX, pageY } = evt.nativeEvent;
      const now = Date.now();
      if (now - lastSampleRef.current >= (KEYBOARD_CONFIG.SAMPLE_THROTTLE_MS || 12)) {
        rawStrokeRef.current.push({ x: pageX, y: pageY, t: now });
        lastSampleRef.current = now;
      }
      const h = hitTest(pageX, pageY);
      if (h) {
        const last = seqRef.current[seqRef.current.length - 1];
        const lastLabel = last ? last.label : null;
        if (lastLabel !== h.label.toLowerCase()) {
          const gap = last ? now - last.t : 0;
          const forced = gap >= (KEYBOARD_CONFIG.PAUSE_THRESHOLD_MS || 260);
          seqRef.current.push({ label: h.label.toLowerCase(), forced, t: now });
          setTrailDots(prev => [...prev, h]);
        } else {
          if (last && !last.forced && (now - last.t) >= (KEYBOARD_CONFIG.PAUSE_THRESHOLD_MS || 260)) {
            last.forced = true;
          }
          if (last) last.t = now;
        }
        // magnifier highlight update
        setHighlightKey(h);
        Animated.timing(highlightAnim, { toValue: 1, duration: 80, useNativeDriver: true }).start();
      }

      // live prediction (debounced)
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
      liveTimerRef.current = setTimeout(() => {
        runLivePredict();
      }, KEYBOARD_CONFIG.LIVE_PREDICT_INTERVAL_MS || 120);

      // also update stroke preview quickly smoothing a bit
      const preview = rawStrokeRef.current.slice(-60).map(p => ({ x: p.x, y: p.y }));
      // simple smoothing: moving average
      const smooth = [];
      for (let i=0;i<preview.length;i++) {
        const window = preview.slice(Math.max(0,i-2), i+1);
        const avgX = window.reduce((a,b)=>a+b.x,0)/window.length;
        const avgY = window.reduce((a,b)=>a+b.y,0)/window.length;
        smooth.push({x:avgX,y:avgY});
      }
      const res = resamplePath(smooth, KEYBOARD_CONFIG.RESAMPLE_POINTS || 28);
      const norm = normalizePath(res);
      setStrokePreview(norm);
    },
    onPanResponderRelease: () => {
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
      // final prediction & acceptance
      finalPredictAndCommit();
      // fade highlight
      Animated.timing(highlightAnim, { toValue: 0, duration: 160, useNativeDriver: true }).start();
      setHighlightKey(null);
    },
    onPanResponderTerminate: () => {
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
      rawStrokeRef.current = [];
      seqRef.current = [];
      setStrokePreview([]);
      setTrailDots([]);
      setLiveSuggestions([]);
      Animated.timing(highlightAnim, { toValue: 0, duration: 160, useNativeDriver: true }).start();
      setHighlightKey(null);
    }
  })).current;

  // live lightweight prediction while swiping (fast)
  const runLivePredict = () => {
    // sample stroke snapshot
    const raw = rawStrokeRef.current;
    if (!raw || raw.length === 0) return;
    const res = resamplePath(raw.map(p => ({ x: p.x, y: p.y })), KEYBOARD_CONFIG.RESAMPLE_POINTS || 28);
    const norm = normalizePath(res);
    const strokeFlat = flattenPoints(norm);
    const seqLetters = seqRef.current.map(s => s.label);
    // quick candidate scoring (fast)
    const cands = scoreCandidatesForStrokeFast(seqLetters, strokeFlat, seqRef.current.filter(s=>s.forced).map(s=>s.label));
    setLiveSuggestions(cands.slice(0,3).map(c => c.w));
    setStrokePreview(norm);
  };

  // final prediction on release (accept or fallback raw)
  const finalPredictAndCommit = () => {
    const raw = rawStrokeRef.current;
    const seqObjs = seqRef.current.filter(s => s && s.label && s.label.length > 0 && !['space','delete','return'].includes(s.label));
    const rawLetters = seqObjs.map(o => o.label);
    const forcedLetters = seqObjs.filter(o=>o.forced).map(o=>o.label);

    if (raw.length === 0 && rawLetters.length === 0) {
      rawStrokeRef.current = [];
      seqRef.current = [];
      setStrokePreview([]);
      setLiveSuggestions([]);
      return;
    }

    // resample + normalize
    const res = resamplePath(raw.map(p => ({x:p.x,y:p.y})), KEYBOARD_CONFIG.RESAMPLE_POINTS || 28);
    const norm = normalizePath(res);
    const strokeFlat = flattenPoints(norm);

    // get scored candidates
    const candidates = scoreCandidatesForStrokeFast(rawLetters, strokeFlat, forcedLetters);
    let accepted = false;
    let chosen = null;
    if (candidates.length > 0) {
      const top = candidates[0];
      const second = candidates[1] || { combined: 0 };
      const margin = top.combined - second.combined;
      const respectsForced = forcedLetters.length === 0 || (filterByForced([top], forcedLetters).length > 0);
      if (respectsForced && (top.combined >= MIN_ACCEPT_SCORE || margin >= MIN_MARGIN)) {
        accepted = true;
        chosen = top.w;
      }
    }

    if (accepted && chosen) {
      // vibration feedback
      Vibration.vibrate(8);
      const insert = chosen;
      const newText = (textRef.current && !textRef.current.endsWith(' ') ? textRef.current + ' ' : textRef.current) + insert + ' ';
      applyTextUpdate(newText);
      // update suggestion bar
      setSuggestions(candidates.slice(0,3).map(c=>c.w));
    } else {
      // fallback: insert raw letters if any, else show top suggestion
      if (rawLetters.length > 0) {
        const rawWord = rawLetters.join('');
        const newText = (textRef.current && !textRef.current.endsWith(' ') ? textRef.current + ' ' : textRef.current) + rawWord;
        applyTextUpdate(newText);
      } else if (candidates.length > 0) {
        // if purely free stroke, suggest top but do not auto-accept aggressively
        const insert = candidates[0].w;
        const newText = (textRef.current && !textRef.current.endsWith(' ') ? textRef.current + ' ' : textRef.current) + insert + ' ';
        applyTextUpdate(newText);
        setSuggestions(candidates.slice(0,3).map(c=>c.w));
      }
    }

    rawStrokeRef.current = [];
    seqRef.current = [];
    setStrokePreview([]);
    setLiveSuggestions([]);
    setTrailDots([]);
  };

  function filterByForced(candidatesArr, forcedLetters) {
    if (!forcedLetters || forcedLetters.length === 0) return candidatesArr;
    return candidatesArr.filter(cand => {
      const w = String(cand.w || cand).toLowerCase();
      let idx = -1;
      for (const f of forcedLetters) {
        const next = w.indexOf(f, idx + 1);
        if (next === -1) return false;
        idx = next;
      }
      return true;
    });
  }

  // apply text
  const applyTextUpdate = (newText) => {
    textRef.current = newText;
    InteractionManager.runAfterInteractions(() => {
      setTypedText(textRef.current);
      setDisplayTrigger(t => t + 1);
    });
  };

  // typing via tap
  const handleKeyPress = useCallback((char) => {
    let newText = textRef.current;
    if (char === 'SPACE') newText += ' ';
    else if (char === 'DELETE') newText = newText.slice(0, -1);
    else if (char === 'RETURN') newText += '\n';
    else newText += (typeof char === 'string' ? char.toLowerCase() : char);
    applyTextUpdate(newText);
  }, []);

  // suggestion insertion
  const insertSuggestion = (s) => {
    const tokens = textRef.current.split(/(\s+)/);
    let i = tokens.length - 1;
    while (i >= 0 && tokens[i].match(/^\s*$/)) i--;
    if (i < 0) applyTextUpdate(s + ' ');
    else {
      tokens[i] = s;
      applyTextUpdate(tokens.join('') + ' ');
    }
  };

  // live suggestions while typing from text (prefix match)
  useEffect(() => {
    const tokens = textRef.current.split(/\s+/);
    const last = tokens[tokens.length - 1].toLowerCase();
    if (!last) { setSuggestions([]); return; }
    setSuggestions(WORDLIST.filter(w => w.startsWith(last)).slice(0,3));
  }, [displayTrigger]);

  // render trail: continuous stroke polyline (normalized -> convert back to screen coords for visuals)
  // We'll show normalized preview scaled back to the screen center near keyboard top area
  // For simplicity, convert normalized [-0.5..0.5] center to screen coordinates by mapping onto a small overlay near keyboard center
  const renderStrokePreview = () => {
    if (!strokePreview || strokePreview.length === 0) return null;
    // map normalized points to an overlay centered near keyboard middle (use keyboard center coords)
    const overlayCenterX = SCREEN_WIDTH * 0.5;
    const overlayCenterY = KEYBOARD_HEIGHT * 0.6;
    // scale factor for preview (visual only)
    const scale = Math.min(SCREEN_WIDTH, KEYBOARD_HEIGHT) * 0.24;
    const pointsAttr = strokePreview.map(p => `${overlayCenterX + p.x * scale},${overlayCenterY + p.y * scale}`).join(' ');
    return <Polyline points={pointsAttr} fill="none" stroke={COLORS.ACCENT} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />;
  };

  // render trail dots (centers touched)
  const renderTrailDots = () => trailDots.map((p,i) => <Circle key={'dot'+i} cx={p.x} cy={p.y} r={8} fill={COLORS.ACCENT} opacity={0.95} />);

  // magnifier popup for the highlighted key (simple circle + letter)
  const renderMagnifier = () => {
    if (!highlightKey) return null;
    const scale = highlightAnim.interpolate({ inputRange: [0,1], outputRange: [0.2,1.0] });
    return (
      <Animated.View pointerEvents="none" style={{
        position: 'absolute',
        left: highlightKey.x - 28,
        top: highlightKey.y - 72,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: COLORS.ACCENT,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale }],
        zIndex: 50,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 6,
      }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>{highlightKey.label}</Text>
      </Animated.View>
    );
  };

  // render candidate suggestion chips
  const renderSuggestionBar = () => {
    const list = liveSuggestions.length ? liveSuggestions : suggestions;
    return (
      <View style={styles.suggestionRow}>
        {list.length === 0 ? <Text style={{ color: '#999' }}>Suggestions</Text> : list.map(s => (
          <TouchableOpacity key={s} onPress={() => insertSuggestion(s)} style={styles.suggBtn}>
            <Text style={{ color: '#fff' }}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  // Render keyboard visuals + overlay with panResponder
  return (
    <View style={styles.container}>
      {/* input */}
      <View style={styles.inputBar}>
        <Text style={styles.inputText} key={displayTrigger}>{typedText || 'Start typing...'}</Text>
        <TouchableOpacity style={styles.delBtn} onPress={() => handleKeyPress('DELETE')}>
          <Text style={{ color: COLORS.WHITE, fontWeight: '700' }}>DEL</Text>
        </TouchableOpacity>
      </View>

      {/* suggestions */}
      {renderSuggestionBar()}

      {/* keyboard visuals */}
      <View style={styles.kbContainer}>
        <Svg.Svg height={KEYBOARD_HEIGHT} width={SCREEN_WIDTH} style={styles.svg}>
          <G>
            {ALL_KEYS.map(k => <ArcVisual key={k.keyChar + '_' + k.keyCenterAngle} kd={k} />)}
            {/* live stroke preview, drawn above keys for clarity */}
            {renderStrokePreview()}
            {/* trail dots (centers) */}
            {renderTrailDots()}
          </G>
        </Svg.Svg>

        <View style={styles.touchOverlay} {...panResponder.panHandlers}>
          {ALL_KEYS.map(k => (
            <ArcKeyTouch key={'touch_'+k.keyChar+'_'+k.keyCenterAngle} kd={k} onPress={() => {
              const ch = k.keyChar;
              if (ch === 'SPACE') return handleKeyPress('SPACE');
              if (ch === 'DELETE') return handleKeyPress('DELETE');
              if (ch === 'RETURN') return handleKeyPress('RETURN');
              handleKeyPress(ch);
            }} />
          ))}

          {/* Magnifier popup */}
          {renderMagnifier()}
        </View>
      </View>
    </View>
  );
}

/* =========================
   Styles
   ========================= */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
    paddingTop: Platform.OS === 'android' ? 24 : 44,
  },
  inputBar: {
    backgroundColor: COLORS.TEXT_INPUT_BG,
    padding: 12,
    borderBottomWidth: 1,
    borderColor: '#e6e6e6',
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputText: {
    flex: 1,
    fontSize: 18,
    color: '#111',
    minHeight: 40,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 6,
    padding: 6,
  },
  delBtn: {
    backgroundColor: COLORS.RED,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 8,
  },
  suggestionRow: {
    flexDirection: 'row',
    padding: 8,
    alignItems: 'center',
  },
  suggBtn: {
    backgroundColor: '#0b1220',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
  },
  kbContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  svg: { position: 'absolute', bottom: 0, left: 0 },
  touchOverlay: { position: 'absolute', bottom: 0, left: 0, width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
});
