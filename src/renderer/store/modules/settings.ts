import { cloneDeep, isArray, mergeWith } from 'lodash';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

import setDataDefault from '@/const/set.json';
import homeRouter from '@/router/home';
import { useMenuStore } from '@/store/modules/menu';
import {
  applyTheme,
  getCurrentTheme,
  getSystemTheme,
  ThemeType,
  watchSystemTheme
} from '@/utils/theme';

import { type AppUpdateState, createDefaultAppUpdateState } from '../../../shared/appUpdate';

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<ThemeType>(getCurrentTheme());
  const isMobile = ref(false);
  const isMiniMode = ref(false);
  const showUpdateModal = ref(false);
  const appUpdateState = ref<AppUpdateState>(createDefaultAppUpdateState());
  const showArtistDrawer = ref(false);
  const currentArtistId = ref<number | null>(null);
  const systemFonts = ref<{ label: string; value: string }[]>([
    { label: '系统默认', value: 'system-ui' }
  ]);
  const showDownloadDrawer = ref(false);

  // 系统主题监听器清理函数
  let systemThemeCleanup: (() => void) | null = null;

  // 先声明 setData ref 但不初始化
  const setData = ref<any>({});

  // 设置存储：统一使用 localStorage（Serverless/Web 模式）
  const setSetData = (data: any) => {
    const mergedData = {
      ...setData.value,
      ...data
    };
    localStorage.setItem('appSettings', JSON.stringify(cloneDeep(mergedData)));
    setData.value = cloneDeep(mergedData);
  };

  // 初始化时从 localStorage 读取设置
  const getInitialSettings = () => {
    const savedSettings = JSON.parse(localStorage.getItem('appSettings') || '{}');

    // 自定义合并策略：如果是数组，直接使用源数组（覆盖默认值）
    const customizer = (_objValue: any, srcValue: any) => {
      if (isArray(srcValue)) {
        return srcValue;
      }
      return undefined;
    };

    const mergedSettings = mergeWith({}, setDataDefault, savedSettings, customizer);
    setSetData(mergedSettings);
    return mergedSettings;
  };

  // 初始化 setData
  setData.value = getInitialSettings();

  /**
   * 保存导入的自定义API插件
   * @param plugin 包含name和content的对象
   */
  const setCustomApiPlugin = (plugin: { name: string; content: string }) => {
    setSetData({
      customApiPlugin: plugin.content,
      customApiPluginName: plugin.name
    });
  };

  const toggleTheme = () => {
    if (setData.value.autoTheme) {
      const newTheme = theme.value === 'dark' ? 'light' : 'dark';
      setSetData({
        autoTheme: false,
        manualTheme: newTheme
      });
      theme.value = newTheme;
      applyTheme(newTheme);
      if (systemThemeCleanup) {
        systemThemeCleanup();
        systemThemeCleanup = null;
      }
    } else {
      const newTheme = theme.value === 'dark' ? 'light' : 'dark';
      theme.value = newTheme;
      setSetData({ manualTheme: newTheme });
      applyTheme(newTheme);
    }
  };

  const setAutoTheme = (auto: boolean) => {
    setSetData({ autoTheme: auto });

    if (auto) {
      const systemTheme = getSystemTheme();
      theme.value = systemTheme;
      applyTheme(systemTheme);

      systemThemeCleanup = watchSystemTheme((newTheme) => {
        if (setData.value.autoTheme) {
          theme.value = newTheme;
          applyTheme(newTheme);
        }
      });
    } else {
      const manualTheme = setData.value.manualTheme || 'light';
      theme.value = manualTheme;
      applyTheme(manualTheme);

      if (systemThemeCleanup) {
        systemThemeCleanup();
        systemThemeCleanup = null;
      }
    }
  };

  const setMiniMode = (value: boolean) => {
    isMiniMode.value = value;
  };

  const setShowUpdateModal = (value: boolean) => {
    showUpdateModal.value = value;
  };

  const setAppUpdateState = (value: AppUpdateState) => {
    appUpdateState.value = value;
  };

  const setShowArtistDrawer = (show: boolean) => {
    showArtistDrawer.value = show;
    if (!show) {
      currentArtistId.value = null;
    }
  };

  const setCurrentArtistId = (id: number) => {
    currentArtistId.value = id;
  };

  const setSystemFonts = (fonts: string[]) => {
    systemFonts.value = [
      { label: '系统默认', value: 'system-ui' },
      ...fonts.map((font) => ({
        label: font,
        value: font
      }))
    ];
  };

  const setShowDownloadDrawer = (show: boolean) => {
    showDownloadDrawer.value = show;
  };

  const setLanguage = (language: string) => {
    setSetData({ language });
  };

  const initializeSettings = () => {
    // 状态已从 localStorage 自动恢复
  };

  const initializeTheme = () => {
    if (setData.value.autoTheme) {
      setAutoTheme(true);
    } else {
      const manualTheme = setData.value.manualTheme || getCurrentTheme();
      theme.value = manualTheme;
      applyTheme(manualTheme);
    }
  };

  // Web 模式下无法获取系统字体列表
  const initializeSystemFonts = async () => {
    // no-op in web mode
  };

  // 计算移动端状态的函数
  const calculateMobileStatus = () => {
    const userAgentFlag = navigator.userAgent.match(
      /(phone|pad|pod|iPhone|iPod|ios|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone)/i
    );
    const isMobileWidth = window.innerWidth < 500;
    const isMobileDevice = !!userAgentFlag || isMobileWidth;
    const tabletMode = setData.value?.tabletMode;

    return isMobileDevice && !tabletMode;
  };

  // 更新移动端状态和DOM类
  const updateMobileStatus = () => {
    const menuStore = useMenuStore();
    const shouldUseMobileStyle = calculateMobileStatus();

    if (shouldUseMobileStyle) {
      menuStore.setMenus(homeRouter.filter((item) => item.meta.isMobile));
    } else {
      menuStore.setMenus(homeRouter);
    }

    if (shouldUseMobileStyle) {
      document.documentElement.classList.add('mobile');
      document.documentElement.classList.remove('pc');
    } else {
      document.documentElement.classList.add('pc');
      document.documentElement.classList.remove('mobile');
    }

    isMobile.value = shouldUseMobileStyle;
  };

  watch(
    () => setData.value?.tabletMode,
    () => {
      updateMobileStatus();
    },
    { immediate: true }
  );

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateMobileStatus);
  }

  return {
    setData,
    theme,
    isMobile,
    isMiniMode,
    showUpdateModal,
    appUpdateState,
    showArtistDrawer,
    currentArtistId,
    systemFonts,
    showDownloadDrawer,
    setSetData,
    toggleTheme,
    setAutoTheme,
    setMiniMode,
    setShowUpdateModal,
    setAppUpdateState,
    setShowArtistDrawer,
    setCurrentArtistId,
    setSystemFonts,
    setShowDownloadDrawer,
    setLanguage,
    initializeSettings,
    initializeTheme,
    initializeSystemFonts,
    setCustomApiPlugin
  };
});
