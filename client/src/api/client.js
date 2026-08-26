import axios from 'axios';

// BASE_URL always ends with "/" (either "/" or e.g. "/epreport/"), so this
// resolves to "/api" or "/epreport/api" depending on how the app is
// deployed - see vite.config.js.
const loginPath = `${import.meta.env.BASE_URL}login`;
const api = axios.create({ baseURL: `${import.meta.env.BASE_URL}api` });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('epr_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      localStorage.removeItem('epr_token');
      localStorage.removeItem('epr_user');
      if (!window.location.pathname.startsWith(loginPath)) {
        window.location.href = loginPath;
      }
    }
    return Promise.reject(err);
  }
);

export default api;
