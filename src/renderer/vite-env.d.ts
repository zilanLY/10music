/// <reference types="vite/client" />

// Web/Serverless 模式类型声明
// Electron 的全部类型在此定义为空接口，避免编译报错

declare global {
  interface Window {
    electron?: undefined;
    api?: undefined;
  }
}

export {};
