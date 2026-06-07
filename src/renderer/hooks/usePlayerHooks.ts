import { cloneDeep } from 'lodash';
import { createDiscreteApi } from 'naive-ui';

import i18n from '@/../i18n/renderer';
import { getMusicLrc, getMusicUrl, getParsingMusicUrl } from '@/api/music';
import { playbackRequestManager } from '@/services/playbackRequestManager';
import { SongSourceConfigManager } from '@/services/SongSourceConfigManager';
import type { ILyric, ILyricText, IWordData, SongResult } from '@/types/music';
import { getImgUrl } from '@/utils';
import { getImageLinearBackground } from '@/utils/linearColor';
import { parseLyrics as parseYrcLyrics } from '@/utils/yrcParser';

const { message } = createDiscreteApi(['message']);

const getSongArtistText = (songData: SongResult): string => {
  if (songData?.ar?.length) {
    return songData.ar.map((artist) => artist.name).join(' / ');
  }
  if (songData?.song?.artists?.length) {
    return songData.song.artists.map((artist) => artist.name).join(' / ');
  }
  return '';
};

/**
 * Web 模式：不使用磁盘缓存，直接返回在线 URL
 */
const resolveCachedPlaybackUrl = async (
  url: string | null | undefined,
  _songData: SongResult
): Promise<string | null | undefined> => {
  return url;
};

/**
 * 获取歌曲播放URL（独立函数）
 */
export const getSongUrl = async (
  id: string | number,
  songData: SongResult,
  isDownloaded: boolean = false,
  requestId?: string
) => {
  const numericId = typeof id === 'string' ? parseInt(id, 10) : id;

  const { useSettingsStore } = await import('@/store/modules/settings');
  const settingsStore = useSettingsStore();

  try {
    if (requestId && !playbackRequestManager.isRequestValid(requestId)) {
      throw new Error('Request cancelled');
    }

    if (songData.playMusicUrl) {
      if (isDownloaded) return songData.playMusicUrl;
      return await resolveCachedPlaybackUrl(songData.playMusicUrl, songData);
    }

    // 自定义API最优先
    const globalSources = settingsStore.setData.enabledMusicSources || [];
    const useCustomApiGlobally = globalSources.includes('custom');
    const songConfig = SongSourceConfigManager.getConfig(id);
    const useCustomApiForSong = songConfig?.sources.includes('custom' as any) ?? false;

    if ((useCustomApiGlobally || useCustomApiForSong) && settingsStore.setData.customApiPlugin) {
      try {
        const { parseFromCustomApi } = await import('@/api/parseFromCustomApi');
        const customResult = await parseFromCustomApi(
          numericId,
          cloneDeep(songData),
          settingsStore.setData.musicQuality || 'higher'
        );
        if (requestId && !playbackRequestManager.isRequestValid(requestId)) {
          throw new Error('Request cancelled');
        }
        if (customResult?.data?.data?.url) {
          if (isDownloaded) return customResult.data.data as any;
          return await resolveCachedPlaybackUrl(customResult.data.data.url, songData);
        }
      } catch (error) {
        if ((error as Error).message === 'Request cancelled') throw error;
      }
    }

    // 自定义音源解析
    if (songConfig) {
      try {
        const res = await getParsingMusicUrl(numericId, cloneDeep(songData));
        if (requestId && !playbackRequestManager.isRequestValid(requestId)) {
          throw new Error('Request cancelled');
        }
        if (res?.data?.data?.url) {
          return await resolveCachedPlaybackUrl(res.data.data.url, songData);
        }
      } catch (error) {
        if ((error as Error).message === 'Request cancelled') throw error;
      }
    }

    // 官方 API
    const { data } = await getMusicUrl(numericId, isDownloaded);
    if (requestId && !playbackRequestManager.isRequestValid(requestId)) {
      throw new Error('Request cancelled');
    }

    if (data?.data?.[0]) {
      const songDetail = data.data[0];
      const hasNoUrl = !songDetail.url;
      const isTrial = !!songDetail.freeTrialInfo;

      if (hasNoUrl || isTrial) {
        const res = await getParsingMusicUrl(numericId, cloneDeep(songData));
        if (requestId && !playbackRequestManager.isRequestValid(requestId)) {
          throw new Error('Request cancelled');
        }
        if (isDownloaded) return res?.data?.data as any;
        return await resolveCachedPlaybackUrl(res?.data?.data?.url || null, songData);
      }

      if (isDownloaded) return songDetail as any;
      return await resolveCachedPlaybackUrl(songDetail.url, songData);
    }

    // 备用解析
    const res = await getParsingMusicUrl(numericId, cloneDeep(songData));
    if (requestId && !playbackRequestManager.isRequestValid(requestId)) {
      throw new Error('Request cancelled');
    }
    if (isDownloaded) return res?.data?.data as any;
    return await resolveCachedPlaybackUrl(res?.data?.data?.url || null, songData);
  } catch (error) {
    if ((error as Error).message === 'Request cancelled') throw error;
    const res = await getParsingMusicUrl(numericId, cloneDeep(songData));
    if (isDownloaded) return res?.data?.data as any;
    return await resolveCachedPlaybackUrl(res?.data?.data?.url || null, songData);
  }
};

export const useSongUrl = () => {
  return { getSongUrl };
};

/**
 * 解析歌词
 */
const parseLyrics = (lyricsString: string): { lyrics: ILyricText[]; times: number[] } => {
  if (!lyricsString || typeof lyricsString !== 'string') {
    return { lyrics: [], times: [] };
  }
  try {
    const parseResult = parseYrcLyrics(lyricsString);
    if (!parseResult.success) return { lyrics: [], times: [] };

    const { lyrics: parsedLyrics } = parseResult.data;
    const lyrics: ILyricText[] = [];
    const times: number[] = [];

    for (const line of parsedLyrics) {
      const hasWords = line.words && line.words.length > 0;
      lyrics.push({
        text: line.fullText,
        trText: '',
        words: hasWords ? (line.words as IWordData[]) : undefined,
        hasWordByWord: hasWords,
        startTime: line.startTime,
        duration: line.duration
      });
      times.push(line.startTime / 1000);
    }

    return { lyrics, times };
  } catch (error) {
    return { lyrics: [], times: [] };
  }
};

/**
 * 加载歌词 — Web 模式（无磁盘缓存）
 */
export const loadLrc = async (id: string | number): Promise<ILyric> => {
  try {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
    const { data: lyricData } = await getMusicLrc(numericId);

    const data = lyricData ?? {};
    const { lyrics, times } = parseLyrics(data?.yrc?.lyric || data?.lrc?.lyric);

    // 检查逐字歌词
    let hasWordByWord = false;
    for (const lyric of lyrics) {
      if (lyric.hasWordByWord) { hasWordByWord = true; break; }
    }

    // 翻译歌词
    if (data.tlyric?.lyric) {
      const { lyrics: tLyrics } = parseLyrics(data.tlyric.lyric);
      if (tLyrics.length === lyrics.length) {
        lyrics.forEach((item, index) => {
          item.trText = item.text && tLyrics[index] ? tLyrics[index].text : '';
        });
      } else {
        const tLyricMap = new Map<number, string>();
        tLyrics.forEach((lyric) => {
          if (lyric.text && lyric.startTime !== undefined) {
            tLyricMap.set(lyric.startTime / 1000, lyric.text);
          }
        });
        lyrics.forEach((item, index) => {
          if (!item.text) { item.trText = ''; return; }
          const currentTime = times[index];
          let closestTime = -1;
          let minDiff = 2.0;
          for (const [tTime] of tLyricMap.entries()) {
            const diff = Math.abs(tTime - currentTime);
            if (diff < minDiff) { minDiff = diff; closestTime = tTime; }
          }
          item.trText = closestTime !== -1 ? tLyricMap.get(closestTime) || '' : '';
        });
      }
    } else {
      lyrics.forEach((item) => { item.trText = ''; });
    }

    return { lrcTimeArray: times, lrcArray: lyrics, hasWordByWord };
  } catch (err) {
    console.error('Error loading lyrics:', err);
    return { lrcTimeArray: [], lrcArray: [], hasWordByWord: false };
  }
};

export const useLyrics = () => {
  return { loadLrc, parseLyrics };
};

export const useSongDetail = () => {
  const { getSongUrl } = useSongUrl();

  const getSongDetail = async (playMusic: SongResult, requestId?: string) => {
    if (requestId && !playbackRequestManager.isRequestValid(requestId)) {
      throw new Error('Request cancelled');
    }

    if (playMusic.expiredAt && playMusic.expiredAt < Date.now()) {
      if (!playMusic.playMusicUrl?.startsWith('local://')) {
        playMusic.playMusicUrl = undefined;
      }
    }

    try {
      const playMusicUrl =
        playMusic.playMusicUrl || (await getSongUrl(playMusic.id, playMusic, false, requestId));

      if (requestId && !playbackRequestManager.isRequestValid(requestId)) {
        throw new Error('Request cancelled');
      }

      playMusic.createdAt = Date.now();
      playMusic.expiredAt = playMusic.createdAt + 1800000;
      const { backgroundColor, primaryColor } =
        playMusic.backgroundColor && playMusic.primaryColor
          ? playMusic
          : await getImageLinearBackground(getImgUrl(playMusic?.picUrl, '30y30'));

      if (requestId && !playbackRequestManager.isRequestValid(requestId)) {
        throw new Error('Request cancelled');
      }

      playMusic.playLoading = false;
      return { ...playMusic, playMusicUrl, backgroundColor, primaryColor } as SongResult;
    } catch (error) {
      if ((error as Error).message === 'Request cancelled') throw error;
      playMusic.playLoading = false;
      throw error;
    }
  };

  return { getSongDetail };
};
