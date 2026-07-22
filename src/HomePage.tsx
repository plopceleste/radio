import { useState, useEffect, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchStations, fetchStats } from './radioApi';
import { COUNTRIES } from './countries';
import type { Station } from './schemas';

const LIMIT = 50;

type SearchParams = {
  keyword: string;
  tag: string;
  country: string;
  order: string;
  hidebroken: boolean;
};

const DEFAULT_PARAMS: SearchParams = {
  keyword: '',
  tag: '',
  country: '',
  order: 'clickcount',
  hidebroken: true,
};

function buildEndpoint(params: SearchParams, page: number): string {
  const kw = params.keyword.trim();
  const tg = params.tag.trim();
  const ct = params.country.trim();

  const args = new URLSearchParams({
    limit: String(LIMIT),
    offset: String(page * LIMIT),
    reverse: params.order === 'name' ? 'false' : 'true',
    hidebroken: params.hidebroken ? 'true' : 'false',
  });
  if (kw) args.set('name', kw);
  if (tg) args.set('tag', tg);
  if (ct) args.set('country', ct);
  if (params.order) args.set('order', params.order);
  if (!kw && !tg && !ct) args.set('name', '');
  return `json/stations/search?${args.toString()}`;
}

export default function HomePage() {
  const navigate = useNavigate();

  const [form, setForm] = useState<SearchParams>(DEFAULT_PARAMS);
  const [active, setActive] = useState<SearchParams>(DEFAULT_PARAMS);
  const [page, setPage] = useState(0);
  const [showFavorites, setShowFavorites] = useState(false);

  const [favorites, setFavorites] = useState<Station[]>(() => {
    const saved = localStorage.getItem('radioFavorites');
    if (saved) {
      try { return JSON.parse(saved); } catch { return []; }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('radioFavorites', JSON.stringify(favorites));
  }, [favorites]);

  const statsQuery = useQuery({ queryKey: ['stats'], queryFn: fetchStats });
  const totalStations = statsQuery.data?.stations ?? 0;

  const stationsQuery = useQuery({
    queryKey: ['stations', active, page],
    queryFn: () => fetchStations(buildEndpoint(active, page)),
    enabled: !showFavorites,
  });

  const stations = stationsQuery.data ?? [];
  const loading = stationsQuery.isFetching;
  const feedbackMsg = stationsQuery.isError
    ? 'The station directory is temporarily unavailable. Please try again in a moment.'
    : '';

  const applyNow = (patch: Partial<SearchParams>) => {
    setForm({ ...form, ...patch });
    setActive({ ...active, ...patch });
    setPage(0);
    setShowFavorites(false);
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setActive(form);
    setPage(0);
    setShowFavorites(false);
  };

  const handlePageChange = (delta: number) => {
    const newPage = page + delta;
    if (newPage < 0) return;
    setPage(newPage);
  };

  const resetFilter = () => {
    setForm(DEFAULT_PARAMS);
    setActive(DEFAULT_PARAMS);
    setPage(0);
    setShowFavorites(false);
  };

  const listenToStation = (station: Station) => {
    const slug = encodeURIComponent(station.name || station.stationuuid || 'station');
    navigate(`/station/${slug}`, { state: { station } });
  };

  const toggleFavorite = (station: Station) => {
    setFavorites((prev) =>
      prev.some((f) => f.stationuuid === station.stationuuid)
        ? prev.filter((f) => f.stationuuid !== station.stationuuid)
        : [...prev, station]
    );
  };

  const displayedStations = showFavorites ? favorites : stations;
  const isFavoritesEmpty = showFavorites && favorites.length === 0;

  return (
    <div className="page">
      <title>Global Radio Directory</title>
      <div className="split">
        <p className="head-note">
          Indexing over <b>{totalStations > 0 ? totalStations.toLocaleString() : '50,000+'}</b> internet broadcast stations.
        </p>
        <p className="head-note">
          <i>Want to set the frequency? <Link to="/frequency">Click here</Link></i>
        </p>
      </div>

      <hr className="rule" />

      {feedbackMsg && <p className="system-msg">» {feedbackMsg}</p>}

      <fieldset className="panel">
        <legend>DATABASE FILTERING</legend>
        <form onSubmit={handleSearchSubmit}>
          <div className="form-grid">
            <div className="field">
              <label className="field-label">Keyword:</label>
              <input type="text" className="control" value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} />
            </div>
            <div className="field">
              <label className="field-label">Tag / Genre:</label>
              <input type="text" className="control" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} />
            </div>
            <div className="field">
              <label className="field-label">Origin Country:</label>
              <select className="control" value={form.country} onChange={(e) => applyNow({ country: e.target.value })}>
                <option value="">Worldwide</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Sorting:</label>
              <select className="control" value={form.order} onChange={(e) => applyNow({ order: e.target.value })}>
                <option value="clickcount">Popularity</option>
                <option value="votes">Votes</option>
                <option value="bitrate">Audio Quality (kbps)</option>
                <option value="name">A-Z Name</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label"></label>
              <label className="control">
                <input type="checkbox" checked={form.hidebroken} onChange={(e) => applyNow({ hidebroken: e.target.checked })} />
                {' '}Hide unreachable streams
              </label>
            </div>
          </div>
          <div className="toolbar">
            <button type="submit" className="btn">Submit Query</button>
            <button type="button" className="btn" onClick={resetFilter}>Reset Filter</button>
            <span className="muted">|</span>
            <button type="button" className="btn" onClick={() => setShowFavorites(!showFavorites)}>
              {showFavorites ? 'Show All Results' : 'View Favorite Stations'}
            </button>
          </div>
        </form>
      </fieldset>

      <h2>{showFavorites ? 'Favorite Stations' : 'Query Results'}</h2>

      {!showFavorites && (
        <div className="results-bar">
          <div>
            Records Displayed: <strong>{page * LIMIT + (stations.length > 0 ? 1 : 0)}</strong> to <strong>{page * LIMIT + stations.length}</strong>
          </div>
          <div className="pager">
            <button type="button" className="btn-sm" disabled={page === 0} onClick={() => handlePageChange(-1)}>&lt;&lt; PREVIOUS</button>
            <button type="button" className="btn-sm" disabled={stations.length < LIMIT} onClick={() => handlePageChange(1)}>NEXT &gt;&gt;</button>
          </div>
        </div>
      )}

      {loading && !showFavorites ? (
        <p><i>Querying external directory... Please wait...</i></p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Control</th>
                <th>Station Name</th>
                <th>Tags</th>
                <th>Region</th>
                <th>Format</th>
                <th>Speed</th>
                {showFavorites ? null : <th>Score</th>}
                <th className="center">Fav</th>
              </tr>
            </thead>
            <tbody>
              {displayedStations.length > 0 ? displayedStations.map((station) => {
                const isFav = favorites.some((f) => f.stationuuid === station.stationuuid);
                return (
                  <tr key={station.stationuuid}>
                    <td className="center">
                      <button type="button" onClick={() => listenToStation(station)}>Listen</button>
                    </td>
                    <td><b>{station.name || 'Untitled Station'}</b></td>
                    <td>{station.tags ? station.tags.split(',').slice(0, 3).join(', ') : 'N/A'}</td>
                    <td>{station.country || 'Global'}</td>
                    <td>{station.codec}</td>
                    <td>{station.bitrate > 0 ? `${station.bitrate} kbps` : '?'}</td>
                    {showFavorites ? null : <td>{active.order === 'votes' ? station.votes : station.clickcount}</td>}
                    <td className="center">
                      <button
                        type="button"
                        className={`fav-btn ${isFav ? 'on' : 'off'}`}
                        onClick={() => toggleFavorite(station)}
                        title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        ♥
                      </button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={showFavorites ? 7 : 8} className="empty-cell">
                    {isFavoritesEmpty ? 'No favorites saved yet.' : 'Zero active records found adjusting parameters may yield results.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <br /><hr className="rule-thin" />
      <p><i>Made by <a href="https://github.com/plopceleste" target="_blank" rel="noreferrer">plopceleste</a>. Source code <a href="https://github.com/plopceleste/radio" target="_blank" rel="noreferrer">here</a>.</i></p>
    </div>
  );
}
