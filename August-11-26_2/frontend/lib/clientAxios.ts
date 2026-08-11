import axios from 'axios';
import Cookies from 'js-cookie';

const clientApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

clientApi.interceptors.request.use((config) => {
  const token = Cookies.get('client_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

clientApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      Cookies.remove('client_token');
      Cookies.remove('client_user');
      Cookies.remove('client_info');
      if (typeof window !== 'undefined') window.location.href = '/client/login';
    }
    return Promise.reject(error);
  }
);

export default clientApi;
