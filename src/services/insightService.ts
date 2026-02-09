import type { DataStore } from '../store';
import type { GardenDay, Label, WeeklyInsight } from '../types';
import { addDays, getWeekStart } from '../utils';

const TOPIC_KEYWORDS = [
  '工作',
  '压力',
  '睡眠',
  '关系',
  '家庭',
  '焦虑',
  '身体',
  '疲惫',
  '金钱',
  '健康'
];

export class InsightService {
  constructor(private readonly store: DataStore) {}

  async getGarden(userId: string, month: string): Promise<{ month: string; days: GardenDay[] }> {
    const [yearStr, monthStr] = month.split('-');
    const year = Number(yearStr);
    const monthNum = Number(monthStr);
    const dayCount = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
    const startDate = `${yearStr}-${monthStr}-01`;
    const endDate = `${yearStr}-${monthStr}-${String(dayCount).padStart(2, '0')}`;

    const entries = await this.store.listJournalsByUserAndDateRange(userId, startDate, endDate);
    const reflections = await this.store.getReflectionsByEntryIds(entries.map((entry) => entry.id));
    const entriesByDay = new Map<string, typeof entries>();

    entries.forEach((entry) => {
      const date = entry.createdAt.slice(0, 10);
      const list = entriesByDay.get(date) ?? [];
      list.push(entry);
      entriesByDay.set(date, list);
    });

    const days: GardenDay[] = [];
    for (let day = 1; day <= dayCount; day += 1) {
      const date = `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`;
      const dayEntries = entriesByDay.get(date) ?? [];
      if (dayEntries.length === 0) {
        days.push({ date, hasEntry: false, dominantLabel: null });
        continue;
      }

      const aggregate = { thought: 0, emotion: 0, body: 0 };
      dayEntries.forEach((entry) => {
        const card = reflections.get(entry.id);
        if (card) {
          aggregate.thought += card.thoughtRatio;
          aggregate.emotion += card.emotionRatio;
          aggregate.body += card.bodyRatio;
        }
      });
      const dominantLabel = this.pickDominant(aggregate);
      const total = Math.max(1e-9, aggregate.thought + aggregate.emotion + aggregate.body);
      days.push({
        date,
        hasEntry: true,
        dominantLabel,
        ratioSnapshot: {
          thought: Number((aggregate.thought / total).toFixed(4)),
          emotion: Number((aggregate.emotion / total).toFixed(4)),
          body: Number((aggregate.body / total).toFixed(4))
        }
      });
    }

    return { month, days };
  }

  async getWeeklyInsight(userId: string, weekStartInput: string): Promise<WeeklyInsight> {
    const weekStart = getWeekStart(weekStartInput);
    const weekEnd = addDays(weekStart, 6);
    const entries = await this.store.listJournalsByUserAndDateRange(userId, weekStart, weekEnd);
    const reflections = await this.store.getReflectionsByEntryIds(entries.map((entry) => entry.id));

    const aggregate = { thought: 0, emotion: 0, body: 0 };
    let countCards = 0;
    entries.forEach((entry) => {
      const card = reflections.get(entry.id);
      if (!card) {
        return;
      }
      aggregate.thought += card.thoughtRatio;
      aggregate.emotion += card.emotionRatio;
      aggregate.body += card.bodyRatio;
      countCards += 1;
    });

    const ratios = countCards
      ? {
          thought: Number((aggregate.thought / countCards).toFixed(4)),
          emotion: Number((aggregate.emotion / countCards).toFixed(4)),
          body: Number((aggregate.body / countCards).toFixed(4))
        }
      : { thought: 0, emotion: 0, body: 0 };

    const recurringTopics = this.extractTopics(entries.map((entry) => entry.rawText));
    const dominant = this.pickDominant(ratios);
    const question =
      dominant === 'thought'
        ? '当你反复思考同一问题时，身体最先出现什么反应？'
        : dominant === 'emotion'
          ? '这个高频情绪背后最想表达的需要是什么？'
          : '当身体紧绷时，你愿意先暂停10秒吗？';

    return {
      userId,
      weekStart,
      ratios,
      recurringTopics,
      question,
      generatedAt: new Date().toISOString()
    };
  }

  private extractTopics(texts: string[]): Array<{ topic: string; count: number }> {
    const counter = new Map<string, number>();
    texts.forEach((text) => {
      TOPIC_KEYWORDS.forEach((topic) => {
        const matches = text.match(new RegExp(topic, 'g'));
        if (matches && matches.length > 0) {
          counter.set(topic, (counter.get(topic) ?? 0) + matches.length);
        }
      });
    });
    return [...counter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, count]) => ({ topic, count }));
  }

  private pickDominant(value: { thought: number; emotion: number; body: number }): Label {
    const result: Array<[Label, number]> = [
      ['thought', value.thought] as [Label, number],
      ['emotion', value.emotion] as [Label, number],
      ['body', value.body] as [Label, number]
    ];
    result.sort((a, b) => b[1] - a[1]);
    return result[0][0] as Label;
  }
}
