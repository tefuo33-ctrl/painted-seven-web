// Профиль игрока: имя и внешний вид персонажа. Хранится в браузере.

import { type Skin, DEFAULT_SKIN } from '../three/character';

export interface Profile {
  name: string;
  skin: Skin;
}

const PROFILE_KEY = 'painted-seven-profile-v1';

export function loadProfile(): Profile {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as Partial<Profile> | null;
    return {
      name: typeof saved?.name === 'string' ? saved.name : '',
      skin: { ...DEFAULT_SKIN, ...(saved?.skin ?? {}) },
    };
  } catch {
    return { name: '', skin: { ...DEFAULT_SKIN } };
  }
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // хранилище недоступно — профиль просто не сохранится
  }
}

/** Имя для показа: если человек ничего не ввёл — «Вы». */
export function displayName(profile: Profile): string {
  return profile.name.trim() || 'Вы';
}
