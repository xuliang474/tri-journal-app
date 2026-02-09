import { AppError } from '../errors';
import type { DataStore } from '../store';
import type {
  EntryMode,
  JournalEntry,
  Label,
  LabeledSpan,
  ReflectionCard,
  SourceType
} from '../types';
import { randomToken, toIso } from '../utils';
import type { AiService } from './aiService';

export class JournalService {
  constructor(
    private readonly store: DataStore,
    private readonly aiService: AiService
  ) {}

  async create(
    userId: string,
    payload: { mode: EntryMode; source: SourceType; rawText: string }
  ): Promise<JournalEntry> {
    const entry: JournalEntry = {
      id: randomToken('jnl'),
      userId,
      mode: payload.mode,
      source: payload.source,
      rawText: payload.rawText,
      createdAt: toIso(Date.now())
    };
    await this.store.createJournal(entry);
    return entry;
  }

  async getById(
    userId: string,
    entryId: string
  ): Promise<{ entry: JournalEntry; spans: LabeledSpan[]; reflection?: ReflectionCard }> {
    const entry = await this.assertOwner(userId, entryId);
    const spans = await this.store.getSpans(entryId);
    const reflection = await this.store.getReflection(entryId);
    return { entry, spans, reflection };
  }

  async analyze(
    userId: string,
    entryId: string
  ): Promise<{ spans: LabeledSpan[]; reflection: ReflectionCard; modelVersion: string }> {
    const entry = await this.assertOwner(userId, entryId);
    const analyzed = this.aiService.analyze(entry.id, entry.rawText);
    await this.store.replaceSpans(entry.id, analyzed.spans);
    await this.store.upsertReflection(analyzed.reflection);
    return {
      spans: analyzed.spans,
      reflection: analyzed.reflection,
      modelVersion: 'tri-color-heuristic-v1'
    };
  }

  async patchSpans(
    userId: string,
    entryId: string,
    spans: Array<{ start: number; end: number; label: Label }>
  ): Promise<LabeledSpan[]> {
    const entry = await this.assertOwner(userId, entryId);
    this.validateSpans(entry.rawText, spans);
    const updated = spans
      .slice()
      .sort((a, b) => a.start - b.start)
      .map((span) => ({
        entryId: entry.id,
        start: span.start,
        end: span.end,
        label: span.label,
        confidence: 1,
        editedByUser: true,
        version: 2
      }));

    await this.store.replaceSpans(entry.id, updated);
    const reflection = this.aiService.analyze(entry.id, entry.rawText).reflection;
    const counts = { thought: 0, emotion: 0, body: 0 };
    updated.forEach((span) => {
      counts[span.label] += Math.max(1, span.end - span.start);
    });
    const total = Math.max(1, counts.thought + counts.emotion + counts.body);
    const patchedReflection: ReflectionCard = {
      ...reflection,
      entryId,
      thoughtRatio: Number((counts.thought / total).toFixed(4)),
      emotionRatio: Number((counts.emotion / total).toFixed(4)),
      bodyRatio: Number((counts.body / total).toFixed(4))
    };
    await this.store.upsertReflection(patchedReflection);
    return updated;
  }

  async getReflection(userId: string, entryId: string): Promise<ReflectionCard> {
    await this.assertOwner(userId, entryId);
    const reflection = await this.store.getReflection(entryId);
    if (!reflection) {
      throw new AppError(404, 40402, '反思卡尚未生成，请先进行分析');
    }
    return reflection;
  }

  private async assertOwner(userId: string, entryId: string): Promise<JournalEntry> {
    const entry = await this.store.getJournal(entryId);
    if (!entry || entry.userId !== userId) {
      throw new AppError(404, 40403, '日记不存在');
    }
    return entry;
  }

  private validateSpans(
    text: string,
    spans: Array<{ start: number; end: number; label: Label }>
  ): void {
    if (spans.length === 0) {
      throw new AppError(422, 42221, '标注结果非法：至少需要一个片段');
    }
    const sorted = spans.slice().sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length; i += 1) {
      const span = sorted[i];
      if (span.start < 0 || span.end > text.length || span.start >= span.end) {
        throw new AppError(422, 42221, '标注结果非法：边界越界或无效');
      }
      if (i > 0) {
        const prev = sorted[i - 1];
        if (span.start < prev.end) {
          throw new AppError(422, 42221, '标注结果非法：区间重叠');
        }
      }
    }
  }
}
