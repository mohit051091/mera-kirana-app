import axios from 'axios';

const getCookie = (name) => {
    if (typeof document === 'undefined') return '';
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return '';
};

const api = axios.create({
    baseURL: 'http://localhost:3000/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use((config) => {
    const accessKey = getCookie('admin_access_key');
    if (accessKey) {
        config.headers['x-admin-password'] = accessKey;
    }
    return config;
});

export default api;
