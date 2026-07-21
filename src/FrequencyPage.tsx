import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { fetchStations } from './radioApi';

export default function FrequencyPage() {
  const [signalType, setSignalType] = useState('FM');
  const [country, setCountry] = useState('United States');
  const [frequency, setFrequency] = useState('95.5');
  const navigate = useNavigate();

  const tuneIn = useMutation({
    mutationFn: async () => {
      const data = await fetchStations(
        `json/stations/search?name=${encodeURIComponent(frequency)}&country=${encodeURIComponent(country)}&limit=10`
      );
      if (!data.length) {
        throw new Error('No station found matching that frequency and location.');
      }
      return (
        data.find(
          (s) =>
            (s.name || '').toUpperCase().includes(signalType) ||
            (s.tags || '').toUpperCase().includes(signalType)
        ) || data[0]
      );
    },
    onSuccess: (best) => {
      navigate(`/station/${encodeURIComponent(best.name)}`, { state: { station: best } });
    },
  });

  const errorMsg = tuneIn.isError
    ? tuneIn.error instanceof Error && tuneIn.error.message.startsWith('No station')
      ? tuneIn.error.message
      : 'Error tuning into frequency.'
    : '';

  const handleTuneIn = (e: FormEvent) => {
    e.preventDefault();
    tuneIn.mutate();
  };

  return (
    <div>
      <title>Manual Tune - Radio</title>
      <p className="toplink">
        <Link to="/">&laquo; Back to Directory</Link>
      </p>

      <hr className="rule" />
      <br />
      <fieldset className="panel">
        <legend>MANUAL TUNE</legend>
        {errorMsg && <p className="system-msg">» {errorMsg}</p>}
        <form onSubmit={handleTuneIn}>
          <div className="form-grid">
            <div className="field">
              <label className="field-label">Signal Type:</label>
              <select className="control" value={signalType} onChange={(e) => setSignalType(e.target.value)}>
                <option value="FM">FM</option>
                <option value="AM">AM</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label">Country:</label>
              <input type="text" className="control" value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Frequency:</label>
              <input type="number" step="0.1" className="control" value={frequency} onChange={(e) => setFrequency(e.target.value)} required />
            </div>
          </div>
          <div className="toolbar">
            <button type="submit" className="btn" disabled={tuneIn.isPending}>
              {tuneIn.isPending ? 'Scanning...' : 'Tune In'}
            </button>
          </div>
        </form>
      </fieldset>
    </div>
  );
}
