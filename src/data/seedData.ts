import { UserSettings } from '../types/clipforge';

export const STUDIO_IMAGES = {
  heroStudio: '/src/assets/images/hero_studio_showcase_1795196173627.jpg',
  podcast: '/src/assets/images/clip_podcast_studio_1795196174300.jpg',
  gaming: '/src/assets/images/clip_gaming_creator_1795196174638.jpg',
  educator: '/src/assets/images/clip_tech_educator_1795196181105.jpg',
  comedy: '/src/assets/images/clip_comedy_stage_1795196174695.jpg',
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  creatorName: 'Creator',
  creatorEmail: 'creator@workspace.local',
  channelHandle: '@creator',
  defaultAspectRatio: '9:16',
  defaultTemplateId: 'bold-viral',
  exportQuality: '1080p',
  autoAddSfx: false,
  availableCreditsMinutes: 180,
  maxUploadSizeMB: 300,
};
