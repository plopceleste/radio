import { Routes, Route, useParams, Link } from 'react-router-dom';
import HomePage from './HomePage';
import StationPage from './StationPage';
import FrequencyPage from './FrequencyPage';

function KeyedStationPage() {
  const { name } = useParams();
  return <StationPage key={name} />;
}

function NotFound() {
  return (
    <div>
      <title>Not Found - Radio</title>
      <hr className="rule" />
      <p className="system-msg">404 — that page does not exist.</p>
      <p><Link to="/">&laquo; Back to Directory</Link></p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/station/:name" element={<KeyedStationPage />} />
      <Route path="/frequency" element={<FrequencyPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
