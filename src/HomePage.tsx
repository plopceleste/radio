import React, { useState, useEffect, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
}

export default function HomePage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const navigate = useNavigate();
  
  const [searchParams, setSearchParams] = useState({
      keyword: '',
      tag: '',
      country: '',
      order: 'clickcount',
      hidebroken: true
  });
  const [activeParams, setActiveParams] = useState({ ...searchParams });
  const [page, setPage] = useState<number>(0);
  const limit = 50;
  const [totalStations, setTotalStations] = useState<number>(0);
  const [feedbackMsg, setFeedbackMsg] = useState<string>('');
  
  const [favorites, setFavorites] = useState<Station[]>(() => {
      const saved = localStorage.getItem('radioFavorites');
      if (saved) {
          try { return JSON.parse(saved); } catch { return []; }
      }
      return [];
  });
  const [showFavorites, setShowFavorites] = useState(false);

  useEffect(() => {
    document.title = 'Global Radio Directory';
  }, []);

  useEffect(() => {
      localStorage.setItem('radioFavorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    fetchRadioDirectory('json/stats')
        .then(data => {
            if (data && data.stations) setTotalStations(data.stations);
        })
        .catch(() => setTotalStations(80000));
        
    executeSearch({ ...searchParams }, 0);
    // Mount-only bootstrap: intentionally runs once, not on searchParams changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const executeSearch = async (params: typeof searchParams, pageNum: number) => {
      if (showFavorites) setShowFavorites(false);
      setLoading(true);
      setFeedbackMsg('');
      let success = false;
      
      try {
          let relativeEndpoint = '';
          const pKw = params.keyword.trim();
          const pTg = params.tag.trim();
          const pCt = params.country.trim();

          if (!pKw && !pTg && !pCt && pageNum === 0 && params.order === 'clickcount') {
              relativeEndpoint = `json/stations/topclick/${limit}?hidebroken=${params.hidebroken ? 'true' : 'false'}`;
          } else {
              const searchArgs = new URLSearchParams({
                  limit: limit.toString(),
                  offset: (pageNum * limit).toString(),
                  reverse: 'true',
                  hidebroken: params.hidebroken ? 'true' : 'false'
              });
              if (pKw) searchArgs.set('name', pKw);
              if (pTg) searchArgs.set('tag', pTg);
              if (pCt) searchArgs.set('country', pCt);
              if (params.order) searchArgs.set('order', params.order);
              if (!pKw && !pTg && !pCt) searchArgs.set('name', '');
              relativeEndpoint = `json/stations/search?${searchArgs.toString()}`;
          }

          const errors: string[] = [];
          try {
              const data = await fetchRadioDirectory(relativeEndpoint);
              if (Array.isArray(data)) {
                  setStations(data);
                  success = true;
              } else {
                  errors.push('No data returned from directory servers');
              }
          } catch (err: any) {
              errors.push(err.message || 'Error contacting API');
          }

          if (!success) {
              setStations([]);
              setFeedbackMsg(`Warning: Query failed (${errors.join(', ')}).`);
          }
      } catch {
          setStations([]);
          setFeedbackMsg('An unexpected error occurred processing the directory request.');
      } finally {
          setLoading(false);
      }
  };

  const handleSearchSubmit = (e: FormEvent) => {
      e.preventDefault();
      setActiveParams({ ...searchParams });
      setPage(0);
      executeSearch(searchParams, 0);
  };

  const handlePageChange = (delta: number) => {
      const newPage = page + delta;
      if (newPage < 0) return;
      setPage(newPage);
      executeSearch(activeParams, newPage);
  };

  const listenToStation = (station: Station) => {
      navigate(`/station/${encodeURIComponent(station.name)}`, { state: { station } });
  };

  const toggleFavorite = (station: Station) => {
      if (favorites.some(f => f.stationuuid === station.stationuuid)) {
          setFavorites(favorites.filter(f => f.stationuuid !== station.stationuuid));
      } else {
          setFavorites([...favorites, station]);
      }
  };

  const displayedStations = showFavorites ? favorites : stations;
  const isFavoritesEmpty = showFavorites && favorites.length === 0;

  return (
    <div style={{ padding: '0 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <p style={{marginTop: '4px', margin: '10px 0 0 0'}}>
                Indexing over <b>{totalStations > 0 ? totalStations.toLocaleString() : '50,000+'}</b> internet broadcast stations.
            </p>
            <p style={{ margin: '10px 0 0 0' }}>
                <i>Want to set the frequency? <Link to="/frequency">Click here</Link></i>
            </p>
        </div>

        <hr style={{ border: 'none', borderTop: '2px solid #000' }} />

        {feedbackMsg && (
            <p className="system-msg" style={{ color: 'red', fontWeight: 'bold' }}>» {feedbackMsg}</p>
        )}

        <fieldset style={{ padding: '15px' }}>
            <legend>DATABASE FILTERING</legend>
            <form onSubmit={handleSearchSubmit}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
                        <label style={{ display: 'inline-block', width: '120px', flexShrink: 0 }}>Keyword:</label>
                        <input type="text" value={searchParams.keyword} onChange={e => setSearchParams({...searchParams, keyword: e.target.value})} style={{ flex: '1 1 200px', maxWidth: '300px' }} />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
                        <label style={{ display: 'inline-block', width: '120px', flexShrink: 0 }}>Tag / Genre:</label>
                        <input type="text" value={searchParams.tag} onChange={e => setSearchParams({...searchParams, tag: e.target.value})} style={{ flex: '1 1 200px', maxWidth: '300px' }} />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
                        <label style={{ display: 'inline-block', width: '120px', flexShrink: 0 }}>Origin Country:</label>
                        <select value={searchParams.country} onChange={e => {
                            const newParams = {...searchParams, country: e.target.value};
                            setSearchParams(newParams);
                            setActiveParams(newParams);
                            setPage(0);
                            executeSearch(newParams, 0);
                        }} style={{ flex: '1 1 200px', maxWidth: '300px' }}>
                            <option value="">Worldwide</option>
                            <option value="United States">United States</option>
                            <option value="United Kingdom">United Kingdom</option>
                            <option value="France">France</option>
                            <option value="Germany">Germany</option>
                            <option value="Italy">Italy</option>
                            <option value="Spain">Spain</option>
                            <option value="Canada">Canada</option>
                            <option value="Australia">Australia</option>
                            <option value="Japan">Japan</option>
                            <option value="Brazil">Brazil</option>
                            <option value="Mexico">Mexico</option>
                            <option value="India">India</option>
                            <option value="Russia">Russia</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
                        <label style={{ display: 'inline-block', width: '120px', flexShrink: 0 }}>Sorting:</label>
                        <select value={searchParams.order} onChange={e => {
                            const newParams = {...searchParams, order: e.target.value};
                            setSearchParams(newParams);
                            setActiveParams(newParams);
                            setPage(0);
                            executeSearch(newParams, 0);
                        }} style={{ flex: '1 1 200px', maxWidth: '300px' }}>
                            <option value="clickcount">Popularity</option>
                            <option value="votes">Votes</option>
                            <option value="bitrate">Audio Quality (kbps)</option>
                            <option value="name">A-Z Name</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
                        <label style={{ display: 'inline-block', width: '120px', flexShrink: 0 }}></label>
                        <label style={{ flex: '1 1 200px' }}>
                            <input type="checkbox" checked={searchParams.hidebroken} onChange={e => {
                                const newParams = {...searchParams, hidebroken: e.target.checked};
                                setSearchParams(newParams);
                                setActiveParams(newParams);
                                setPage(0);
                                executeSearch(newParams, 0);
                            }} />
                            {' '}Hide unreachable streams
                        </label>
                    </div>
                </div>
                <div style={{ marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="submit" style={{ padding: '8px 16px' }}>Submit Query</button>
                    <button type="button" onClick={() => {
                        const def = {keyword: '', tag: '', country: '', order: 'clickcount', hidebroken: true};
                        setSearchParams(def);
                        setActiveParams(def);
                        setPage(0);
                        executeSearch(def, 0);
                    }} style={{ padding: '8px 16px' }}>Reset Filter</button>
                    <span style={{ color: '#ccc' }}>|</span>
                    <button type="button" onClick={() => setShowFavorites(!showFavorites)} style={{ padding: '8px 16px' }}>
                        {showFavorites ? 'Show All Results' : 'View Favorite Stations'}
                    </button>
                </div>
            </form>
        </fieldset>

        <h2>{showFavorites ? 'Favorite Stations' : 'Query Results'}</h2>

        {!showFavorites && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                <div>
                    Records Displayed: <strong>{page * limit + (stations.length > 0 ? 1 : 0)}</strong> to <strong>{page * limit + stations.length}</strong>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="button" disabled={page === 0} onClick={() => handlePageChange(-1)} style={{ padding: '6px 12px' }}>&lt;&lt; PREVIOUS</button>
                    <button type="button" disabled={stations.length < limit} onClick={() => handlePageChange(1)} style={{ padding: '6px 12px' }}>NEXT &gt;&gt;</button>
                </div>
            </div>
        )}

        {loading && !showFavorites ? (
             <p><i>Querying external directory... Please wait...</i></p>
        ) : (
            <div style={{ overflowX: 'auto', width: '100%', marginBottom: '20px' }}>
                <table style={{ width: '100%', minWidth: '600px' }}>
                    <thead>
                        <tr>
                            <th style={{ width: '80px' }}>Control</th>
                            <th style={{ width: '30%' }}>Station Name</th>
                            <th style={{ width: '20%' }}>Tags</th>
                            <th style={{ width: '15%' }}>Region</th>
                            <th style={{ width: '10%' }}>Format</th>
                            <th style={{ width: '10%' }}>Speed</th>
                            {showFavorites ? null : <th style={{ width: '6%' }}>Score</th>}
                            <th style={{ width: '4%', textAlign: 'center' }}>Fav</th>
                        </tr>
                    </thead>
                <tbody>
                    { displayedStations.length > 0 ? displayedStations.map(station => {
                        const isFav = favorites.some(f => f.stationuuid === station.stationuuid);
                        return (
                            <tr key={station.stationuuid}>
                                <td style={{ textAlign: 'center' }}>
                                    <button type="button" onClick={() => listenToStation(station)}>Listen</button>
                                </td>
                                <td><b>{station.name || 'Untitled Station'}</b></td>
                                <td>{station.tags ? station.tags.split(',').slice(0, 3).join(', ') : 'N/A'}</td>
                                <td>{station.country || 'Global'}</td>
                                <td>{station.codec}</td>
                                <td>{station.bitrate > 0 ? `${station.bitrate} kbps` : '?'}</td>
                                {showFavorites ? null : <td>{activeParams.order === 'votes' ? (station.votes ?? station.clickcount) : station.clickcount}</td>}
                                <td style={{ textAlign: 'center' }}>
                                    <button 
                                        type="button" 
                                        onClick={() => toggleFavorite(station)} 
                                        style={{ 
                                            background: 'transparent', 
                                            border: 'none', 
                                            cursor: 'pointer', 
                                            fontSize: '18px', 
                                            color: isFav ? '#ff7777' : 'gray',
                                            padding: '0'
                                        }}
                                        title={isFav ? "Remove from favorites" : "Add to favorites"}
                                    >
                                        ♥
                                    </button>
                                </td>
                            </tr>
                        );
                    }) : (
                        <tr>
                            <td colSpan={showFavorites ? 7 : 8} style={{padding: '20px', textAlign: 'center'}}>
                                {isFavoritesEmpty ? 'No favorites saved yet.' : 'Zero active records found adjusting parameters may yield results.'}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
            </div>
        )}
        
        <br/><hr style={{ border: 'none', borderTop: '1px solid #000' }} />
        <p><i>Open Directory Access Interface. System uses public instances.</i></p>
    </div>
  );
}
