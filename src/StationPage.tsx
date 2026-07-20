import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { fetchRadioDirectory } from './radioApi';

interface Station {
  stationuuid: string;
  name: string;
  url_resolved: string;
  tags: string;
  country: string;
  codec: string;
  bitrate: number;
  clickcount: number;
  votes?: number;
  favicon?: string;
}

export default function StationPage() {
  const { name } = useParams();
  const location = useLocation();
  const [station, setStation] = useState<Station | null>(location.state?.station || null);
  const [loading, setLoading] = useState(!station);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [fxMode, setFxMode] = useState<'normal' | 'muffled' | 'bass'>('normal');

  const eqFrequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const [eqGains, setEqGains] = useState<number[]>(new Array(10).fill(0));
  
  const [visStyle, setVisStyle] = useState('winamp');
  const [eqPreset, setEqPreset] = useState('flat');

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

  const handlePresetChange = (preset: string) => {
      setEqPreset(preset);
      if (EQ_PRESETS[preset]) {
          setEqGains(EQ_PRESETS[preset]);
      }
  };

  const extractFreq = (st: Station) => {
      const str = (st.name + " " + (st.tags || "") + " " + (st.codec || "")).toUpperCase();
      
      const explicitFmMatch = str.match(/\b(8[7-9]\.\d{1,2}|9\d\.\d{1,2}|10[0-8]\.\d{1,2})\s*(MHZ|FM)\b/);
      if (explicitFmMatch) return `${explicitFmMatch[1]} FM`;
      
      const explicitAmMatch = str.match(/\b([5-9]\d{2}|1[0-7]\d{2})\s*(KHZ|AM)\b/);
      if (explicitAmMatch) return `${explicitAmMatch[1]} AM`;

      return "N/A";
  };

  const audioRef = useRef<HTMLAudioElement>(null);

  const fxCtxRef = useRef<AudioContext | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const extraFxRef = useRef<{muffled: BiquadFilterNode | null, bass: BiquadFilterNode | null}>({muffled: null, bass: null});
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (station) {
      document.title = `${station.name} - Radio Player`;
    } else {
      document.title = 'Radio Player';
    }
  }, [station]);

  useEffect(() => {
    if (!station && name) {
      fetchRadioDirectory(`json/stations/search?name=${encodeURIComponent(name)}&name_exact=true`)
        .then(data => {
          if (data && data.length > 0) {
            setStation(data[0]);
          } else {
            setErrorMsg('Station not found.');
          }
        })
        .catch(() => {
          setErrorMsg('Failed to load station details.');
        })
        .finally(() => setLoading(false));
    }
    // Runs when the route's station name changes; reads `station` only to skip
    // the fetch when it was passed via navigation state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const initAudio = () => {
    if (!fxCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        fxCtxRef.current = ctx;

        if (audioRef.current && station) {
            // Route audio through the same-origin /proxy Pages Function by
            // default so http-only and non-CORS streams play over https with a
            // CORS-clean source (required for the Web Audio EQ + visualizer).
            // Override with VITE_WORKER_PROXY_URL to use a standalone Worker.
            const workerUrl = (import.meta as any).env?.VITE_WORKER_PROXY_URL || '/proxy';
            const proxyUrl = `${workerUrl}?url=${encodeURIComponent(station.url_resolved)}`;
            // crossOrigin must be set before src.
            audioRef.current.crossOrigin = "anonymous";
            audioRef.current.src = proxyUrl;

            const source = ctx.createMediaElementSource(audioRef.current);

            // Seed each node from current state so an EQ preset or effect chosen
            // before pressing Play is applied immediately, not only after a change.
            const filters = eqFrequencies.map((freq, i) => {
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
            muffleFilter.frequency.value = fxMode === 'muffled' ? 800 : 22000;
            extraFxRef.current.muffled = muffleFilter;

            const bassFilter = ctx.createBiquadFilter();
            bassFilter.type = 'lowshelf';
            bassFilter.frequency.value = 150;
            bassFilter.gain.value = fxMode === 'bass' ? 15 : 0;
            extraFxRef.current.bass = bassFilter;

            const analyser = ctx.createAnalyser();
            analyser.fftSize = 128;
            analyser.smoothingTimeConstant = 0.8;
            analyserRef.current = analyser;

            source.connect(muffleFilter);
            muffleFilter.connect(bassFilter);
            bassFilter.connect(filters[0]);

            for (let i = 0; i < filters.length - 1; i++) {
                filters[i].connect(filters[i + 1]);
            }
            filters[filters.length - 1].connect(analyser);
            analyser.connect(ctx.destination);
        }
    }
  };

  useEffect(() => {
      filtersRef.current.forEach((filter, index) => {
          filter.gain.value = eqGains[index];
      });
  }, [eqGains]);

  useEffect(() => {
      if (extraFxRef.current.muffled) {
          extraFxRef.current.muffled.frequency.value = fxMode === 'muffled' ? 800 : 22000;
      }
      if (extraFxRef.current.bass) {
          extraFxRef.current.bass.gain.value = fxMode === 'bass' ? 15 : 0;
      }
  }, [fxMode]);

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
          
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          if (visStyle === 'oscilloscope') {
              const dataArray = new Uint8Array(bufferLength);
              analyser.getByteTimeDomainData(dataArray);
              ctx.lineWidth = 2;
              ctx.strokeStyle = '#0f0';
              ctx.beginPath();
              const sliceWidth = canvas.width * 1.0 / bufferLength;
              let x = 0;
              for (let i = 0; i < bufferLength; i++) {
                  const v = dataArray[i] / 128.0;
                  const y = v * canvas.height / 2;
                  if (i === 0) ctx.moveTo(x, y);
                  else ctx.lineTo(x, y);
                  x += sliceWidth;
              }
              ctx.lineTo(canvas.width, canvas.height / 2);
              ctx.stroke();
          } else if (visStyle === 'smooth' || visStyle === 'dots' || visStyle === 'pulse' || visStyle === 'winamp') {
              const dataArray = new Uint8Array(bufferLength);
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
                  let x = 1;

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
                              const y = canvas.height - ((b + 1) * (blockSize + blockGap));
                              const ratio = b / (canvas.height / (blockSize + blockGap));
                              let r = 0, g = 255;
                              const bl = 0;
                              if (ratio > 0.5) {
                                  r = 255; g = Math.max(0, 255 - ((ratio - 0.5) * 2 * 255));
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
              try {
                   await audioRef.current.play();
                   setIsPlaying(true);
               } catch {
                   setErrorMsg("Playback failed or was blocked by browser proxy.");
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
        <p style={{ marginTop: '4px' }}>
            <Link to="/">&laquo; Back to Directory</Link>
        </p>
        <hr style={{ border: 'none', borderTop: '2px solid #000' }} />

        {loading ? (
             <p><i>Tuning in...</i></p>
        ) : errorMsg ? (
             <p className="system-msg">{errorMsg}</p>
         ) : station ? (
              <fieldset>
                  <legend>Now Playing: {station.name}</legend>
                  
                  <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                      {station.favicon ? (
                          <img src={station.favicon} alt="Station Logo" style={{ maxWidth: '120px', maxHeight: '120px' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      ) : (
                          <div style={{ fontSize: '48px' }}>📻</div>
                      )}
                  </div>

                  <p>
                     <strong>URL:</strong> <a href={station.url_resolved} target="_blank" rel="noreferrer" style={{wordBreak: "break-all"}}>{station.url_resolved}</a><br/>
                     <strong>Tags:</strong> {station.tags || 'N/A'}<br/>
                     <strong>Country:</strong> {station.country || 'Global'}<br/>
                     <strong>Format:</strong> {station.codec} {station.bitrate > 0 ? `(${station.bitrate} kbps)` : ''}
                     {extractFreq(station) !== "N/A" && (
                         <><br/><strong>Frequency:</strong> {extractFreq(station)}</>
                     )}
                  </p>

                   <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center', marginTop: '20px' }}>
                      <button type="button" onClick={togglePlay} style={{ fontSize: '16px', padding: '8px 16px', flex: '1 1 auto', minWidth: '100px' }}>
                          {isPlaying ? '⏸ Stop' : '▶ Play'}
                      </button>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 auto', minWidth: '150px' }}>
                          <strong>Volume:</strong>
                          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={e => setVolume(parseFloat(e.target.value))} style={{ width: '100%' }} />
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 auto', minWidth: '150px' }}>
                          <strong>Effects:</strong>
                          <select value={fxMode} onChange={(e) => setFxMode(e.target.value as any)} style={{ padding: '4px', width: '100%' }}>
                              <option value="normal">Normal</option>
                              <option value="muffled">Muffled</option>
                              <option value="bass">Bass Boost</option>
                          </select>
                      </div>
                  </div>

                  <div style={{ marginTop: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '5px' }}>
                          <select value={visStyle} onChange={e => setVisStyle(e.target.value)} style={{ padding: '4px 8px', fontSize: '14px', background: '#333', color: '#fff', border: 'none', borderRadius: '3px', width: '100%', maxWidth: '200px' }}>
                              <option value="winamp">Winamp Bars</option>
                              <option value="smooth">Smooth Levels</option>
                              <option value="oscilloscope">Oscilloscope</option>
                              <option value="dots">Peak Dots</option>
                              <option value="pulse">Pulse</option>
                          </select>
                      </div>
                      <canvas 
                          ref={canvasRef} 
                          width={600} 
                          height={120} 
                          style={{ 
                              width: '100%', 
                              height: 'auto', 
                              backgroundColor: '#0a0a0a', 
                              borderRadius: '4px',
                              border: '1px solid #333'
                          }} 
                      />
                  </div>

                  <fieldset style={{ marginTop: '30px', padding: '15px' }}>
                      <legend style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                          Equalizer 
                          <select value={eqPreset} onChange={(e) => handlePresetChange(e.target.value)} style={{ padding: '4px', fontSize: '14px' }}>
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
                      <div style={{ overflowX: 'auto', paddingBottom: '10px', marginTop: '10px' }}>
                          <div style={{ display: 'flex', gap: '15px', minWidth: '400px' }}>
                              {eqFrequencies.map((freq, i) => (
                                  <div key={freq} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                                  <input 
                                     type="range" 
                                     min="-24" max="24" 
                                     value={eqGains[i]} 
                                     onChange={e => handleEqChange(i, parseInt(e.target.value))} 
                                     style={{ writingMode: 'vertical-lr', direction: 'rtl', height: '120px', cursor: 'ns-resize' }} 
                                  />
                                  <span style={{ fontSize: '11px', marginTop: '10px' }}>{freq >= 1000 ? `${freq/1000}k` : freq}</span>
                                  <span style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{eqGains[i] > 0 ? `+${eqGains[i]}` : eqGains[i]}</span>
                              </div>
                          ))}
                          </div>
                      </div>
                      <div style={{ marginTop: '15px', display: 'flex', justifyContent: 'center' }}>
                          <button type="button" onClick={() => setEqGains(new Array(10).fill(0))} style={{ padding: '8px 16px', width: '100%', maxWidth: '200px' }}>Reset EQ</button>
                      </div>
                  </fieldset>
                  
                  <audio ref={audioRef} preload="none" onEnded={() => setIsPlaying(false)} onPause={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} onError={() => {
                      setIsPlaying(false);
                      if (!errorMsg) setErrorMsg("Stream disconnected or failed to load through proxy.");
                  }} style={{ display: 'none' }} />
              </fieldset>
         ) : null}
    </div>
  );
}
