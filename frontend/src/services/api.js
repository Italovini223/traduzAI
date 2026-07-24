import axios from 'axios';

let tokenRefresher = null;
let onUnauthorized = null;

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
});

export function setSessionToken(token) {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
}

export function setTokenRefresher(fn) {
  tokenRefresher = fn;
}

export function setOnUnauthorized(fn) {
  onUnauthorized = fn;
}

// 401 interceptor with single retry
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry && tokenRefresher) {
      originalRequest._retry = true;

      try {
        const newToken = await tokenRefresher();
        if (newToken) {
          setSessionToken(newToken);
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
          return api(originalRequest);
        }
      } catch (refreshErr) {
        console.error('Token refresh in interceptor failed:', refreshErr);
      }
    }

    if (error.response?.status === 401 && onUnauthorized) {
      onUnauthorized();
    }

    return Promise.reject(error);
  }
);

export default api;
