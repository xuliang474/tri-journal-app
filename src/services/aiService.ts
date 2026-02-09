import type { Label, LabeledSpan, ReflectionCard } from '../types';

const BODY_KEYWORDS = [
  '肩膀',
  '头痛',
  '胸口',
  '呼吸',
  '胃',
  '肚子',
  '紧绷',
  '麻木',
  '发麻',
  '心跳',
  '疲惫',
  '睡不着',
  '身体',
  '酸痛'
];
const EMOTION_KEYWORDS = [
  '难过',
  '焦虑',
  '害怕',
  '愤怒',
  '开心',
  '委屈',
  '烦躁',
  '失望',
  '沮丧',
  '紧张',
  '羞愧',
  '情绪',
  '心情'
];
const THOUGHT_KEYWORDS = [
  '我觉得',
  '应该',
  '必须',
  '总是',
  '如果',
  '为什么',
  '计划',
  '担心',
  '想到',
  '脑海',
  '念头',
  '反复'
];

const RISK_KEYWORDS = ['不想活', '自杀', '结束生命', '伤害自己', '活着没意义'];

const REFLECTION_QUESTIONS: Record<Label, string[]> = {
  thought: ['当这个念头出现时，你的情绪会发生什么变化？', '这个想法最希望保护你免受什么影响？'],
  emotion: ['这个情绪最想被你看见的部分是什么？', '当情绪升高时，你愿意给自己哪一句更温和的话？'],
  body: ['身体这个部位的感觉在提醒你什么？', '下次出现同样感觉时，你愿意先停留10秒再行动吗？']
};

interface AnalyzeResult {
  spans: LabeledSpan[];
  reflection: ReflectionCard;
}

export class AiService {
  analyze(entryId: string, rawText: string): AnalyzeResult {
    const spans = this.createSpans(entryId, rawText);
    const reflection = this.buildReflection(entryId, rawText, spans);
    return { spans, reflection };
  }

  private createSpans(entryId: string, text: string): LabeledSpan[] {
    const regex = /[^，。！？；\n]+[，。！？；\n]?/g;
    const spans: LabeledSpan[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const phrase = match[0].trim();
      if (!phrase) {
        continue;
      }
      const start = match.index + (match[0].length - match[0].trimStart().length);
      const end = start + phrase.length;
      const label = this.detectLabel(phrase);
      const confidence = this.confidenceForLabel(phrase, label);
      spans.push({
        entryId,
        start,
        end,
        label,
        confidence,
        editedByUser: false,
        version: 1
      });
    }

    if (spans.length === 0 && text.trim().length > 0) {
      spans.push({
        entryId,
        start: 0,
        end: text.trim().length,
        label: 'thought',
        confidence: 0.55,
        editedByUser: false,
        version: 1
      });
    }

    return spans.sort((a, b) => a.start - b.start);
  }

  private detectLabel(phrase: string): Label {
    if (BODY_KEYWORDS.some((keyword) => phrase.includes(keyword))) {
      return 'body';
    }
    if (EMOTION_KEYWORDS.some((keyword) => phrase.includes(keyword))) {
      return 'emotion';
    }
    if (THOUGHT_KEYWORDS.some((keyword) => phrase.includes(keyword))) {
      return 'thought';
    }
    return 'thought';
  }

  private confidenceForLabel(phrase: string, label: Label): number {
    const dict =
      label === 'body' ? BODY_KEYWORDS : label === 'emotion' ? EMOTION_KEYWORDS : THOUGHT_KEYWORDS;
    const hits = dict.filter((keyword) => phrase.includes(keyword)).length;
    return Math.min(0.95, 0.55 + hits * 0.15);
  }

  private buildReflection(entryId: string, text: string, spans: LabeledSpan[]): ReflectionCard {
    const counts = { thought: 0, emotion: 0, body: 0 };
    spans.forEach((span) => {
      counts[span.label] += Math.max(1, span.end - span.start);
    });
    const total = Math.max(1, counts.thought + counts.emotion + counts.body);
    const thoughtRatio = Number((counts.thought / total).toFixed(4));
    const emotionRatio = Number((counts.emotion / total).toFixed(4));
    const bodyRatio = Number((counts.body / total).toFixed(4));
    const dominant = this.pickDominantLabel(counts);
    const prompts = REFLECTION_QUESTIONS[dominant].slice(0, 2);
    const riskFlags = RISK_KEYWORDS.filter((keyword) => text.includes(keyword));
    const riskLevel = riskFlags.length >= 2 ? 'high' : riskFlags.length === 1 ? 'medium' : 'low';

    return {
      entryId,
      thoughtRatio,
      emotionRatio,
      bodyRatio,
      prompts,
      riskLevel,
      riskFlags
    };
  }

  private pickDominantLabel(counts: Record<Label, number>): Label {
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0][0] as Label;
  }
}
