import React from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from './HomePage';
import StationPage from './StationPage';
import FrequencyPage from './FrequencyPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/station/:name" element={<StationPage />} />
      <Route path="/frequency" element={<FrequencyPage />} />
    </Routes>
  );
}

