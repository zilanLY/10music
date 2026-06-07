import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import {
  createDefaultDownloadSettings,
  DOWNLOAD_TASK_STATE,
  type DownloadSettings,
  type DownloadTask
} from '../../../shared/download';

const DEFAULT_COVER = '/images/default_cover.png';

function validatePicUrl(url?: string): string {
  if (!url || url === '' || url.startsWith('/')) return DEFAULT_COVER;
  return url.replace(/^http:\/\//, 'https://');
}

/**
 * Web/Serverless 模式下载 Store
 * 
 * 注意：Web 端下载能力有限。
 * - 单曲下载：通过 Blob + <a download> 实现（浏览器限制，无并发管理）
 * - 批量下载：暂不支持（浏览器不支持批量文件下载）
 * - 下载管理：使用 localStorage 保存设置
 */
export const useDownloadStore = defineStore(
  'download',
  () => {
    // ── State ──
    const tasks = ref(new Map<string, DownloadTask>());
    const completedList = ref<any[]>([]);
    const settings = ref<DownloadSettings>(createDefaultDownloadSettings());
    const isLoadingCompleted = ref(false);

    // ── Computed ──
    const downloadingList = computed(() => {
      const active = [
        DOWNLOAD_TASK_STATE.queued,
        DOWNLOAD_TASK_STATE.downloading,
        DOWNLOAD_TASK_STATE.paused
      ] as string[];
      return [...tasks.value.values()]
        .filter((t) => active.includes(t.state))
        .sort((a, b) => a.createdAt - b.createdAt);
    });

    const downloadingCount = computed(() => downloadingList.value.length);

    const totalProgress = computed(() => {
      const list = downloadingList.value;
      if (list.length === 0) return 0;
      const sum = list.reduce((acc, t) => acc + t.progress, 0);
      return sum / list.length;
    });

    // ── Web 下载实现 ──
    const addDownload = async (songInfo: DownloadTask['songInfo'], url: string, _type: string) => {
      try {
        const validatedInfo = { ...songInfo, picUrl: validatePicUrl(songInfo.picUrl) };
        const artistNames = validatedInfo.ar?.map((a) => a.name).join(',') ?? '';
        const filename = `${validatedInfo.name} - ${artistNames}`;

        // Blob 下载方式
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${filename}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } catch (err) {
        console.error('[download] Web download failed:', err);
      }
    };

    const batchDownload = async (
      items: Array<{ songInfo: DownloadTask['songInfo']; url: string; type: string }>
    ) => {
      // Web 端逐首下载
      for (const item of items) {
        await addDownload(item.songInfo, item.url, item.type);
      }
    };

    // Web 模式下无并发管理，这些是 no-op
    const pauseTask = async (_taskId: string) => {};
    const resumeTask = async (_taskId: string) => {};
    const cancelTask = async (taskId: string) => { tasks.value.delete(taskId); };
    const cancelAll = async () => { tasks.value.clear(); };
    const updateConcurrency = async (_n: number) => {};
    const refreshCompleted = async () => {};
    const deleteCompleted = async (_filePath: string) => {};
    const clearCompleted = async () => { completedList.value = []; };
    const loadPersistedQueue = async () => {};
    const initListeners = () => {};
    const cleanup = () => {};

    return {
      // state
      tasks,
      completedList,
      settings,
      isLoadingCompleted,
      // computed
      downloadingList,
      downloadingCount,
      totalProgress,
      // actions
      addDownload,
      batchDownload,
      pauseTask,
      resumeTask,
      cancelTask,
      cancelAll,
      updateConcurrency,
      refreshCompleted,
      deleteCompleted,
      clearCompleted,
      loadPersistedQueue,
      initListeners,
      cleanup
    };
  },
  {
    persist: {
      key: 'download-settings',
      pick: ['settings']
    }
  }
);
