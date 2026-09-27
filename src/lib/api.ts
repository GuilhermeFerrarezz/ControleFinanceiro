import axios from 'axios';

export const api = axios.create({
    baseURL: '/api/v1',
    timeout: 10000
});

api.interceptors.request.use(
    (config) => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
        if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        }
        return config
    },
    (error) => {
    return Promise.reject(error);
  }
)


api.interceptors.response.use(
    (response) => {
        return response
    },
    async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
        
            try {
                const response = await axios.post('/api/v1/auth/refresh');
                const { accessToken } = response.data;
                localStorage.setItem('accessToken', accessToken);
                originalRequest.headers.Authorization = `Bearer ${accessToken}`;
                return api(originalRequest);
            
            } catch (refreshError) {
                localStorage.removeItem('accessToken');
                localStorage.removeItem('userId');
                if (typeof window !== 'undefined') {
                    window.location.href = '/login';
                }
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    }

)

