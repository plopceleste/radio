import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { fetchRadioDirectory } from './radioApi';

export default function FrequencyPage() {
  const [signalType, setSignalType] = useState('FM');
  const [country, setCountry] = useState('United States');
  const [frequency, setFrequency] = useState('95.5');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  const handleTuneIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    
    try {
      const keyword = `${frequency}`;
      const relativeEndpoint = `json/stations/search?name=${encodeURIComponent(keyword)}&country=${encodeURIComponent(country)}&limit=10`;
      
      const data = await fetchRadioDirectory(relativeEndpoint);
      
      if (data && data.length > 0) {
        const bestMatch = data.find((s: any) =>
            (s.name || '').toUpperCase().includes(signalType) ||
            (s.tags || '').toUpperCase().includes(signalType)
        ) || data[0];
        
        navigate(`/station/${encodeURIComponent(bestMatch.name)}`, { state: { station: bestMatch } });
      } else {
        setErrorMsg('No station found matching that frequency and location.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Error tuning into frequency.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p style={{ marginTop: '4px' }}>
        <Link to="/">&laquo; Back to Directory</Link>
      </p>

      <hr style={{ border: 'none', borderTop: '2px solid #000' }} />
      <br />
      <fieldset style={{ padding: '20px' }}>
          <legend>MANUAL TUNE</legend>
          {errorMsg && <p className="system-msg" style={{color: 'red'}}>» {errorMsg}</p>}
          <form onSubmit={handleTuneIn}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
                    <label style={{ display: 'inline-block', width: '120px', flexShrink: 0 }}>Signal Type:</label>
                    <select value={signalType} onChange={(e) => setSignalType(e.target.value)} style={{ flex: '1 1 200px', maxWidth: '300px', padding: '4px' }}>
                        <option value="FM">FM</option>
                        <option value="AM">AM</option>
                    </select>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
                    <label style={{ display: 'inline-block', width: '120px', flexShrink: 0 }}>Country:</label>
                    <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} style={{ flex: '1 1 200px', maxWidth: '300px' }} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
                    <label style={{ display: 'inline-block', width: '120px', flexShrink: 0 }}>Frequency:</label>
                    <input type="number" step="0.1" value={frequency} onChange={(e) => setFrequency(e.target.value)} style={{ flex: '1 1 200px', maxWidth: '300px' }} required />
                </div>
            </div>
            <div style={{ marginTop: '20px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                <button type="submit" disabled={loading} style={{ padding: '8px 16px' }}>
                    {loading ? 'Scanning...' : 'Tune In'}
                </button>
            </div>
          </form>
      </fieldset>
    </div>
  );
}
