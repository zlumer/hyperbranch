import axios from 'axios';

export const apiClient = axios.create({
  baseURL: '/api',
});

apiClient.interceptors.request.use((config) => {
  const apiKey = localStorage.getItem('HB_API_KEY');
  if (apiKey) {
    config.headers['x-api-key'] = apiKey;
  }
  return config;
});
