import axios, { InternalAxiosRequestConfig } from 'axios';

import { useUserStore } from '@/store/modules/user';

import { isMobile } from '.';

// 扩展请求配置接口
interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  retryCount?: number;
  noRetry?: boolean;
}

const request = axios.create({
  baseURL: import.meta.env.VITE_API || '/api',
  timeout: 15000,
  withCredentials: true
});

// 最大重试次数
const MAX_RETRIES = 1;
// 重试延迟（毫秒）
const RETRY_DELAY = 500;

// 请求拦截器
request.interceptors.request.use(
  (config: CustomAxiosRequestConfig) => {
    // 只初始化一次
    if (config.retryCount === undefined) {
      config.retryCount = 0;
    }

    // 在请求发送之前做一些处理
    config.params = {
      ...config.params,
      timestamp: Date.now(),
      device: isMobile ? 'mobile' : 'web'
    };
    const token = localStorage.getItem('token');
    if (token && config.method !== 'post') {
      config.params.cookie = config.params.cookie !== undefined ? config.params.cookie : token;
    } else if (token && config.method === 'post') {
      config.data = {
        ...config.data,
        cookie: token
      };
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

const NO_RETRY_URLS = ['暂时没有'];

// 响应拦截器
request.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    console.error('error', error);
    const config = error.config as CustomAxiosRequestConfig;

    if (!config) {
      return Promise.reject(error);
    }

    // 处理 301 状态码 (需要登录)
    if (error.response?.status === 301 && config.params.noLogin !== true) {
      const userStore = useUserStore();
      userStore.handleLogout();
      console.log(`301 状态码，清除登录信息`);
      config.retryCount = 3; // 不重试，直接退出
    }

    // 重试逻辑
    if (
      config.retryCount !== undefined &&
      config.retryCount < MAX_RETRIES &&
      !NO_RETRY_URLS.includes(config.url as string) &&
      !config.noRetry
    ) {
      config.retryCount++;
      console.error(`请求重试第 ${config.retryCount} 次`);

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      return request(config);
    }

    console.error(`重试${MAX_RETRIES}次后仍然失败`);
    return Promise.reject(error);
  }
);

export default request;
