import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchStations } from './radioApi';
import type { Station } from './schemas';

const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

const EQ_PRESETS: Record<string, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  classic: [0, 0, 0, 0, 0, 0, -2, -2, -2, -2],
  club: [0, 0, 8, 5, 5, 5, 5, 0, 0, 0],
  dance: [9, 7, 2, 0, 0, -5, -7, -7, 0, 0],
  fullbass: [8, 9, 9, 5, 1, -4, -8, -10, -11, -11],
  rock: [8, 4, -5, -8, -3, 4, 8, 11, 11, 11],
  pop: [-1, 4, 7, 8, 5, 0, -2, -2, -1, -1],
  techno: [8, 5, 0, -5, -4, 0, 8, 9, 9, 8],
};

// --- AM radio effect ---------------------------------------------------------
// Models a small AM receiver: audio is band-limited to ~350 Hz – 4.5 kHz (AM
// broadcast + tiny-speaker rolloff), a honky midrange resonance from the cupped
// speaker, a little amp/speaker grit (soft clip), and a bed of carrier hiss.
const AM_HP = 350;        // low rolloff (Hz)
const AM_LP = 4500;       // AM audio-bandwidth ceiling (Hz)
const AM_PEAK_FREQ = 1800; // cupped-speaker midrange (Hz)
const AM_PEAK_GAIN = 9;    // dB
const AM_PEAK_Q = 1.2;
const AM_NOISE_GAIN = 0.02; // carrier hiss level

// Gentle tanh soft-clip: near-unity for small signals (drive ~1.3 keeps the
// level roughly the same) and rounds off peaks for a touch of amp/speaker grit.
function makeSoftClipCurve(drive = 1.3): Float32Array {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = Math.tanh(drive * x);
  }
  return curve;
}
const AM_SOFTCLIP = makeSoftClipCurve(1.3);

function makeNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export default function StationPage() {
  const { name } = useParams();
  const location = useLocation();
  const initialStation: Station | null = location.state?.station ?? null;

  const stationQuery = useQuery({
    queryKey: ['station', name],
    queryFn: async () => {
      const data = await fetchStations(
        `json/stations/search?name=${encodeURIComponent(name ?? '')}&name_exact=true`
      );
      return data[0] ?? null;
    },
    enabled: !initialStation && !!name,
  });

  const station: Station | null = initialStation ?? stationQuery.data ?? null;
  const loading = stationQuery.isLoading;
  const notFound = !initialStation && stationQuery.isSuccess && !stationQuery.data;

  // Fetch/lookup failures replace the player; a playback error is shown as a
  // banner *inside* the player so the user can retry instead of dead-ending.
  const fetchErrorMsg =
    (stationQuery.isError ? 'Failed to load station details.' : '') ||
    (notFound ? 'Station not found.' : '');
  const [playbackError, setPlaybackError] = useState('');
  const [faviconError, setFaviconError] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [fxMode, setFxMode] = useState<'normal' | 'muffled' | 'bass' | 'radio'>('normal');
  const [eqGains, setEqGains] = useState<number[]>(new Array(10).fill(0));
  const [visStyle, setVisStyle] = useState('winamp');
  const [eqPreset, setEqPreset] = useState('flat');

  const handlePresetChange = (preset: string) => {
    setEqPreset(preset);
    if (EQ_PRESETS[preset]) {
      setEqGains(EQ_PRESETS[preset]);
    }
  };

  const extractFreq = (st: Station) => {
    const str = (st.name + ' ' + (st.tags || '') + ' ' + (st.codec || '')).toUpperCase();

    const explicitFmMatch = str.match(/\b(8[7-9]\.\d{1,2}|9\d\.\d{1,2}|10[0-8]\.\d{1,2})\s*(MHZ|FM)\b/);
    if (explicitFmMatch) return `${explicitFmMatch[1]} FM`;

    const explicitAmMatch = str.match(/\b([5-9]\d{2}|1[0-7]\d{2})\s*(KHZ|AM)\b/);
    if (explicitAmMatch) return `${explicitAmMatch[1]} AM`;

    return 'N/A';
  };

  const audioRef = useRef<HTMLAudioElement>(null);
  const fxCtxRef = useRef<AudioContext | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const extraFxRef = useRef<{
    muffled: BiquadFilterNode | null;
    bass: BiquadFilterNode | null;
    radioHP: BiquadFilterNode | null;
    radioPeak: BiquadFilterNode | null;
    radioShaper: WaveShaperNode | null;
    radioLP: BiquadFilterNode | null;
    noiseGain: GainNode | null;
  }>({ muffled: null, bass: null, radioHP: null, radioPeak: null, radioShaper: null, radioLP: null, noiseGain: null });
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  // Apply the selected effect to the (already-built) graph nodes. Reads only
  // refs + module constants, so it's stable across renders.
  const applyFx = useCallback((mode: 'normal' | 'muffled' | 'bass' | 'radio') => {
    const fx = extraFxRef.current;
    if (fx.muffled) fx.muffled.frequency.value = mode === 'muffled' ? 800 : 22000;
    if (fx.bass) fx.bass.gain.value = mode === 'bass' ? 15 : 0;
    const radio = mode === 'radio';
    if (fx.radioHP) fx.radioHP.frequency.value = radio ? AM_HP : 20;
    if (fx.radioPeak) fx.radioPeak.gain.value = radio ? AM_PEAK_GAIN : 0;
    if (fx.radioShaper) fx.radioShaper.curve = radio ? AM_SOFTCLIP : null;
    if (fx.radioLP) fx.radioLP.frequency.value = radio ? AM_LP : 22000;
    if (fx.noiseGain) fx.noiseGain.gain.value = radio ? AM_NOISE_GAIN : 0;
  }, []);

  const initAudio = () => {
    if (!fxCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      fxCtxRef.current = ctx;

      if (audioRef.current && station && station.url_resolved) {
        // Route audio through the same-origin /proxy Pages Function by default
        // so http-only and non-CORS streams play over https with a CORS-clean
        // source (required for the Web Audio EQ + visualizer). Override with
        // VITE_WORKER_PROXY_URL to use a standalone Worker.
        const workerUrl = (import.meta as any).env?.VITE_WORKER_PROXY_URL || '/proxy';
        const proxyUrl = `${workerUrl}?url=${encodeURIComponent(station.url_resolved)}`;
        // crossOrigin must be set before src.
        audioRef.current.crossOrigin = 'anonymous';
        audioRef.current.src = proxyUrl;

        const source = ctx.createMediaElementSource(audioRef.current);

        // Seed each node from current state so an EQ preset or effect chosen
        // before pressing Play is applied immediately, not only after a change.
        const filters = EQ_FREQUENCIES.map((freq, i) => {
          const filter = ctx.createBiquadFilter();
          filter.type = 'peaking';
          filter.frequency.value = freq;
          filter.Q.value = 1;
          filter.gain.value = eqGains[i];
          return filter;
        });
        filtersRef.current = filters;

        const muffleFilter = ctx.createBiquadFilter();
        muffleFilter.type = 'lowpass';
        extraFxRef.current.muffled = muffleFilter;

        const bassFilter = ctx.createBiquadFilter();
        bassFilter.type = 'lowshelf';
        bassFilter.frequency.value = 150;
        extraFxRef.current.bass = bassFilter;

        // AM radio chain: band-limit (HP) -> midrange honk -> grit -> ceiling (LP).
        const radioHP = ctx.createBiquadFilter();
        radioHP.type = 'highpass';
        extraFxRef.current.radioHP = radioHP;

        const radioPeak = ctx.createBiquadFilter();
        radioPeak.type = 'peaking';
        radioPeak.frequency.value = AM_PEAK_FREQ;
        radioPeak.Q.value = AM_PEAK_Q;
        extraFxRef.current.radioPeak = radioPeak;

        const radioShaper = ctx.createWaveShaper();
        radioShaper.oversample = '4x';
        extraFxRef.current.radioShaper = radioShaper;

        const radioLP = ctx.createBiquadFilter();
        radioLP.type = 'lowpass';
        extraFxRef.current.radioLP = radioLP;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        // Lower smoothing keeps the visualizer tighter in sync with the audio
        // (0.8 adds a lot of visual inertia/lag on transients).
        analyser.smoothingTimeConstant = 0.6;
        analyserRef.current = analyser;

        // Carrier hiss for the AM effect, mixed straight to output (kept out of
        // the analyser path so it doesn't clutter the visualizer).
        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = makeNoiseBuffer(ctx);
        noiseSource.loop = true;
        const noiseBand = ctx.createBiquadFilter();
        noiseBand.type = 'bandpass';
        noiseBand.frequency.value = 2500;
        noiseBand.Q.value = 0.7;
        const noiseGain = ctx.createGain();
        noiseGain.gain.value = 0;
        extraFxRef.current.noiseGain = noiseGain;
        noiseSource.connect(noiseBand);
        noiseBand.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noiseSource.start();

        // Main chain: source -> muffle -> bass -> [AM radio] -> EQ -> analyser -> out
        source.connect(muffleFilter);
        muffleFilter.connect(bassFilter);
        bassFilter.connect(radioHP);
        radioHP.connect(radioPeak);
        radioPeak.connect(radioShaper);
        radioShaper.connect(radioLP);
        radioLP.connect(filters[0]);

        for (let i = 0; i < filters.length - 1; i++) {
          filters[i].connect(filters[i + 1]);
        }
        filters[filters.length - 1].connect(analyser);
        analyser.connect(ctx.destination);

        // Seed every effect param from the current fxMode (incl. one chosen
        // before pressing Play).
        applyFx(fxMode);
      }
    }
  };

  useEffect(() => {
    filtersRef.current.forEach((filter, index) => {
      filter.gain.value = eqGains[index];
    });
  }, [eqGains]);

  useEffect(() => {
    applyFx(fxMode);
  }, [fxMode, applyFx]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Close the AudioContext when leaving the page. Browsers cap the number of
  // live AudioContexts per tab (~6 in Chrome); without this, repeated visits
  // eventually make `new AudioContext()` throw and break playback.
  useEffect(() => {
    return () => {
      fxCtxRef.current?.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const draw = () => {
      if (!isPlaying || !canvasRef.current || !analyserRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const analyser = analyserRef.current;
      const bufferLength = analyser.frequencyBinCount;
      let dataArray = dataArrayRef.current;
      if (!dataArray || dataArray.length !== bufferLength) {
        dataArray = new Uint8Array(bufferLength);
        dataArrayRef.current = dataArray;
      }

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (visStyle === 'oscilloscope') {
        analyser.getByteTimeDomainData(dataArray);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#0f0';
        ctx.beginPath();
        const sliceWidth = (canvas.width * 1.0) / bufferLength;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * canvas.height) / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceWidth;
        }
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      } else if (visStyle === 'smooth' || visStyle === 'dots' || visStyle === 'pulse' || visStyle === 'winamp') {
        analyser.getByteFrequencyData(dataArray);

        if (visStyle === 'pulse') {
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
          const avg = sum / bufferLength;
          const radius = (avg / 255) * (canvas.height / 2) * 1.5;
          ctx.beginPath();
          ctx.arc(canvas.width / 2, canvas.height / 2, radius, 0, 2 * Math.PI, false);
          ctx.fillStyle = `rgb(${avg + 50}, 50, ${255 - avg})`;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#fff';
          ctx.stroke();
        } else {
          const barCount = 32;
          const barWidth = canvas.width / barCount - 2;
          let x = 0;

          for (let i = 0; i < barCount; i++) {
            const binSize = Math.floor(bufferLength / barCount);
            let sum = 0;
            for (let j = 0; j < binSize; j++) {
              sum += dataArray[i * binSize + j];
            }
            const average = sum / binSize;
            const barHeight = (average / 255) * canvas.height;

            if (visStyle === 'winamp') {
              const blockSize = 4;
              const blockGap = 1;
              const totalBlocks = Math.floor(barHeight / (blockSize + blockGap));

              for (let b = 0; b < totalBlocks; b++) {
                const y = canvas.height - (b + 1) * (blockSize + blockGap);
                const ratio = b / (canvas.height / (blockSize + blockGap));
                let r = 0, g = 255;
                const bl = 0;
                if (ratio > 0.5) {
                  r = 255; g = Math.max(0, 255 - (ratio - 0.5) * 2 * 255);
                } else {
                  r = Math.min(255, ratio * 2 * 255); g = 255;
                }
                ctx.fillStyle = `rgb(${r},${g},${bl})`;
                ctx.fillRect(x, y, barWidth, blockSize);
              }
            } else if (visStyle === 'smooth') {
              const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
              gradient.addColorStop(0, '#0f0');
              gradient.addColorStop(0.5, '#ff0');
              gradient.addColorStop(1, '#f00');
              ctx.fillStyle = gradient;
              ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            } else if (visStyle === 'dots') {
              ctx.fillStyle = '#0f0';
              ctx.fillRect(x, canvas.height - barHeight - 4, barWidth, 4);
              ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
              ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            }

            x += barWidth + 2;
          }
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    if (isPlaying) {
      rafRef.current = requestAnimationFrame(draw);
    } else {
      cancelAnimationFrame(rafRef.current);
    }

    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, visStyle]);

  const togglePlay = async () => {
    if (!station) return;
    initAudio();

    if (fxCtxRef.current && fxCtxRef.current.state === 'suspended') {
      await fxCtxRef.current.resume();
    }

    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        setPlaybackError(''); // clear any prior error on retry
        try {
          await audioRef.current.play();
          setIsPlaying(true);
        } catch {
          setPlaybackError('Playback failed or was blocked by browser proxy.');
          setIsPlaying(false);
        }
      }
    }
  };

  const handleEqChange = (index: number, val: number) => {
    const newGains = [...eqGains];
    newGains[index] = val;
    setEqGains(newGains);
    setEqPreset('custom');
  };

  return (
    <div>
      <title>{station ? `${station.name || 'Station'} - Radio Player` : 'Radio Player'}</title>
      <p className="toplink">
        <Link to="/">&laquo; Back to Directory</Link>
      </p>
      <hr className="rule" />

      {loading ? (
        <p><i>Tuning in...</i></p>
      ) : fetchErrorMsg ? (
        <p className="system-msg">{fetchErrorMsg}</p>
      ) : station ? (
        <fieldset>
          <legend>Now Playing: {station.name || 'Untitled Station'}</legend>

          {playbackError && <p className="system-msg">» {playbackError}</p>}

          <div className="station-media">
            {station.favicon && !faviconError ? (
              <img src={station.favicon} alt="Station Logo" className="station-logo" onError={() => setFaviconError(true)} />
            ) : (
              <div className="station-emoji">📻</div>
            )}
          </div>

          <p>
            <strong>URL:</strong>{' '}
            {station.url_resolved ? (
              <a href={station.url_resolved} target="_blank" rel="noreferrer" className="break-all">{station.url_resolved}</a>
            ) : (
              <span>N/A</span>
            )}
            <br />
            <strong>Tags:</strong> {station.tags || 'N/A'}<br />
            <strong>Country:</strong> {station.country || 'Global'}<br />
            <strong>Format:</strong> {station.codec} {station.bitrate > 0 ? `(${station.bitrate} kbps)` : ''}
            {extractFreq(station) !== 'N/A' && (
              <><br /><strong>Frequency:</strong> {extractFreq(station)}</>
            )}
          </p>

          <div className="player-controls">
            <button type="button" className="player-btn" onClick={togglePlay}>
              {isPlaying ? '⏸ Stop' : '▶ Play'}
            </button>

            <div className="control-group">
              <strong>Volume:</strong>
              <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} />
            </div>

            <div className="control-group">
              <strong>Effects:</strong>
              <select value={fxMode} onChange={(e) => setFxMode(e.target.value as any)}>
                <option value="normal">Normal</option>
                <option value="muffled">Muffled</option>
                <option value="bass">Bass Boost</option>
                <option value="radio">AM Radio</option>
              </select>
            </div>
          </div>

          <div className="viz-wrap">
            <div className="viz-bar">
              <select className="viz-select" value={visStyle} onChange={(e) => setVisStyle(e.target.value)}>
                <option value="winamp">Winamp Bars</option>
                <option value="smooth">Smooth Levels</option>
                <option value="oscilloscope">Oscilloscope</option>
                <option value="dots">Peak Dots</option>
                <option value="pulse">Pulse</option>
              </select>
            </div>
            <canvas ref={canvasRef} width={600} height={120} className="viz-canvas" />
          </div>

          <fieldset className="eq-panel">
            <legend className="eq-legend">
              Equalizer
              <select value={eqPreset} onChange={(e) => handlePresetChange(e.target.value)}>
                <option value="custom">Custom</option>
                <option value="flat">Flat</option>
                <option value="classic">Classic</option>
                <option value="club">Club</option>
                <option value="dance">Dance</option>
                <option value="fullbass">Full Bass</option>
                <option value="rock">Rock</option>
                <option value="pop">Pop</option>
                <option value="techno">Techno</option>
              </select>
            </legend>
            <div className="eq-scroll">
              <div className="eq-lanes">
                {EQ_FREQUENCIES.map((freq, i) => (
                  <div key={freq} className="eq-lane">
                    <input
                      type="range"
                      className="eq-slider"
                      min="-24" max="24"
                      value={eqGains[i]}
                      onChange={(e) => handleEqChange(i, parseInt(e.target.value))}
                    />
                    <span className="eq-freq">{freq >= 1000 ? `${freq / 1000}k` : freq}</span>
                    <span className="eq-gain">{eqGains[i] > 0 ? `+${eqGains[i]}` : eqGains[i]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="eq-reset-row">
              <button type="button" className="eq-reset" onClick={() => setEqGains(new Array(10).fill(0))}>Reset EQ</button>
            </div>
          </fieldset>

          <audio
            ref={audioRef}
            preload="none"
            hidden
            onEnded={() => setIsPlaying(false)}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onError={() => {
              setIsPlaying(false);
              setPlaybackError('Stream disconnected or failed to load through proxy.');
            }}
          />
        </fieldset>
      ) : null}
    </div>
  );
}
