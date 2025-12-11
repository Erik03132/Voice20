import { Note } from '../types';
import { get, set } from 'idb-keyval';

const STORAGE_KEY = 'gemini_kb_notes_v1';

const SEED_NOTE_ID = 'seed-zeith-report-2026';

const ZEITH_REPORT_TEXT = `[IMPORTED PDF REPORT]
НАЗВАНИЕ: Моторные масла 2026. Экспертный аудит и Стратегия Zeith.

1. EXECUTIVE SUMMARY И ВЕРДИКТ
Главная рекомендация: Входить на рынок РФ с брендом Zeith в 2026 г. УСЛОВНО ЦЕЛЕСООБРАЗНО только при выполнении критических условий:
- Агрессивное снижение цены до 2200-2400 руб/4л (против текущих 2600-2900 руб).
- Приоритет каналов сбыта: Авторазборки (Autodoc, Exist) и СТО — это 80% продаж.
- Обязательная регистрация в системе “Честный знак” до первой поставки (январь 2026).

2. СОСТОЯНИЕ РЫНКА (ФАКТЫ 2024-2025)
- Объём рынка 2024: 470,22 млн л. Прогноз 2026: 476,5 млн л.
- Целевой сегмент (Синтетика): 50% от всех масел. Рост +33% за 4 года.
- Лидеры спроса по вязкости: 5W-30 (35%), 5W-40 (30%).
- Импортозамещение: Российские бренды (Лукойл, Газпром, Роснефть) занимают 60-65% рынка.
- Импорт: Падение импорта на 22-23% в 2024 году создаёт "окно возможностей", но логистика из ОАЭ несёт риски.

3. КОНКУРЕНТНЫЙ ЛАНДШАФТ
- LUKOIL (18% рынка): Цена 2400-3600 руб. Узнаваемость 80%+.
- ZIC (5.5% рынка): Цена 2600-3500 руб. Узнаваемость 70%+.
- Kixx (~4% рынка): Цена 2500-3000 руб. Узнаваемость 65%+.
- ZEITH (ОАЭ): Узнаваемость <0.5% (в 10-15 раз ниже конкурентов). Текущая цена (2600-2900) находится в "мёртвой зоне" — дорого для ноунейма.

4. СТРАТЕГИЯ ДИСТРИБУЦИИ (80/20)
Рекомендуемое распределение:
- ПРИОРИТЕТ 1: Авторазборки (45%). Аудитория ищет цену/качество. Маржа дилера 26%.
- ПРИОРИТЕТ 2: СТО (35%). Прямые продажи мастерам. Высокая маржа мастера (20-30%), работает "сарафанное радио".
- ПРИОРИТЕТ 3: Маркетплейсы (15%). Только для видимости и отзывов. Прибыли нет из-за комиссий (25-32%) и логистики.

5. ЦЕНОВАЯ СТРАТЕГИЯ
Чтобы выжить, Zeith должен позиционироваться как "недорогая альтернатива Kixx".
- Текущая цена: 2600-2900 руб/4л (Не работает).
- Целевая цена: 2200-2400 руб/4л.
- При цене 2400 руб в авторазборке, импортёр получает маржу 43% (810 руб), а дилер 26% (500 руб). Это жизнеспособная модель.

6. РЕГУЛЯТОРНЫЕ ТРЕБОВАНИЯ ("ЧЕСТНЫЙ ЗНАК")
- С 1 сентября 2025 обязательная маркировка.
- Все партии из ОАЭ должны быть зарегистрированы в ЦРПТ до таможни.
- Штрафы до 300 тыс. руб с конфискацией.

7. МАРКЕТИНГОВЫЙ ПЛАН (БЕЗ ТВ)
- YouTube (50% бюджета): Технические обзоры, сравнения с ZIC/Kixx, автомеханики-инфлюенсеры.
- Форумы (30%): Drive2, oil-club.ru. Ответы на вопросы, лабораторные анализы.
- B2B программы для СТО (20%): Бонусы за объём, обучение мастеров.

8. РИСК-СЦЕНАРИИ
- Оптимистичный (Вероятность 25%): Успешный пилот, оборот 15-22 млн руб.
- Реалистичный (50%): Цена снижена до 2400, оборот 7-12 млн руб, чистая прибыль 1-3 млн.
- Пессимистичный (25%): Цена осталась 2600, убытки, уход с рынка.

Ключевая формула успеха: (Цена ниже Kixx на 15-20%) x (Фокус на СТО/Авторазборки) x (Контент-маркетинг).`;

const SEED_NOTE: Note = {
  id: SEED_NOTE_ID,
  content: ZEITH_REPORT_TEXT,
  type: 'pdf',
  timestamp: Date.now(),
  mimeType: 'application/pdf',
  // No fileData needed for the text content to be searchable, 
  // but we flag it as processed so it doesn't trigger AI sync again.
  pendingAnalysis: false 
};

export const getNotes = async (): Promise<Note[]> => {
  try {
    // Migration: Check localStorage first
    const localData = localStorage.getItem(STORAGE_KEY);
    if (localData) {
        console.log("Migrating data from LocalStorage to IndexedDB...");
        const parsed = JSON.parse(localData);
        await set(STORAGE_KEY, parsed);
        localStorage.removeItem(STORAGE_KEY);
    }

    let data = await get<Note[]>(STORAGE_KEY);
    if (!data) data = [];

    // Seed Data Injection
    const hasSeed = data.some(n => n.id === SEED_NOTE_ID);
    if (!hasSeed) {
        console.log("Injecting Seed Zeith Report");
        data = [SEED_NOTE, ...data];
        await set(STORAGE_KEY, data);
    }

    return data;
  } catch (e) {
    console.error("Failed to load notes", e);
    return [];
  }
};

export const saveNote = async (note: Note): Promise<Note[]> => {
  const notes = await getNotes();
  const updated = [note, ...notes];
  await set(STORAGE_KEY, updated);
  return updated;
};

export const deleteNote = async (id: string): Promise<Note[]> => {
  const notes = await getNotes();
  const updated = notes.filter(n => n.id !== id);
  await set(STORAGE_KEY, updated);
  return updated;
};

export const updateNote = async (id: string, updates: Partial<Note>): Promise<Note[]> => {
  const notes = await getNotes();
  const updated = notes.map(n => n.id === id ? { ...n, ...updates } : n);
  await set(STORAGE_KEY, updated);
  return updated;
};