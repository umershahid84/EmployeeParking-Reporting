import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

// import.meta.env.BASE_URL comes from vite.config.js's `base` (which reads
// BASE_PATH out of the repo's root .env), so client-side routing works
// correctly whether the app is served from "/" or a sub-path like
// "/epreport" behind a reverse proxy.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
