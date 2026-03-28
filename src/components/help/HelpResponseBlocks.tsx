import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Pin, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { HelpDoctorReminderLine } from "@/components/help/HelpDoctorReminderLine";
import { shouldShowHelpDoctorReminder, stripHelpDoctorSection } from "@/utils/stripHelpDoctorSection";

type IconComponent = React.ComponentType<{ className?: string }>;

/** Заголовки блоков в ответе Помощника (с эмодзи, ## или ** или просто текст). */
const BLOCK_PATTERNS: { pattern: RegExp; icon: IconComponent; label: string }[] = [
  { pattern: /^(?:\s*[#*]*\s*[📌]*\s*)?Коротко\s*[*#]*\s*$/im, icon: Pin, label: "Коротко" },
  { pattern: /^(?:\s*[#*]*\s*[✅]*\s*)?Что можно сделать прямо сейчас\s*[*#]*\s*$/im, icon: CheckCircle2, label: "Что можно сделать прямо сейчас" },
];

interface ParsedBlock {
  type: "block";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  content: string;
}

interface ParsedContent {
  type: "plain";
  content: string;
}

function parseAssistantContent(content: string): (ParsedBlock | ParsedContent)[] {
  const result: (ParsedBlock | ParsedContent)[] = [];
  const safeContent = typeof content === "string" ? content : "";
  const lines = safeContent.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    let matched: (typeof BLOCK_PATTERNS)[0] | null = null;
    for (const block of BLOCK_PATTERNS) {
      if (block.pattern.test(line.trim())) {
        matched = block;
        break;
      }
    }
    if (matched) {
      const blockLines: string[] = [];
      i += 1;
      while (i < lines.length) {
        const next = lines[i];
        const isNextHeader = BLOCK_PATTERNS.some((b) => b.pattern.test(next.trim()));
        if (isNextHeader) break;
        blockLines.push(next);
        i += 1;
      }
      const blockContent = blockLines.join("\n").trim();
      result.push({ type: "block", icon: matched.icon, label: matched.label, content: blockContent });
      continue;
    }
    const plainLines: string[] = [];
    while (i < lines.length) {
      const next = lines[i];
      const isHeader = BLOCK_PATTERNS.some((b) => b.pattern.test(next.trim()));
      if (isHeader) break;
      plainLines.push(next);
      i += 1;
    }
    const plainContent = plainLines.join("\n").trim();
    if (plainContent) result.push({ type: "plain", content: plainContent });
  }

  if (result.length === 0 && safeContent.trim()) result.push({ type: "plain", content: safeContent.trim() });
  return result;
}

export function HelpResponseBlocks({
  content,
  className,
  messageId,
}: {
  content?: string | null;
  className?: string;
  /** Если задан — мягкая строка про врача показывается у ~половины сообщений (хеш id). */
  messageId?: string;
}) {
  const safeContent = stripHelpDoctorSection(content ?? "");
  const parts = parseAssistantContent(safeContent);
  const hasBlocks = parts.some((p) => p.type === "block");

  const showReminder =
    Boolean(messageId) && shouldShowHelpDoctorReminder(messageId!);

  if (!hasBlocks) {
    return (
      <div className={cn("space-y-0 text-sm leading-[1.6]", className)}>
        <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 [&>*]:text-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{safeContent}</ReactMarkdown>
        </div>
        {showReminder ? <HelpDoctorReminderLine /> : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3 text-sm leading-[1.6]", className)}>
      {parts.map((part, idx) => {
        if (part.type === "plain") {
          if (!part.content) return null;
          return (
            <div key={idx} className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 [&>*]:text-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.content}</ReactMarkdown>
            </div>
          );
        }
        const Icon = part.icon;
        return (
          <div
            key={idx}
            className="rounded-xl border border-border bg-muted/40 p-3 pl-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4 text-primary shrink-0" aria-hidden />
              <span className="font-semibold text-foreground text-[13px]">{part.label}</span>
            </div>
            <div className="prose prose-sm max-w-none prose-p:my-0.5 prose-ul:my-0.5 prose-li:my-0 [&>*]:text-foreground text-[13px] pl-6">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.content || "—"}</ReactMarkdown>
            </div>
          </div>
        );
      })}
      {showReminder ? <HelpDoctorReminderLine /> : null}
    </div>
  );
}
