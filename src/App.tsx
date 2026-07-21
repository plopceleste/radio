import { Routes, Route, useParams } from 'react-router-dom';
import HomePage from './HomePage';
import StationPage from './StationPage';
import FrequencyPage from './FrequencyPage';

// Remount StationPage whenever the station changes. Its audio graph is built
// once via createMediaElementSource (which can only run once per <audio>
// element), so keying by station name gives each station a fresh player.
function KeyedStationPage() {
  const { name } = useParams();
  return <StationPage key={name} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/station/:name" element={<KeyedStationPage />} />
      <Route path="/frequency" element={<FrequencyPage />} />
    </Routes>
  );
}
