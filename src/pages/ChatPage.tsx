import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, startTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { SubscriptionTierBadge } from "@/components/layout/SubscriptionTierBadge";
import { TabProfileMenuRow } from "@/components/layout/TabProfileMenuRow";
import { Paywall } from "@/components/subscription/Paywall";
import { FriendlyLimitDialog } from "@/components/subscription/FriendlyLimitDialog";
import { RecipeChatSoftLimitDialog } from "@/components/subscription/RecipeChatSoftLimitDialog";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatEmptyState, EMPTY_STATE_QUICK_SUGGESTIONS } from "@/components/chat/ChatEmptyState";
import { ChatInputBar } from "@/components/chat/ChatInputBar";
import { AssistantAboutSheet } from "@/components/chat/AssistantAboutSheet";
import { FamilyOnboarding } from "@/components/onboarding/FamilyOnboarding";
import { ArticleReaderModal } from "@/components/articles/ArticleReaderModal";
import { useArticle } from "@/hooks/useArticles";
import { useDeepSeekAPI } from "@/hooks/useDeepSeekAPI";
import { useChatHistory } from "@/hooks/useChatHistory";
import { useFamily } from "@/contexts/FamilyContext";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { logEmptyOnboardingReason } from "@/utils/authSessionDebug";
import { useToast } from "@/hooks/use-toast";
import { useChatRecipes } from "@/hooks/useChatRecipes";
import { buildGenerationContext, validateRecipe } from "@/domain/generation";
import type { Profile } from "@/domain/generation";
import { detectMealType, parseRecipesFromChat, parseRecipesFromApiResponse, type ParsedRecipe } from "@/utils/parseChatRecipes";
import { resolveChatRecipeServings } from "@/utils/chatRecipeServings";
import { safeError } from "@/utils/safeLogger";
import { supabase } from "@/integrations/supabase/client";
import { MemberSelectorButton, type MemberSelectorButtonProps } from "@/components/family/MemberSelectorButton";
import { ChatHeaderMenuButton } from "@/components/chat/ChatHeaderMenuButton";
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";
import { getQuickPromptsForMode } from "@/utils/quickPrompts";
import { QuickPromptsSheet } from "@/components/chat/QuickPromptsSheet";
import { formatAllergySummary } from "@/utils/chatHeroUtils";
import { ChatModeHint } from "@/components/chat/ChatModeHint";
import { isFamilySelected } from "@/utils/planModeUtils";
import { getLimitReachedTitle, getLimitReachedMessage } from "@/utils/limitReachedMessages";
import type { LimitReachedFeature } from "@/utils/limitReachedMessages";
import { paywallReasonFromLimitFeature } from "@/utils/paywallReasonCopy";
import { getRewrittenQueryIfFollowUp, deriveDishHint } from "@/utils/blockedFollowUp";
import { getRedirectOrIrrelevantMessage, getRedirectOrIrrelevantMeta, type SystemHintRoute } from "@/utils/chatRouteFallback";
import type { BlockedMeta } from "@/types/chatBlocked";
import { useAppStore } from "@/store/useAppStore";
import { trackUsageEvent } from "@/utils/usageEvents";
import { Button } from "@/components/ui/button";
import { A2HS_EVENT_AFTER_FIRST_RECIPE, A2HS_EVENT_AFTER_TWO_RECIPES } from "@/hooks/usePWAInstall";
import {
  PREMIUM_CHAT_LIMIT_BODY,
  PREMIUM_CHAT_LIMIT_TITLE,
  PREMIUM_HELP_LIMIT_BODY,
  PREMIUM_HELP_LIMIT_TITLE,
} from "@/utils/friendlyLimitCopy";
import { PREMIUM_TRIAL_CHAT_DAILY_LIMIT, PREMIUM_TRIAL_HELP_DAILY_LIMIT } from "@/utils/subscriptionRules";
import { getRemainingRecipesText } from "@/utils/recipePickHintCopy";

const CHAT_HINTS_SEEN_KEY = "chat_hints_seen_v1";
/** Порог (px) от низа скролла: если пользователь в пределах — автоскролл вниз при новых сообщениях. */
const NEAR_BOTTOM_THRESHOLD = 120;

function useChatOpenTrack() {
  const location = useLocation();
  const trackedRef = useRef(false);
  useEffect(() => {
    if (location.pathname !== "/chat" || trackedRef.current) return;
    trackedRef.current = true;
    trackUsageEvent("chat_open");
  }, [location.pathname]);
}

/** Интервал смены ротируемых подсказок во время генерации рецепта (было 5 с, +2 с). */
const RECIPE_GENERATION_PHRASE_INTERVAL_MS = 7000;
/** Сменяющиеся надписи во время генерации рецепта. Нейтрально по возрасту (дети, подростки, взрослые). */
const RECIPE_GENERATION_PHRASES = [
  "Совет шефа: лимонный сок мягко раскрывает вкус рыбы и помогает использовать меньше соли.",
  "Знаете ли вы? Запекание овощей делает их естественно слаще и ароматнее — отличный способ подружить детей с овощами.",
  "Совет: чеснок лучше добавлять в конце жарки — так он сохранит аромат и не станет горчить.",
  "Факт: овсянка помогает дольше сохранять чувство сытости — удобный завтрак для всей семьи.",
  "Совет: соль в тесто добавляйте постепенно и ориентируйтесь на вкус — мука бывает разной.",
  "Забавный факт: куркума не только окрашивает блюдо, но и хорошо сочетается с овощами и рисом.",
  "Совет: мясо маринуйте минимум 30 минут, чтобы оно стало более сочным и ароматным.",
  "Совет: свежие травы добавляйте за 1–2 минуты до конца готовки — так сохраняется яркий аромат.",
  "Факт: брокколи содержит много витамина C — отличный вариант гарнира к ужину.",
  "Совет: промойте рис перед варкой, чтобы зерна не слипались и вкус был чище.",
  "Совет: оливковое масло лучше не перегревать — готовьте на среднем огне.",
  "Факт: шпинат при долгой варке теряет часть витаминов — достаточно пары минут.",
  "Совет: солите курицу снаружи и внутри — так вкус распределяется равномерно.",
  "Совет: варите картофель в кожуре — пюре получается более насыщенным по вкусу.",
  "Факт: имбирь отлично подходит для чая и маринадов, добавляя лёгкую остроту.",
  "Совет: пасту варите на минуту меньше, чем указано на упаковке, — получится аль денте.",
  "Совет: горячий крем‑суп блендерьте осторожно, небольшими порциями, чтобы избежать брызг.",
  "Факт: авокадо созревает быстрее рядом с яблоками — полезный кухонный лайфхак.",
  "Совет: тертый сыр добавляйте в горячее блюдо в конце — он плавится равномерно.",
  "Совет: рубите зелень ножом, а не в блендере — так лучше сохраняется структура и аромат.",
  "Факт: кефир хорошо подходит для мягкого маринования мяса — получается нежный вкус.",
  "Совет: грибы обжаривайте на хорошо разогретой сковороде, чтобы они меньше отдавали жидкость.",
  "Совет: тесто для пиццы, выдержанное в холодильнике около суток, даёт более хрустящую корочку.",
  "Факт: петрушка богата витаминами — добавляйте её в салаты и супы перед подачей.",
  "Совет: лук обжарьте до золотистости — это сделает супы и соусы более ароматными.",
  "Совет: обсушите рыбу бумажным полотенцем перед жаркой — так получится румяная корочка.",
  "Факт: натуральный йогурт может заменить сметану в соусах — получится легче по вкусу.",
  "Совет: слегка посолите капусту перед салатом и дайте постоять — она станет сочнее.",
  "Совет: блины удобно смазывать маслом кисточкой или скалкой — получится тонкий слой без лишнего жира.",
  "Факт: кориандр придаёт блюдам свежий аромат и хорошо подходит к овощам и рыбе.",
  "Совет: свёклу для борща лучше варить целиком, а резать уже после — цвет будет ярче.",
  "Совет: замешивая тесто руками, легче почувствовать его консистенцию и не перебить муку.",
  "Факт: тыква богата бета‑каротином и отлично подходит для супов и запеканок.",
  "Совет: макароны для салата варите до состояния аль денте — они сохранят форму и вкус.",
  "Совет: немного уксуса или лимонного сока добавляйте в конце тушения — аромат получается ярче.",
  "Факт: базилик прекрасно сочетается с томатами — используйте эту пару в салатах и соусах.",
  "Совет: фарш для котлет слегка отбейте — котлеты будут плотнее держать форму.",
  "Совет: овощи в суп добавляйте по степени твёрдости — сначала корнеплоды, затем мягкие.",
  "Факт: кинза придаёт блюдам яркий вкус — хорошо подходит к супам и блюдам с рыбой.",
  "Совет: сыр для запеканки натирайте на мелкой тёрке — он плавится более равномерно.",
  "Совет: мясо для шашлыка режьте поперёк волокон — так оно будет нежнее после жарки.",
  "Факт: острый перец чили добавляет блюдам пикантность — начинайте с небольшого количества.",
  "Совет: яйца для омлета взбивайте вилкой или венчиком, чтобы получить более нежную текстуру.",
  "Совет: супы удобнее досаливать ближе к концу варки — так проще попасть во вкус.",
  "Факт: стеблевой сельдерей низкокалориен и хорошо подходит для перекусов и салатов.",
  "Совет: тесто для печенья охладите 20–30 минут в холодильнике — печенье лучше держит форму.",
  "Совет: рыбу запекайте при 170–180 °C — так она остаётся сочной.",
  "Факт: розмарин прекрасно дополняет картофель и мясо — добавляйте веточку при запекании.",
  "Совет: морковь для супа нарежьте тонкой соломкой — она быстрее приготовится и красиво выглядит.",
  "Знаете ли вы? Черника богата антиоксидантами и отлично подходит для каш и йогуртов.",
  "Совет: мясо для стейка достаньте из холодильника за 20–30 минут до жарки — прожарка будет равномернее.",
  "Попробуйте: слегка поджарить семена кунжута для салата — аромат станет ярче.",
  "Маленький секрет шефа: щепотка соли в сладкой выпечке и десертах подчёркивает вкус.",
  "Факт: краснокочанная капуста лучше сохраняет цвет при быстрой тепловой обработке.",
  "Совет: баклажаны можно слегка посолить перед жаркой и промокнуть — это уменьшит горчинку.",
  "Знаете ли вы? Чеснок хорошо сочетается с мясом, овощами и соусами, добавляя блюдам выразительный вкус.",
  "Совет: зелень добавляйте в блюда в самом конце — так сохранится цвет и аромат.",
  "Факт: мята освежает вкус десертов и напитков и хорошо сочетается с лимоном.",
  "Попробуйте: не размораживать ягоды для смузи — напиток получится более густым и насыщенным.",
  "Совет: хлеб удобнее хранить в бумажном пакете или полотенце — корка дольше остаётся хрустящей.",
  "Знаете ли вы? Сельдерей почти полностью состоит из воды и хорошо подходит для лёгких перекусов.",
  "Совет: запечённые яблоки с корицей — простой домашний десерт без добавленного сахара.",
  "Маленький секрет шефа: немного лимонной цедры в соусе или тесте придаёт яркий аромат.",
  "Факт: тёмный шоколад содержит какао‑компоненты с антиоксидантами и хорошо сочетается с орехами и ягодами.",
  "Совет: орехи перед использованием слегка поджарьте — вкус и аромат станут насыщеннее.",
  "Знаете ли вы? Рис басмати обычно меньше слипается благодаря длинным и тонким зёрнам.",
  "Совет: рыбу удобно мариновать с лимоном и травами — так она получается ароматной и нежной.",
  "Факт: морская капуста — полезный ингредиент для салатов и гарниров, в том числе к рыбе.",
  "Совет: томаты лучше резать очень острым ножом — так меньше теряется сока.",
  "Попробуйте: слегка прогреть специи на сухой сковороде — их аромат заметно усиливается.",
  "Маленький секрет шефа: немного сливочного масла в тёплом соусе делает текстуру более бархатистой.",
  "Совет: салаты удобнее солить после добавления заправки — овощи меньше пускают сок.",
  "Факт: сладкий перец богат витамином C и подходит и в сыром виде, и в запечённом.",
  "Знаете ли вы? Мёд добавляет мягкую сладость в соусы, маринады и напитки.",
  "Совет: ягоды промывайте холодной водой и аккуратно обсушите, чтобы сохранить форму.",
  "Попробуйте: варить супы под крышкой — так сохраняется больше аромата и тепла.",
  "Маленький секрет шефа: немного бальзамического уксуса во фруктовом салате подчёркивает вкус ягод и фруктов.",
  "Совет: свёклу можно натереть на тёрке перед тушением — она приготовится быстрее и сохранит яркий цвет.",
  "Факт: оливки и оливковое масло хорошо дополняют овощные салаты и блюда из рыбы.",
  "Знаете ли вы? Корица отлично подходит к яблокам, тыкве и овсяной каше.",
  "Совет: яйца для выпечки лучше использовать комнатной температуры — тесто поднимается равномернее.",
  "Попробуйте: запекать овощи на гриле или в духовке — появляется лёгкий аромат дыма.",
  "Маленький секрет шефа: щепотка соли в шоколадной глазури подчёркивает шоколадный вкус.",
  "Факт: апельсины и другие цитрусовые хорошо сочетаются с зеленью и орехами в салатах.",
  "Совет: авокадо удобнее резать острым ножом и сразу сбрызнуть лимонным соком, чтобы оно дольше оставалось зелёным.",
  "Знаете ли вы? Лимонный сок помогает сохранить яркий цвет нарезанных фруктов и овощей.",
  "Совет: чеснок, нарезанный ножом, даёт более мягкий вкус, чем пропущенный через пресс.",
  "Факт: шпинат богат витаминами и хорошо подходит и в свежих салатах, и в горячих блюдах.",
  "Попробуйте: добавлять свежий базилик в готовую пасту — аромат раскрывается особенно ярко.",
  "Маленький секрет шефа: немного мёда в маринаде помогает создать аппетитную румяную корочку.",
  "Совет: картофель для пюре варите в подсоленной воде — вкус будет более выраженным.",
  "Факт: семена льна удобно добавлять в каши и йогурты.",
  "Знаете ли вы? Капуста кимчи — популярная ферментированная закуска и источник разнообразных вкусов.",
  "Совет: морковь для запеканки можно натирать на крупной тёрке — получается приятная текстура.",
  "Попробуйте: запекать ягоды с небольшим количеством ванили — выйдет простой ароматный десерт.",
  "Маленький секрет шефа: немного лимонного сока в соусе помогает «освежить» вкус блюда.",
  "Совет: масло для жарки выбирайте с подходящей температурой дымления (например, рафинированное растительное масло).",
  "Факт: яблоки — удобный источник клетчатки и быстрый перекус для детей и взрослых.",
  "Знаете ли вы? Бобовые — хороший источник растительного белка и подходят для супов, рагу и салатов.",
  "Совет: зелёный лук добавляйте в салаты в самом конце — он останется хрустящим.",
  "Попробуйте: обжаривать орехи на сухой сковороде — вкус становится более насыщенным.",
  "Маленький секрет шефа: немного лимонной цедры в тесте для печенья добавляет свежий цитрусовый аромат.",
  "Факт: петрушка содержит витамин C и часто используется для свежей ноты в готовых блюдах.",
  "Совет: ягоды добавляйте в кашу в конце варки или уже в тарелке, чтобы сохранить их форму и вкус.",
  "Знаете ли вы? Горох и фасоль удобно заранее замачивать — так они готовятся быстрее и получаются мягче.",
  "Попробуйте: добавлять немного соевого соуса в супы и рагу для более глубокого вкуса.",
  "Маленький секрет шефа: пару капель бальзамического уксуса в супе могут слегка подчеркнуть аромат овощей.",
  "Совет: хлеб удобно хранить при комнатной температуре, завернув в полотенце.",
  "Знаете ли вы? Лавровый лист придаёт блюдам аромат — добавляйте его в супы и тушёное мясо и убирайте перед подачей.",
  "Совет: овощи нарезайте примерно одинакового размера — так они приготовятся равномерно.",
  "Попробуйте: заранее замачивать сухие грибы — они становятся мягче и ароматнее.",
  "Маленький секрет шефа: немного сливочного масла в картофельном пюре делает его особенно нежным.",
  "Факт: лимонный сок помогает сохранить цвет многих овощей и фруктов при тепловой обработке.",
  "Совет: при жарке рыбы сковорода должна хорошо прогреться — тогда получится золотистая корочка.",
  "Знаете ли вы? Семена тыквы можно поджарить с небольшим количеством соли — получится простой домашний снек.",
  "Попробуйте: добавлять щепотку сахара в томатный соус — это помогает сбалансировать кислоту.",
  "Маленький секрет шефа: немного вина в соусе или тушёных блюдах помогает раскрыть аромат трав и специй.",
  
  // Дополнительные семейные / детские советы
  "Совет для семьи: запекайте овощи сразу на 2–3 ужина — это экономит время в будни.",
  "Идея для детей: запеките овощи и подайте их с йогуртовым соусом — так дети охотнее их съедят.",
  "Совет: если ребёнок не любит кусочки овощей, попробуйте крем‑супы — вкус мягкий, а овощей много.",
  "Идея: добавляйте немного натёртой моркови или тыквы в котлеты — так проще увеличить долю овощей в рационе.",
  "Совет для занятых родителей: готовьте крупу или гарнир сразу на 2 дня — останется только добавить свежие овощи.",
  "Совет: предложите ребёнку самому выбрать овощи для пиццы или запеканки — участие повышает интерес к еде.",
  "Идея: делайте «тарелку дегустации» — несколько разных овощей маленькими порциями, чтобы ребёнок мог пробовать понемногу.",
  "Совет: если дети не любят варёные овощи, попробуйте запекать их с небольшим количеством масла и специй.",
  "Идея для ужина: один противень — овощи, второй — курица или рыба. Всё запекается вместе и экономит время.",
  "Совет: храните нарезанные овощи в контейнере в холодильнике — так проще быстро собрать салат или перекус для ребёнка."
];

/** Задержка (мс) перед показом блока с советами при ожидании ответа. Пока не прошло это время, блок не показываем — быстрые ответы (redirect в Помощник, irrelevant) не сопровождаются советами. */

/** Статичный плейсхолдер чата рецептов, если пользователь отключил ротацию подсказок в профиле. */
const RECIPES_CHAT_PLACEHOLDER_STATIC = "Что приготовить?";

/** Подсказки в placeholder поля ввода чата (режим рецептов). Ротация каждые 2.5 с, останавливается при вводе. Вторичный способ подсказки. */
const CHAT_PLACEHOLDER_SUGGESTIONS = [
  "Блюдо на ужин с витаминами",
  "Что приготовить из курицы?",
  "Быстрый ужин за 15 минут",
  "Рецепт на завтрак с кальцием",
  "Полезный перекус для ребёнка",
  "Омега-3 и железо, ужин",
  "Белковая каша для школьника",
  "Простой десерт с кальцием без сахара",
  "Блюдо с креветками и витамином D за 15 минут",
];

const HELP_CHAT_STORAGE_KEY = "help_chat_messages_v1";

/** После save в chat_history не меняем id сообщений (стабильный React key); для API удаления — UUID строки истории. */
const CHAT_HISTORY_SYNC_SKIP_MS = 15_000;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  /** UUID строки chat_history (пара user+assistant); не подставлять в key, чтобы не было моргания после сохранения. */
  chatHistoryRowId?: string;
  rawContent?: string;
  /** Пока true, ответ ещё стримится; не показываем сырой JSON. */
  isStreaming?: boolean;
  /** Уже распарсенный рецепт (из parseRecipesFromChat), чтобы карточка не показывала «Данные повреждены». */
  preParsedRecipe?: ParsedRecipe | null;
  /** ID рецепта в БД (из createRecipe), для добавления в избранное через favorites_v2.recipe_id */
  recipeId?: string | null;
  /** Ответ «заблокировано» по аллергии/dislikes — показывать как обычный текст, без RecipeCard */
  isBlockedRefusal?: boolean;
  /** Мета для follow-up (то же блюдо с заменой); из Edge или chat_history.meta */
  blockedMeta?: BlockedMeta;
  /** Системная подсказка: редирект в Помощник или нерелевантный запрос — рендерить SystemHintCard */
  systemHintType?: SystemHintRoute;
  topicKey?: string;
  topicTitle?: string;
  topicShortTitle?: string;
}

/** Формат сообщений help-чата в localStorage (timestamp как строка). */
interface HelpMessageStored {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  rawContent?: string;
}

function parseHelpMessagesFromStorage(raw: string | null): Message[] {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is HelpMessageStored => m != null && typeof m === "object" && typeof m.id === "string" && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && typeof m.timestamp === "string")
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
        ...(m.rawContent != null && { rawContent: String(m.rawContent) }),
      }));
  } catch {
    return [];
  }
}


export type ChatMode = "recipes" | "help";

export default function ChatPage() {
  const location = useLocation();
  useChatOpenTrack();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode: ChatMode = (searchParams.get("mode") === "help" ? "help" : "recipes");
  const isConsultationMode = mode === "help";
  const prefillFromQuery = searchParams.get("prefill");
  const { toast } = useToast();
  const { user, loading: authLoading, authReady } = useAuth();
  const { selectedMember, members, selectedMemberId, setSelectedMemberId, isLoading: isLoadingMembers } = useFamily();
  const {
    canGenerate,
    remaining,
    dailyLimit,
    usedToday,
    subscriptionStatus,
    aiDailyLimit,
    hasAccess,
    helpLimitExceeded,
    helpUsed,
    helpDailyLimit,
    refetchUsage,
    setHelpUsedToday,
    showInputHints,
  } = useSubscription();
  const isFree = subscriptionStatus === "free";
  const { chat, saveChat, isChatting } = useDeepSeekAPI();
  const { messages: historyMessages, isLoading: isLoadingHistory, deleteMessage, archiveChat } = useChatHistory(selectedMemberId ?? null);
  const { saveRecipesFromChat } = useChatRecipes();

  const [messages, setMessages] = useState<Message[]>([]);
  /** Истина только после того, как локальный messages синхронизирован с historyMessages (пустой или с историей). Не показываем ChatEmptyState пока false. */
  const [isChatBootstrapped, setIsChatBootstrapped] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  /** Free: лимит подборов рецептов — сначала мягкий экран, полный paywall только по CTA. */
  const [recipeSoftLimitOpen, setRecipeSoftLimitOpen] = useState(false);
  const [friendlyLimitOpen, setFriendlyLimitOpen] = useState(false);
  const [friendlyLimitKind, setFriendlyLimitKind] = useState<"chat" | "help" | null>(null);
  const [showHintsModal, setShowHintsModal] = useState(false);
  const [badgeVisible, setBadgeVisible] = useState(false);
  const [openArticleId, setOpenArticleId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  /** Пользователь близко к низу (<= NEAR_BOTTOM_THRESHOLD) — автоскролл. Обновляется в onScroll. */
  const userNearBottomRef = useRef(true);
  /** Один раз после входа на вкладку: прокрутить ленту к низу после загрузки сообщений. */
  const chatScrollRestoredRef = useRef(false);

  const { article: openArticle, isLoading: isArticleLoading } = useArticle(openArticleId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastAppliedPrefillRef = useRef<string | null>(null);
  const prefillQueryAppliedRef = useRef(false);
  const prevProfileKeyRef = useRef<string>("");
  const prevModeRef = useRef<ChatMode | null>(null);
  /** Last saved recipe title (for anti-duplicate: retry once if model returns the same). */
  const lastSavedRecipeTitleRef = useRef<string | null>(null);
  /** Скролл к рецепту выполняем один раз при появлении карточки; повторный скролл через несколько секунд даёт «уплывание». */
  const lastScrolledRecipeIdRef = useRef<string | null>(null);
  const chatHeroRef = useRef<HTMLDivElement | null>(null);
  /** После установки финального сообщения с рецептом — игнорировать опоздавшие onChunk, чтобы не перезаписать карточку и не вызывать моргание. */
  const streamDoneForMessageIdRef = useRef<string | null>(null);
  /** Сразу после показа рецепта не синхронизировать с историей 5 с, чтобы не перезаписывать messages и не вызывать моргание/перепрыгивание скролла. */
  const skipHistorySyncUntilRef = useRef<number>(0);
  /** Актуальные строки истории из query — чтобы отбрасывать опоздавший ответ supabase после смены треда. */
  const historyMessagesRef = useRef(historyMessages);
  historyMessagesRef.current = historyMessages;
  /** Статус-индикатор при смене профиля: текст на 1.5 сек. */
  const [profileChangeStatus, setProfileChangeStatus] = useState<string | null>(null);
  const profileChangeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Индекс фразы при генерации рецепта (случайная смена каждые 5 с). */
  const [recipeStatusPhraseIndex, setRecipeStatusPhraseIndex] = useState(0);
  /** Страница была перезагружена/закрыта во время незавершённой генерации (sessionStorage). */
  const [wasGenerationInterrupted, setWasGenerationInterrupted] = useState(false);

  useEffect(() => {
    try {
      const flag = sessionStorage.getItem("recipe_generation_in_progress");
      if (flag === "true") {
        setWasGenerationInterrupted(true);
        sessionStorage.removeItem("recipe_generation_in_progress");
      }
    } catch {
      // ignore private mode / quota
    }
  }, []);

  useEffect(() => {
    if (!isChatting || mode !== "recipes") return;
    const len = RECIPE_GENERATION_PHRASES.length;
    setRecipeStatusPhraseIndex(Math.floor(Math.random() * len));
    const id = setInterval(() => {
      setRecipeStatusPhraseIndex((prev) => {
        if (len <= 1) return prev;
        const next = Math.floor(Math.random() * len);
        return next === prev ? (prev + 1) % len : next;
      });
    }, RECIPE_GENERATION_PHRASE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isChatting, mode]);

  // Пустое состояние «создайте ребёнка» — только когда auth готов, user есть, members загружены и список пуст (избегаем ложного empty state на Android при медленном session restore).
  const showChatOnboarding = authReady && !!user && !isLoadingMembers && members.length === 0;
  useEffect(() => {
    if (import.meta.env.DEV && showChatOnboarding) {
      logEmptyOnboardingReason("chat", "members empty", {
        hasUser: !!user,
        isLoadingMembers,
        membersCount: members.length,
      });
    }
  }, [showChatOnboarding, user, isLoadingMembers, members.length]);

  const [hintsSeen, setHintsSeen] = useState(() =>
    typeof localStorage !== "undefined" && !!localStorage.getItem(CHAT_HINTS_SEEN_KEY)
  );
  const markHintsSeen = useCallback(() => {
    try {
      localStorage.setItem(CHAT_HINTS_SEEN_KEY, "1");
      setHintsSeen(true);
    } catch {
      setHintsSeen(true);
    }
  }, []);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showAboutAssistant, setShowAboutAssistant] = useState(false);

  // Ротация подсказок в placeholder (режим рецептов, поле пустое, не идёт генерация)
  useEffect(() => {
    if (!showInputHints || mode !== "recipes" || input.trim() !== "" || isChatting) return;
    const id = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % CHAT_PLACEHOLDER_SUGGESTIONS.length);
    }, 2500);
    return () => clearInterval(id);
  }, [showInputHints, mode, input, isChatting]);

  // Очищаем сообщения при смене профиля или списка членов семьи (только в recipes)
  useEffect(() => {
    if (mode !== "recipes") return;
    const memberIds = members.map((c) => c.id).join(",");
    const key = `${selectedMemberId ?? "family"}|${memberIds}`;
    if (prevProfileKeyRef.current && prevProfileKeyRef.current !== key) {
      if (!isChatting) {
        setMessages([]);
        chatScrollRestoredRef.current = false;
      }
      // Статус-индикатор при смене профиля (1 строка, 1.5 сек)
      const isFamily = selectedMemberId === "family";
      const allergies = isFamily
        ? [...new Set(members.flatMap((m) => m.allergies ?? []))]
        : (selectedMember?.allergies ?? []);
      const profileName = isFamily ? "Семья" : (selectedMember?.name ?? "профиль");
      if (allergies.length > 0) {
        setProfileChangeStatus(`Учёл аллергию: ${allergies[0]}`);
      } else {
        setProfileChangeStatus("Профиль обновлён");
      }
      if (profileChangeTimeoutRef.current) clearTimeout(profileChangeTimeoutRef.current);
      profileChangeTimeoutRef.current = setTimeout(() => {
        setProfileChangeStatus(null);
        profileChangeTimeoutRef.current = null;
      }, 1500);
    }
    prevProfileKeyRef.current = key;
  }, [mode, selectedMemberId, members, selectedMember, isChatting]);

  useEffect(() => {
    return () => {
      if (profileChangeTimeoutRef.current) clearTimeout(profileChangeTimeoutRef.current);
    };
  }, []);

  // При переходе в help — загружаем сообщения из localStorage (recipes state не трогаем при help → recipes)
  useEffect(() => {
    if (mode !== "help") {
      prevModeRef.current = mode;
      return;
    }
    if (prevModeRef.current !== "help") {
      const saved = localStorage.getItem(HELP_CHAT_STORAGE_KEY);
      setMessages(parseHelpMessagesFromStorage(saved));
    }
    prevModeRef.current = mode;
  }, [mode]);

  // Сохранение help-чата в localStorage при каждом изменении messages
  useEffect(() => {
    if (mode !== "help") return;
    const toStore: HelpMessageStored[] = messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : new Date(m.timestamp).toISOString(),
      ...(m.rawContent != null && { rawContent: m.rawContent }),
    }));
    try {
      localStorage.setItem(HELP_CHAT_STORAGE_KEY, JSON.stringify(toStore));
    } catch {
      // ignore quota / private mode
    }
  }, [mode, messages]);

  // Скролл в начало при открытии help-чата (из чипсов или ввода)
  useLayoutEffect(() => {
    if (mode !== "help") return;
    const main = document.querySelector("main.main-scroll-contain");
    main?.scrollTo(0, 0);
    messagesContainerRef.current?.scrollTo(0, 0);
  }, [mode]);

  // При входе на вкладку Чат (recipes): сбросить scroll страницы, чтобы хедер был виден
  useLayoutEffect(() => {
    if (mode !== "recipes") return;
    window.scrollTo(0, 0);
    const main = document.querySelector("main.main-scroll-contain");
    main?.scrollTo(0, 0);
  }, [mode]);

  // После загрузки истории: один раз прокрутить ленту к низу (после layout, без рывка)
  useLayoutEffect(() => {
    if (mode !== "recipes" || messages.length === 0 || chatScrollRestoredRef.current) return;
    chatScrollRestoredRef.current = true;
    const el = messagesContainerRef.current;
    if (!el) return;
    let cancelled = false;
    const id2 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled || !el) return;
        el.scrollTop = el.scrollHeight - el.clientHeight;
        userNearBottomRef.current = true;
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id2);
    };
  }, [mode, messages.length]);

  // Fade-in бейджа консультации при входе в help mode
  useEffect(() => {
    if (mode !== "help") {
      setBadgeVisible(false);
      return;
    }
    setBadgeVisible(false);
    const raf = requestAnimationFrame(() => {
      setBadgeVisible(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  // Prefill из query (?prefill=...) для help — только вставить в input, очистить param
  useEffect(() => {
    if (mode !== "help" || !prefillFromQuery) {
      if (!prefillFromQuery) prefillQueryAppliedRef.current = false;
      return;
    }
    if (prefillQueryAppliedRef.current) return;
    prefillQueryAppliedRef.current = true;
    try {
      setInput(decodeURIComponent(prefillFromQuery));
    } catch {
      setInput(prefillFromQuery);
    }
    setSearchParams((p) => {
      p.delete("prefill");
      return p;
    }, { replace: true });
  }, [mode, prefillFromQuery, setSearchParams]);

  const memberIdForSave = selectedMemberId && selectedMemberId !== "family" ? selectedMemberId : undefined;

  // Когда история пуста и загрузка завершена — помечаем чат как готовый (показываем empty state)
  useEffect(() => {
    if (mode !== "recipes") return;
    if (historyMessages.length === 0 && !isLoadingHistory) setIsChatBootstrapped(true);
  }, [mode, historyMessages.length, isLoadingHistory]);

  // Стабильная подпись истории, чтобы не перезапускать эффект при новом reference массива (useQuery даёт новый [] при загрузке)
  const historySignature = useMemo(
    () => historyMessages.length + "," + historyMessages.map((m: { id?: string }) => m.id ?? "").join(","),
    [historyMessages]
  );

  // В help-режиме историю рецептов не подгружаем — сообщения только в local state
  useEffect(() => {
    if (mode === "help") return;
    if (historyMessages.length === 0) {
      setMessages([]);
      return;
    }
    if (Date.now() < skipHistorySyncUntilRef.current) return;
    setIsChatBootstrapped(false);
    const recipeIds = [...new Set(historyMessages.map((m: { recipe_id?: string | null }) => m.recipe_id).filter(Boolean))] as string[];
    /** Снимок id строк на момент старта эффекта — опоздавший fetch рецептов не должен затирать локальную ленту. */
    const threadIdsAtEffectStart = historyMessages.map((m: { id: string }) => m.id).join("|");
    const isBlockedRefusalResponse = (response: string) => {
      const r = (response ?? "").trim();
      if (!r) return false;
      if (r.includes("⚠️") && r.includes("аллерг") && r.includes("Попробуйте изменить запрос")) {
        return true;
      }
      if (
        r.includes("Внимание: у ") &&
        r.includes("аллерг") &&
        r.includes("Мы не можем предложить рецепт с этим ингредиентом")
      ) {
        return true;
      }
      if (
        (r.includes("Попробуйте изменить запрос") || r.includes("Измените запрос")) &&
        r.includes("выберите другой профиль") &&
        (r.includes("аллерг") || r.includes("не любит"))
      ) {
        return true;
      }
      if (
        r.includes("Измените запрос или выберите другой профиль") &&
        (r.includes("аллерг") || r.includes("не любит"))
      ) {
        return true;
      }
      const hasBlockedPhrase =
        r.includes("Смените профиль или замените аллерген на новый ингредиент") ||
        r.includes("Поэтому рецепт с этим ингредиентом я не предложу");
      return hasBlockedPhrase && (r.includes("аллерг") || r.includes("не любит"));
    };
    /** Ответ редиректа в Помощник или нерелевантный: не парсить как рецепт при загрузке из истории */
    const isRedirectOrIrrelevantResponse = (response: string) => {
      const r = (response ?? "").trim();
      return (
        r.includes("Этот чат помогает подбирать рецепты") ||
        r.includes("Этот вопрос лучше задать во вкладке «Помощник»") ||
        r.includes("не генерируем рецепты автоматически") ||
        r.includes("не создаём рецепты автоматически") ||
        r.includes("Сейчас подбирать рецепты ещё рано")
      );
    };
    const formatWithRecipeMap = (recipeMap: Record<string, ParsedRecipe>) => {
      const formatted: Message[] = [];
      historyMessages.forEach((msg: { id: string; message?: string; response?: string; created_at: string; recipe_id?: string | null; meta?: BlockedMeta | Record<string, unknown> | null }) => {
        formatted.push({
          id: `${msg.id}-user`,
          role: "user",
          content: msg.message ?? "",
          timestamp: new Date(msg.created_at),
          chatHistoryRowId: msg.id,
        });
        if (msg.response) {
          const blockedMetaFromDb = msg.meta && typeof msg.meta === "object" && (msg.meta as { blocked?: boolean }).blocked === true
            ? (msg.meta as BlockedMeta)
            : undefined;
          const isBlocked =
            !msg.recipe_id &&
            (blockedMetaFromDb != null || isBlockedRefusalResponse(msg.response));
          if (isBlocked) {
            formatted.push({
              id: `${msg.id}-assistant`,
              role: "assistant",
              content: msg.response,
              timestamp: new Date(msg.created_at),
              chatHistoryRowId: msg.id,
              rawContent: undefined,
              preParsedRecipe: null,
              recipeId: undefined,
              isBlockedRefusal: true,
              blockedMeta: blockedMetaFromDb,
            });
          } else if (!msg.recipe_id && isRedirectOrIrrelevantResponse(msg.response)) {
            const r = (msg.response ?? "").trim();
            const meta = msg.meta && typeof msg.meta === "object" ? (msg.meta as Record<string, unknown>) : undefined;
            const rawHint = typeof meta?.systemHintType === "string" ? meta.systemHintType : "";
            const systemHintType: SystemHintRoute =
              rawHint === "assistant_topic_redirect" || rawHint === "assistant_irrelevant" || rawHint === "curated_under_12_recipe"
                ? (rawHint as SystemHintRoute)
                : r.includes("не генерируем рецепты автоматически") ||
                  r.includes("не создаём рецепты автоматически") ||
                  r.includes("Сейчас подбирать рецепты ещё рано")
                  ? "curated_under_12_recipe"
                  : r.includes("Этот вопрос лучше задать во вкладке «Помощник»")
                    ? "assistant_topic_redirect"
                    : "assistant_irrelevant";
            const fallbackMeta = getRedirectOrIrrelevantMeta(msg.message ?? "");
            const topicKey = (typeof meta?.topicKey === "string" ? meta.topicKey : undefined) ?? fallbackMeta?.topicKey;
            const topicTitle = (typeof meta?.topicTitle === "string" ? meta.topicTitle : undefined) ?? fallbackMeta?.topicTitle;
            const topicShortTitle = (typeof meta?.topicShortTitle === "string" ? meta.topicShortTitle : undefined) ?? fallbackMeta?.topicShortTitle;
            formatted.push({
              id: `${msg.id}-assistant`,
              role: "assistant",
              content: msg.response,
              timestamp: new Date(msg.created_at),
              chatHistoryRowId: msg.id,
              rawContent: undefined,
              preParsedRecipe: null,
              recipeId: undefined,
              systemHintType,
              topicKey,
              topicTitle,
              topicShortTitle,
            });
          } else {
            const dbRecipe = msg.recipe_id ? recipeMap[msg.recipe_id] : null;
            const { displayText, recipes } = dbRecipe
              ? { displayText: `Вот рецепт: ${dbRecipe.title}`, recipes: [dbRecipe] }
              : parseRecipesFromChat(msg.message ?? "", msg.response);
            formatted.push({
              id: `${msg.id}-assistant`,
              role: "assistant",
              content: displayText,
              timestamp: new Date(msg.created_at),
              chatHistoryRowId: msg.id,
              rawContent: msg.response,
              preParsedRecipe: recipes[0] ?? null,
              recipeId: msg.recipe_id ?? undefined,
            });
          }
        }
      });
      setMessages(formatted);
    };
    const canApplyAsyncRecipeFetch = () => {
      if (Date.now() < skipHistorySyncUntilRef.current) return false;
      const nowKey = historyMessagesRef.current.map((m: { id: string }) => m.id).join("|");
      return nowKey === threadIdsAtEffectStart;
    };
    if (recipeIds.length === 0) {
      formatWithRecipeMap({});
      setIsChatBootstrapped(true);
      return;
    }
    let cancelled = false;
    supabase
      .from("recipes")
      .select("id, title, description, cooking_time_minutes, meal_type, chef_advice, advice, calories, proteins, fats, carbs, nutrition_goals, recipe_ingredients(name, display_text, canonical_amount, canonical_unit), recipe_steps(instruction, step_number)")
      .in("id", recipeIds)
      .then(({ data: rows, error }) => {
        if (cancelled || !canApplyAsyncRecipeFetch()) return;
        const recipeMap: Record<string, ParsedRecipe> = {};
        if (error) {
          formatWithRecipeMap({});
          setIsChatBootstrapped(true);
          return;
        }
        (rows ?? []).forEach((r: {
          id: string;
          title?: string;
          description?: string | null;
          cooking_time_minutes?: number | null;
          meal_type?: string | null;
          chef_advice?: string | null;
          advice?: string | null;
          calories?: number | null;
          proteins?: number | null;
          fats?: number | null;
          carbs?: number | null;
          nutrition_goals?: unknown;
          recipe_ingredients?: Array<{ name: string; display_text?: string | null; canonical_amount?: number | null; canonical_unit?: string | null }>;
          recipe_steps?: Array<{ instruction: string; step_number: number }>;
        }) => {
          const stepsArr = (r.recipe_steps ?? []).sort((a, b) => a.step_number - b.step_number).map((s) => s.instruction);
          const ingredients = (r.recipe_ingredients ?? []).map((ing) => ({
            name: ing.name,
            display_text: ing.display_text ?? ing.name,
            ...(ing.canonical_amount != null && ing.canonical_unit && { canonical_amount: ing.canonical_amount, canonical_unit: ing.canonical_unit as "g" | "ml" }),
          }));
          const goalsFromDb = Array.isArray(r.nutrition_goals)
            ? r.nutrition_goals.filter((g): g is string => typeof g === "string")
            : undefined;
          recipeMap[r.id] = {
            id: r.id,
            title: r.title ?? "",
            description: r.description ?? undefined,
            ingredients,
            steps: stepsArr,
            cookingTime: r.cooking_time_minutes ?? undefined,
            mealType: (r.meal_type as ParsedRecipe["mealType"]) ?? undefined,
            chefAdvice: r.chef_advice ?? undefined,
            advice: r.advice ?? undefined,
            calories: r.calories ?? undefined,
            proteins: r.proteins ?? undefined,
            fats: r.fats ?? undefined,
            carbs: r.carbs ?? undefined,
            ...(goalsFromDb?.length ? { nutrition_goals: goalsFromDb } : {}),
          };
        });
        formatWithRecipeMap(recipeMap);
        setIsChatBootstrapped(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, historySignature]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    userNearBottomRef.current = scrollHeight - scrollTop - clientHeight <= NEAR_BOTTOM_THRESHOLD;
  }, []);

  useEffect(() => {
    if (!userNearBottomRef.current) return;
    const last = messages[messages.length - 1];
    const isRecipeMessage =
      last?.role === "assistant" &&
      last?.preParsedRecipe != null &&
      !last?.isStreaming;
    const scrollEl = messagesContainerRef.current;
    if (isRecipeMessage && last && scrollEl) {
      if (lastScrolledRecipeIdRef.current === last.id) return;
      lastScrolledRecipeIdRef.current = last.id;
      requestAnimationFrame(() => {
        const messageEl = document.querySelector(`[data-message-id="${last.id}"]`) as HTMLElement | null;
        if (!messageEl) return;
        const heroEl = chatHeroRef.current;
        const heroHeight = heroEl ? heroEl.getBoundingClientRect().height : 0;
        const gap = 12;
        const scrollRect = scrollEl.getBoundingClientRect();
        const msgRect = messageEl.getBoundingClientRect();
        const targetTop = scrollEl.scrollTop + (msgRect.top - scrollRect.top) - heroHeight - gap;
        const clamped = Math.max(0, targetTop);
        scrollEl.scrollTo({ top: clamped, behavior: "smooth" });
      });
    } else {
      if (last?.role === "user" || !last) {
        lastScrolledRecipeIdRef.current = null;
      }
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const quickPrompts = useMemo(() => {
    if (mode !== "recipes") return [];
    const isFamily = selectedMemberId === "family" || selectedMemberId == null;
    return getQuickPromptsForMode({
      mode: isFamily ? "family" : "member",
      selectedMember: selectedMember ?? null,
      members: members,
    });
  }, [mode, selectedMemberId, selectedMember, members]);

  const showStarter = messages.length === 0 && (mode === "help" || !isLoadingHistory);
  const hasUserMessage = messages.some((m) => m.role === "user");

  const sendInProgressRef = useRef(false);

  const openPremiumDailyLimitDialog = useCallback(
    (kind: "chat" | "help", usedCount: number, limitCount: number) => {
      setFriendlyLimitKind(kind);
      setFriendlyLimitOpen(true);
      const feature = kind === "chat" ? "chat" : "help_mama";
      trackUsageEvent(kind === "chat" ? "premium_chat_limit_reached" : "premium_help_limit_reached", {
        memberId: selectedMemberId && selectedMemberId !== "family" ? selectedMemberId : null,
        properties: {
          ...(user?.id ? { user_id: user.id } : {}),
          subscription_status: subscriptionStatus,
          feature,
          daily_count: usedCount,
          daily_limit: limitCount,
          entry_point: mode === "help" ? "chat_help_tab" : "chat_recipes_tab",
        },
      });
    },
    [selectedMemberId, subscriptionStatus, user?.id, mode]
  );

  const handleRequestFullPaywallFromRecipeSoftLimit = useCallback(() => {
    useAppStore.getState().setPaywallReason("limit_chat");
    useAppStore.getState().setPaywallCustomMessage(null);
    setShowPaywall(true);
    trackUsageEvent("recipe_soft_limit_open_full_paywall", {
      properties: {
        entry_point: mode === "help" ? "chat_help_tab" : "chat_recipes_tab",
        ...(user?.id ? { user_id: user.id } : {}),
      },
    });
  }, [mode, user?.id]);

  const handleSend = useCallback(async (text?: string) => {
    const toSend = (text ?? input).trim();
    if (!toSend || isChatting || sendInProgressRef.current) return;
    if (messages.every((m) => m.role !== "user")) markHintsSeen();
    sendInProgressRef.current = true;

    if (mode === "help" && helpLimitExceeded) {
      sendInProgressRef.current = false;
      if (hasAccess) {
        openPremiumDailyLimitDialog(
          "help",
          helpUsed,
          helpDailyLimit ?? PREMIUM_TRIAL_HELP_DAILY_LIMIT
        );
      } else {
        useAppStore.getState().setPaywallReason("help_limit");
        useAppStore.getState().setPaywallCustomMessage(
          `${getLimitReachedTitle("help")}\n\n${getLimitReachedMessage("help")}`
        );
        setShowPaywall(true);
      }
      return;
    }

    if (!canGenerate) {
      sendInProgressRef.current = false;
      if (hasAccess) {
        openPremiumDailyLimitDialog(
          "chat",
          usedToday,
          aiDailyLimit ?? PREMIUM_TRIAL_CHAT_DAILY_LIMIT
        );
      } else if (mode === "recipes") {
        setRecipeSoftLimitOpen(true);
      } else {
        /* help-вкладка: прежняя логика limit_chat при исчерпании той же квоты */
        useAppStore.getState().setPaywallReason("limit_chat");
        useAppStore.getState().setPaywallCustomMessage(null);
        setShowPaywall(true);
      }
      return;
    }

    const ADS_ENABLED = import.meta.env.VITE_ENABLE_ADS === "true";
    if (ADS_ENABLED && mode === "recipes" && !hasAccess && usedToday >= 1) {
      const adProvider = (await import("@/services/ads/StubRewardedAdProvider").then((m) => m.getRewardedAdProvider()));
      if (adProvider.isAvailable()) {
        try {
          await adProvider.show();
        } catch {
          sendInProgressRef.current = false;
          return;
        }
      }
    }

    if (mode === "recipes") trackUsageEvent("chat_generate_click");
    setInput("");
    userNearBottomRef.current = true;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: toSend,
      timestamp: new Date(),
    };
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantPlaceholder: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    };
    streamDoneForMessageIdRef.current = null;
    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);

    try {
      const chatMessages = messages.map((m) => ({ role: m.role, content: m.content }));
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      const rewrittenQuery =
        mode === "recipes"
          ? getRewrittenQueryIfFollowUp({
            lastAssistantMeta: lastAssistant?.blockedMeta,
            lastAssistantTimestamp: lastAssistant?.timestamp ?? 0,
            userText: toSend,
          })
          : null;
      chatMessages.push({ role: "user", content: rewrittenQuery ?? toSend });

      if (mode === "help") {
        const response = await chat({
          messages: chatMessages,
          type: "sos_consultant",
          overrideSelectedMemberId: selectedMemberId,
          overrideSelectedMember: selectedMember,
          overrideMembers: members,
        });
        const rawMessage = (response?.message ?? "").trim() || "Не удалось получить ответ.";
        trackUsageEvent("help_answer_received");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: rawMessage, isStreaming: false }
              : m
          )
        );
        sendInProgressRef.current = false;
        return;
      }

      const activeProfileId = selectedMemberId ?? "family";
      const profiles: Profile[] = members.map((m) => ({
        id: m.id,
        role: (m.type === "adult" || m.type === "family" ? "adult" : "child") as "adult" | "child",
        name: m.name,
        allergies: m.allergies ?? [],
        preferences: m.preferences ?? [],
        likes: (m as { likes?: string[] }).likes ?? [],
        dislikes: (m as { dislikes?: string[] }).dislikes ?? [],
      }));
      const plan =
        subscriptionStatus === "premium"
          ? "premium"
          : subscriptionStatus === "trial"
            ? "trial"
            : "free";
      const family = { id: "family" as const, profiles, activeProfileId };
      const generationContext = buildGenerationContext(family, activeProfileId, plan);

      const normalizeTitle = (t: string) => t?.trim().toLowerCase() ?? "";
      const lastSaved = normalizeTitle(lastSavedRecipeTitleRef.current ?? "");
      const FAILED_MESSAGE =
        "Не удалось распознать рецепт. Попробуйте уточнить запрос.";

      // Названия рецептов из текущей сессии чата — чтобы не повторять одно и то же блюдо
      const recentRecipeTitles = messages
        .filter((m) => m.role === "assistant" && m.preParsedRecipe?.title)
        .map((m) => m.preParsedRecipe!.title)
        .slice(-6);
      const varietySuffix =
        recentRecipeTitles.length > 0
          ? ` Не повторяй названия блюд, уже предложенных в этом чате: ${recentRecipeTitles.join(", ")}. Предложи другой рецепт.`
          : "";

      let attempts = 0;
      let response: {
        message?: string;
        recipes?: unknown[];
        recipe_id?: string | null;
        auth_required_to_save?: boolean;
        blocked?: boolean;
        blocked_by?: "allergy" | "dislike";
        profile_name?: string;
        matched?: string[];
        blockedByAllergy?: boolean;
        blockedByDislike?: boolean;
      } | null = null;
      let rawMessage = "";
      let parsed = parseRecipesFromChat(userMessage.content, "");
      let apiRecipes: unknown[] = [];

      try {
        sessionStorage.setItem("recipe_generation_in_progress", "true");
      } catch {
        // ignore private mode
      }

      while (attempts < 2) {
        const isRetry = attempts > 0;
        response = await chat({
          messages: chatMessages,
          type: "chat",
          overrideSelectedMemberId: selectedMemberId,
          overrideSelectedMember: selectedMember,
          overrideMembers: members,
          mealType: detectMealType(userMessage.content) || undefined,
          isRetry,
          extraSystemSuffix:
            (attempts > 0 ? "Previous recipe was duplicated. Generate a DIFFERENT recipe now. " : "") + varietySuffix,
          onChunk:
            attempts === 0
              ? (chunk) => {
                if (streamDoneForMessageIdRef.current === assistantMessageId) return;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: m.content + chunk, isStreaming: true }
                      : m
                  )
                );
              }
              : undefined,
        });
        rawMessage = typeof response?.message === "string" ? response.message : "";
        const isBlocked = response?.blocked === true || !!response?.blockedByAllergy || !!response?.blockedByDislike;
        if (isBlocked && rawMessage) {
          break;
        }
        apiRecipes = Array.isArray(response?.recipes) ? response.recipes : [];
        const apiRouteEarly = (response as { route?: string })?.route;
        /** Edge вернул готовый UX-текст без рецепта — не гонять parseRecipesFromChat (иначе «Рецепт из чата» + пустые шаги → validateRecipe: Invalid recipe format). */
        const isStructuredTextNoRecipe =
          apiRecipes.length === 0 &&
          !!rawMessage &&
          (apiRouteEarly === "under_12_curated_recipe_block" ||
            apiRouteEarly === "under_6_recipe_block" ||
            apiRouteEarly === "infant_recipe_rejected" ||
            apiRouteEarly === "assistant_topic" ||
            apiRouteEarly === "irrelevant");
        parsed = apiRecipes.length > 0
          ? parseRecipesFromApiResponse(apiRecipes as Array<Record<string, unknown>>, rawMessage || "Вот рецепт")
          : isStructuredTextNoRecipe
            ? { recipes: [], displayText: rawMessage }
            : parseRecipesFromChat(userMessage.content, rawMessage);
        const recipe = parsed.recipes[0];

        if (!recipe) {
          break;
        }
        const validation = validateRecipe(recipe, generationContext);
        if (!validation.ok) {
          break;
        }
        if (lastSaved && normalizeTitle(recipe.title) === lastSaved) {
          attempts++;
          continue;
        }
        break;
      }

      const isBlockedResponse = (response?.blocked === true || !!response?.blockedByAllergy || !!response?.blockedByDislike) && !!rawMessage;
      /** Ответ без рецепта (redirect в Помощник или irrelevant): показываем как обычный текст, не парсим как рецепт */
      const isRedirectOrIrrelevantResponse = apiRecipes.length === 0 && !!rawMessage;
      const finalRecipe = isBlockedResponse ? null : (isRedirectOrIrrelevantResponse ? null : parsed.recipes[0]);
      const finalValidation = finalRecipe ? validateRecipe(finalRecipe, generationContext) : { ok: false };
      const hasRecipeFromApi = apiRecipes.length > 0;
      const showRecipe = !!finalRecipe && (finalValidation.ok || hasRecipeFromApi);

      if (isBlockedResponse) {
        const originalQuery = (response as { original_query?: string })?.original_query ?? userMessage.content;
        const blockedItems = (response as { blocked_items?: string[] })?.blocked_items ?? (response as { matched?: string[] })?.matched ?? [];
        const intendedDishHint = (response as { intended_dish_hint?: string })?.intended_dish_hint ?? deriveDishHint(originalQuery, blockedItems);
        const blockedMeta: BlockedMeta = {
          blocked: true,
          original_query: originalQuery,
          blocked_items: blockedItems,
          suggested_alternatives: (response as { suggested_alternatives?: string[] })?.suggested_alternatives ?? [],
          intended_dish_hint: intendedDishHint || undefined,
        };
        streamDoneForMessageIdRef.current = assistantMessageId;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: rawMessage, rawContent: undefined, isStreaming: false, preParsedRecipe: null, isBlockedRefusal: true, blockedMeta }
              : m
          )
        );
        skipHistorySyncUntilRef.current = Date.now() + CHAT_HISTORY_SYNC_SKIP_MS;
        try {
          const historyId = await saveChat({
            message: userMessage.content,
            response: rawMessage,
            recipeId: null,
            childId: selectedMemberId === "family" || !selectedMemberId ? null : selectedMemberId,
            meta: blockedMeta as unknown as Record<string, unknown>,
          });
          if (historyId) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === userMessage.id || m.id === assistantMessageId
                  ? { ...m, chatHistoryRowId: historyId }
                  : m
              )
            );
          }
        } catch (e) {
          safeError("Failed to save blocked refusal to chat history:", e);
        }
      } else if (isRedirectOrIrrelevantResponse) {
        const apiRoute = (response as { route?: string })?.route;
        const apiTopicKey = (response as { topicKey?: string })?.topicKey;
        const apiTopicTitle = (response as { topicTitle?: string })?.topicTitle;
        const apiTopicShortTitle = (response as { topicShortTitle?: string })?.topicShortTitle;
        const fallbackMeta = getRedirectOrIrrelevantMeta(userMessage.content);
        const displayMessage = rawMessage || fallbackMeta?.message || "";
        const systemHintType: SystemHintRoute =
          apiRoute === "assistant_topic" ? "assistant_topic_redirect"
            : apiRoute === "irrelevant" ? "assistant_irrelevant"
              : apiRoute === "under_12_curated_recipe_block" ||
                apiRoute === "under_6_recipe_block" ||
                apiRoute === "infant_recipe_rejected"
                ? "curated_under_12_recipe"
                : fallbackMeta?.route ?? "assistant_irrelevant";
        const topicKey = apiTopicKey ?? fallbackMeta?.topicKey;
        const topicTitle = apiTopicTitle ?? fallbackMeta?.topicTitle;
        const topicShortTitle = apiTopicShortTitle ?? fallbackMeta?.topicShortTitle;
        streamDoneForMessageIdRef.current = assistantMessageId;
        skipHistorySyncUntilRef.current = Date.now() + CHAT_HISTORY_SYNC_SKIP_MS;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                ...m,
                content: displayMessage,
                rawContent: undefined,
                isStreaming: false,
                preParsedRecipe: null,
                systemHintType,
                topicKey,
                topicTitle,
                topicShortTitle,
              }
              : m
          )
        );
        try {
          const historyId = await saveChat({
            message: userMessage.content,
            response: displayMessage,
            recipeId: null,
            childId: selectedMemberId === "family" || !selectedMemberId ? null : selectedMemberId,
            meta: {
              systemHintType,
              ...(systemHintType === "assistant_topic_redirect" && topicKey != null && { topicKey, topicTitle, topicShortTitle }),
            },
          });
          if (historyId) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === userMessage.id || m.id === assistantMessageId
                  ? { ...m, chatHistoryRowId: historyId }
                  : m
              )
            );
          }
        } catch (e) {
          safeError("Failed to save redirect/irrelevant to chat history:", e);
        }
      } else if (import.meta.env.DEV && finalRecipe) {
        const recipeFromApi = apiRecipes[0] as Record<string, unknown> | undefined;
        const chefAdvice = (finalRecipe as { chefAdvice?: string }).chefAdvice;
        console.log("[DEBUG recipe]", {
          messageId: assistantMessageId,
          recipeId: recipeFromApi?.id ?? (finalRecipe as { id?: string }).id,
          recipeIdFromBackend: response?.recipe_id,
          title: (finalRecipe as { title?: string }).title,
          source: recipeFromApi?.source,
          hasChefAdvice: !!(chefAdvice && chefAdvice.trim()),
          chefAdviceLen: chefAdvice?.length ?? 0,
          recipeKeys: Object.keys(finalRecipe),
          fromApi: apiRecipes.length > 0,
        });
      }

      if (!isBlockedResponse && !finalRecipe && !isRedirectOrIrrelevantResponse) {
        const fallbackMessage = getRedirectOrIrrelevantMessage(userMessage.content);
        const fallbackMeta = getRedirectOrIrrelevantMeta(userMessage.content);
        if (fallbackMeta) {
          streamDoneForMessageIdRef.current = assistantMessageId;
          skipHistorySyncUntilRef.current = Date.now() + CHAT_HISTORY_SYNC_SKIP_MS;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                  ...m,
                  content: fallbackMeta.message,
                  rawContent: undefined,
                  isStreaming: false,
                  preParsedRecipe: null,
                  systemHintType: fallbackMeta.route,
                  topicKey: fallbackMeta.topicKey,
                  topicTitle: fallbackMeta.topicTitle,
                  topicShortTitle: fallbackMeta.topicShortTitle,
                }
                : m
            )
          );
          try {
            const historyId = await saveChat({
              message: userMessage.content,
              response: fallbackMeta.message,
              recipeId: null,
              childId: selectedMemberId === "family" || !selectedMemberId ? null : selectedMemberId,
              meta: {
                systemHintType: fallbackMeta.route,
                ...(fallbackMeta.route === "assistant_topic_redirect" && fallbackMeta.topicKey != null && {
                  topicKey: fallbackMeta.topicKey,
                  topicTitle: fallbackMeta.topicTitle,
                  topicShortTitle: fallbackMeta.topicShortTitle,
                }),
              },
            });
            if (historyId) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === userMessage.id || m.id === assistantMessageId
                    ? { ...m, chatHistoryRowId: historyId }
                    : m
                )
              );
            }
          } catch (e) {
            safeError("Failed to save fallback redirect/irrelevant to chat history:", e);
          }
        } else {
          trackUsageEvent("chat_generate_error", { properties: { message: FAILED_MESSAGE } });
          streamDoneForMessageIdRef.current = assistantMessageId;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                  ...m,
                  content: FAILED_MESSAGE,
                  rawContent: rawMessage || undefined,
                  isStreaming: false,
                  preParsedRecipe: null,
                }
                : m
            )
          );
          toast({
            variant: "destructive",
            title: "Не удалось подобрать рецепт",
            description: FAILED_MESSAGE,
          });
        }
      } else if (finalRecipe && !isBlockedResponse) {
        trackUsageEvent("chat_generate_success");
        // Один setMessages с рецептом и recipeId — без второго обновления после тоста «Рецепты сохранены», чтобы не было моргания
        let recipeIdForHistory: string | null = response?.recipe_id ?? null;
        let savedRecipesCount = 0;
        if (recipeIdForHistory) lastSavedRecipeTitleRef.current = finalRecipe?.title ?? null;

        if (finalValidation.ok && !recipeIdForHistory && !response?.auth_required_to_save) {
          const mealType = detectMealType(userMessage.content);
          const servingsResolved = resolveChatRecipeServings({
            targetIsFamily: selectedMemberId === "family" || selectedMemberId == null,
            members: members ?? [],
            mealType,
          });
          const fromJson = parsed.recipes[0]?.servings;
          const servingsBaseForDb =
            typeof fromJson === "number" && Number.isFinite(fromJson) && fromJson >= 1 && fromJson <= 99
              ? Math.round(fromJson)
              : servingsResolved;
          const SAVE_RECIPE_TIMEOUT_MS = 15_000;
          try {
            const { savedRecipes } = await Promise.race([
              saveRecipesFromChat({
                userMessage: userMessage.content,
                aiResponse: rawMessage,
                memberId: memberIdForSave,
                mealType,
                parsedResult: parsed,
                assistantMessageId: assistantMessageId,
                servingsBase: servingsBaseForDb,
                servingsRecommended: servingsBaseForDb,
              }),
              new Promise<{ savedRecipes?: Array<{ id: string; title?: string }> }>((_, reject) =>
                setTimeout(() => reject(new Error("SAVE_TIMEOUT")), SAVE_RECIPE_TIMEOUT_MS)
              ),
            ]);
            if (savedRecipes?.length > 0) {
              lastSavedRecipeTitleRef.current = savedRecipes[0]?.title ?? null;
              recipeIdForHistory = savedRecipes[0]?.id ?? null;
              savedRecipesCount = savedRecipes.length;
              if (import.meta.env.DEV) {
                console.log("[DEBUG recipe id]", recipeIdForHistory, "(from saveRecipesFromChat)");
              }
            }
          } catch (saveErr) {
            if ((saveErr as Error)?.message === "SAVE_TIMEOUT") {
              safeError("saveRecipesFromChat timeout, showing recipe without recipeId", saveErr);
            } else {
              safeError("saveRecipesFromChat failed, showing recipe without recipeId", saveErr);
            }
          }
        } else if (import.meta.env.DEV) {
          console.log("[DEBUG recipe id]", recipeIdForHistory);
        }

        streamDoneForMessageIdRef.current = assistantMessageId;
        skipHistorySyncUntilRef.current = Date.now() + CHAT_HISTORY_SYNC_SKIP_MS;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                ...m,
                content: parsed.displayText,
                rawContent: rawMessage,
                isStreaming: false,
                preParsedRecipe: showRecipe ? (parsed.recipes[0] ?? null) : null,
                ...(recipeIdForHistory && { recipeId: recipeIdForHistory }),
              }
              : m
          )
        );

        if (typeof window !== "undefined") {
          if (localStorage.getItem("a2hs_first_recipe_dispatched") !== "1") {
            localStorage.setItem("a2hs_first_recipe_dispatched", "1");
            window.dispatchEvent(new CustomEvent(A2HS_EVENT_AFTER_FIRST_RECIPE));
          }
          const countKey = "a2hs_recipe_success_count";
          const prev = parseInt(localStorage.getItem(countKey) ?? "0", 10);
          const next = Number.isFinite(prev) ? prev + 1 : 1;
          localStorage.setItem(countKey, String(next));
          if (next >= 2 && localStorage.getItem("a2hs_two_recipes_dispatched") !== "1") {
            localStorage.setItem("a2hs_two_recipes_dispatched", "1");
            window.dispatchEvent(new CustomEvent(A2HS_EVENT_AFTER_TWO_RECIPES));
          }
        }

        try {
          if (response?.auth_required_to_save) {
            toast({
              variant: "default",
              title: "Рецепт готов",
              description: "Войдите в аккаунт, чтобы сохранять рецепты в список.",
            });
          } else if (!finalValidation.ok && hasRecipeFromApi) {
            toast({
              variant: "default",
              title: "Рецепт показан",
              description: "Не сохранён в список: не совпадает с аллергиями или предпочтениями.",
            });
          }
          if (savedRecipesCount > 0) {
            toast({
              title: "Рецепты сохранены",
              description: `${savedRecipesCount} рецепт(ов) добавлено в ваш список`,
            });
          }
          const historyId = await saveChat({
            message: userMessage.content,
            response: rawMessage,
            recipeId: recipeIdForHistory,
            childId: selectedMemberId === "family" || !selectedMemberId ? null : selectedMemberId,
          });
          if (historyId) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === userMessage.id || m.id === assistantMessageId
                  ? { ...m, chatHistoryRowId: historyId }
                  : m
              )
            );
          }
        } catch (e) {
          safeError("Failed to save recipes from chat:", e);
          const historyIdFallback = await saveChat({
            message: userMessage.content,
            response: rawMessage,
            recipeId: response?.recipe_id ?? null,
            childId: selectedMemberId === "family" || !selectedMemberId ? null : selectedMemberId,
          });
          if (historyIdFallback) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === userMessage.id || m.id === assistantMessageId
                  ? { ...m, chatHistoryRowId: historyIdFallback }
                  : m
              )
            );
          }
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id && m.id !== assistantMessageId));
        toast({ title: "Остановлено" });
        return;
      }
      if (err?.message === "PREMIUM_DAILY_LIMIT_REACHED") {
        const payload = (err as { payload?: { feature?: string; limit?: number; used?: number } })?.payload;
        const isHelpFeat = payload?.feature === "help";
        const kind = isHelpFeat ? ("help" as const) : ("chat" as const);
        const lim =
          payload?.limit ??
          (isHelpFeat ? PREMIUM_TRIAL_HELP_DAILY_LIMIT : PREMIUM_TRIAL_CHAT_DAILY_LIMIT);
        const u = payload?.used ?? (isHelpFeat ? helpUsed : usedToday);
        if (isHelpFeat) setHelpUsedToday(u);
        refetchUsage();
        openPremiumDailyLimitDialog(kind, u, lim);
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id && m.id !== assistantMessageId));
        return;
      }
      trackUsageEvent("chat_generate_error", { properties: { message: err?.message ?? "Unknown error" } });
      const limitPayload = (err as { payload?: { feature: string } })?.payload;
      if (err?.message === "LIMIT_REACHED" && limitPayload?.feature) {
        const feat = limitPayload.feature as LimitReachedFeature;
        if (!hasAccess && feat === "chat_recipe") {
          setRecipeSoftLimitOpen(true);
          setMessages((prev) => prev.filter((m) => m.id !== userMessage.id && m.id !== assistantMessageId));
        } else {
          useAppStore.getState().setPaywallReason(paywallReasonFromLimitFeature(feat));
          useAppStore.getState().setPaywallCustomMessage(
            `${getLimitReachedTitle(feat)}\n\n${getLimitReachedMessage(feat)}`
          );
          setShowPaywall(true);
          setMessages((prev) => prev.filter((m) => m.id !== userMessage.id && m.id !== assistantMessageId));
        }
      } else if (err?.message === "usage_limit_exceeded") {
        if (!hasAccess) {
          setRecipeSoftLimitOpen(true);
          setMessages((prev) => prev.filter((m) => m.id !== userMessage.id && m.id !== assistantMessageId));
        } else {
          useAppStore.getState().setPaywallReason("limit_chat");
          useAppStore.getState().setPaywallCustomMessage(
            `${getLimitReachedTitle("chat_recipe")}\n\n${getLimitReachedMessage("chat_recipe")}`
          );
          setShowPaywall(true);
          setMessages((prev) => prev.filter((m) => m.id !== userMessage.id && m.id !== assistantMessageId));
        }
      } else {
        const redirectOrIrrelevant = getRedirectOrIrrelevantMessage(userMessage.content);
        const fallbackText = redirectOrIrrelevant ?? "Не удалось распознать рецепт. Попробуйте уточнить запрос.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: fallbackText, rawContent: undefined, isStreaming: false, preParsedRecipe: null }
              : m
          )
        );
        if (!redirectOrIrrelevant) {
          toast({
            variant: "destructive",
            title: "Ошибка",
            description: "Не удалось получить ответ. Попробуйте снова.",
          });
        }
      }
    } finally {
      try {
        sessionStorage.removeItem("recipe_generation_in_progress");
      } catch {
        // ignore
      }
      sendInProgressRef.current = false;
    }
  }, [
    input,
    isChatting,
    canGenerate,
    hasAccess,
    usedToday,
    helpLimitExceeded,
    helpUsed,
    helpDailyLimit,
    mode,
    messages,
    selectedMemberId,
    selectedMember,
    members,
    memberIdForSave,
    chat,
    saveRecipesFromChat,
    saveChat,
    toast,
    markHintsSeen,
    openPremiumDailyLimitDialog,
    aiDailyLimit,
    setHelpUsedToday,
    refetchUsage,
  ]);

  /**
   * Предзаполнение input из location.state (План → чат, скан продуктов и т.д.).
   * Не требует пустой истории: раньше при messages.length > 0 текст терялся.
   * prefillOnly === true (план) — только вставка; prefillOnly !== true (напр. Scan без флага) — автоотправка через 800 ms.
   */
  useEffect(() => {
    if (mode === "help") return;
    const state = location.state as {
      prefillMessage?: string;
      sourceProducts?: string[];
      prefillOnly?: boolean;
      fromPlanSlot?: boolean;
      plannedDate?: string;
      mealType?: string;
      memberId?: string | null;
    } | null;
    const prefillText = state?.prefillMessage;
    if (!prefillText) {
      lastAppliedPrefillRef.current = null;
      return;
    }
    if (!isChatBootstrapped || isLoadingHistory) return;
    if (lastAppliedPrefillRef.current === prefillText) return;
    lastAppliedPrefillRef.current = prefillText;
    setInput(prefillText);
    const { prefillMessage: _pm, prefillOnly: _po, ...restState } = state ?? {};
    navigate(".", {
      replace: true,
      state: Object.keys(restState).length > 0 ? restState : null,
    });
    if (state.prefillOnly !== true) {
      const timer = setTimeout(() => {
        handleSend(prefillText);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [mode, location.state, isChatBootstrapped, isLoadingHistory, handleSend, navigate]);

  /** UUID из БД (chat_history.id). Локальные id вида "user-173..." / "assistant-173..." не являются UUID. */
  const isChatHistoryId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

  const handleDeleteMessage = async (messageId: string) => {
    const base = messageId.replace(/-user$/, "").replace(/-assistant$/, "");
    const clicked = messages.find((m) => m.id === messageId);
    const rowId: string | null =
      clicked?.chatHistoryRowId ?? (isChatHistoryId(base) ? base : null);

    const removeFromState = () =>
      setMessages((prev) =>
        prev.filter((m) => {
          if (rowId != null) {
            if (m.chatHistoryRowId === rowId) return false;
            const mb = m.id.replace(/-user$/, "").replace(/-assistant$/, "");
            if (isChatHistoryId(mb) && mb === rowId) return false;
            return true;
          }
          return !m.id.startsWith(base);
        })
      );

    if (rowId == null) {
      removeFromState();
      toast({ title: "Сообщение удалено" });
      return;
    }
    try {
      await deleteMessage(rowId);
      removeFromState();
      toast({ title: "Сообщение удалено" });
    } catch {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Не удалось удалить сообщение",
      });
    }
  };

  const handleClearChatConfirm = useCallback(async () => {
    try {
      await archiveChat();
      setMessages([]);
      setShowClearConfirm(false);
      toast({ title: "Чат очищен" });
    } catch {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Не удалось очистить чат",
      });
    }
  }, [archiveChat, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const memberName = selectedMember?.name ?? members[0]?.name ?? null;
  const ageMonths = selectedMember?.age_months ?? members[0]?.age_months ?? null;
  const ageLabel = ageMonths != null ? (ageMonths < 12 ? `${ageMonths} мес` : `${Math.floor(ageMonths / 12)} ${ageMonths % 12 === 0 ? "лет" : "г."}`) : null;

  /** Free: краткая подсказка по лимиту подборов (без «X из Y», см. getRemainingRecipesText). */
  const chatHeaderMeta =
    mode !== "help" && isFree && aiDailyLimit !== null
      ? (
          <p className="text-[11px] leading-snug text-muted-foreground/70">
            {getRemainingRecipesText(remaining ?? 0)}
          </p>
        )
      : undefined;

  /** Для hero: имя профиля (Семья / имя ребёнка). Объявлено до recipesHeaderCenter. */
  const chatProfileName = useMemo(() => {
    if (mode === "help") return "";
    return selectedMemberId === "family" ? "Семья" : (selectedMember?.name ?? "профиль");
  }, [mode, selectedMemberId, selectedMember?.name]);

  /** Строка контекста hero: "Для {profileName} · {allergySummary}". */
  const chatHeroSubtext = useMemo(() => {
    if (mode === "help") return "";
    const isFamily = selectedMemberId === "family";
    const allergies = isFamily
      ? [...new Set(members.flatMap((m) => m.allergies ?? []))]
      : (selectedMember?.allergies ?? []);
    const name = chatProfileName || "профиль";
    const allergySummary = formatAllergySummary(allergies);
    return `Для ${name} · ${allergySummary}`;
  }, [mode, selectedMemberId, selectedMember, members, chatProfileName]);

  /** Строка статуса в hero (без имени — имя только в pill): "Аллергии: ..." или "Без ограничений". */
  const chatHeroStatusLine = useMemo(() => {
    if (mode === "help") return "";
    const isFamily = selectedMemberId === "family";
    const allergies = isFamily
      ? [...new Set(members.flatMap((m) => m.allergies ?? []))]
      : (selectedMember?.allergies ?? []);
    if (allergies.length === 0) return "Без ограничений";
    const first = allergies.slice(0, 2).join(", ");
    const rest = allergies.length > 2 ? ` +${allergies.length - 2}` : "";
    return `Аллергии: ${first}${rest}`;
  }, [mode, selectedMemberId, selectedMember, members]);

  /** Как на Плане прикорма: &lt;12 мес — 👶 + ширина по тексту (без max-w-[100px] / обрезания). */
  const recipesInfantProfileChipProps = useMemo(():
    | Pick<MemberSelectorButtonProps, "leadingEmoji" | "fitLabelWidth">
    | undefined => {
    if (mode !== "recipes") return undefined;
    if (selectedMemberId === "family" || selectedMemberId == null) return undefined;
    const m = selectedMember?.age_months;
    if (m != null && Number.isFinite(m) && m < 12) {
      return { leadingEmoji: "👶", fitLabelWidth: true };
    }
    return undefined;
  }, [mode, selectedMemberId, selectedMember?.age_months]);

  const openSubscriptionFromBadge = useCallback(() => {
    useAppStore.getState().setPaywallReason(null);
    useAppStore.getState().setPaywallCustomMessage(null);
    useAppStore.getState().setShowPaywall(true);
  }, []);

  const chatHeaderTrailing = (
    <>
      <SubscriptionTierBadge subscriptionStatus={subscriptionStatus} onClick={openSubscriptionFromBadge} />
      <ChatHeaderMenuButton
        open={showActionsMenu}
        onOpenChange={setShowActionsMenu}
        onNewChat={() => setShowClearConfirm(true)}
        onAboutAssistant={() => setShowAboutAssistant(true)}
        onWriteUs={() => {
          window.location.href = "mailto:momrecipesai@gmail.com";
        }}
      />
    </>
  );

  return (
    <MobileLayout showNav>
      {/* Только overflow-x-hidden: вертикальный overflow:hidden обрезал нижнюю панель (дисклеймер под инпутом). */}
      <div className="flex flex-col min-h-0 flex-1 container mx-auto max-w-full overflow-x-hidden px-4 chat-page-bg">
        {/* Sticky header в режиме «Помощник»: бейдж + меню — та же сетка, что План / Чат */}
        {mode === "help" && (
          <div className="shrink-0 sticky top-0 z-10 bg-background/95 backdrop-blur-sm pt-2 pb-2">
            <TabProfileMenuRow
              profileSlot={<span className="block min-h-[44px] w-full min-w-0 flex-1" aria-hidden />}
              trailing={chatHeaderTrailing}
            />
          </div>
        )}

        {/* Sticky hero: всегда для режима рецептов (как План / заполненный чат), независимо от пустой истории */}
        {mode === "recipes" && members.length > 0 && (
          <div ref={chatHeroRef} className="shrink-0 sticky top-0 z-10 bg-background/95 backdrop-blur-sm pt-2 pb-2">
            <TabProfileMenuRow
              profileSlot={
                <MemberSelectorButton
                  onProfileChange={() => {
                    if (!isChatting) setMessages([]);
                  }}
                  className="shrink-0"
                  {...(recipesInfantProfileChipProps ?? {})}
                />
              }
              trailing={chatHeaderTrailing}
            />
            {!isFamilySelected(selectedMemberId, members) && (
              <div className="mt-1.5">
                <ChatModeHint mode="member" />
              </div>
            )}
            {chatHeaderMeta != null && (
              <div className="mt-2 pt-0.5">{chatHeaderMeta}</div>
            )}
          </div>
        )}

        {/* Messages: отдельный скролл-контейнер под hero, padding-bottom только под инпут (12px) */}
        <div
          ref={messagesContainerRef}
          onScroll={handleMessagesScroll}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain py-0.5 space-y-3 pb-3"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {/* Статус при смене профиля: 1.5 сек, плавное появление/исчезновение (резерв 20px без сдвига) */}
          {mode === "recipes" && wasGenerationInterrupted && (
            <div
              className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5 text-[13px] leading-snug text-foreground/90"
              role="status"
            >
              <p className="whitespace-pre-wrap">
                ⚠️ Вы покинули страницу во время генерации рецепта.
                {"\n"}
                Результат мог не сохраниться. Попробуйте снова.
              </p>
            </div>
          )}

          {mode === "recipes" && (
            <div className="min-h-[16px] flex items-center pt-0.5">
              <AnimatePresence mode="wait">
                {profileChangeStatus && (
                  <motion.span
                    key={profileChangeStatus}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="block text-[12px] text-muted-foreground truncate w-full"
                  >
                    {profileChangeStatus}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          )}

          {showChatOnboarding && (
            <FamilyOnboarding onComplete={() => { }} />
          )}

          {/* Пока auth готов и грузятся members — нейтральный skeleton, без CTA «создайте ребёнка» (избегаем ложного empty state на Android). */}
          {authReady && !!user && isLoadingMembers && !showChatOnboarding && (
            <div className="flex flex-col gap-3 pt-1" aria-busy="true" aria-label="Загрузка профилей">
              <div className="h-24 w-full max-w-[280px] rounded-2xl bg-muted/50 animate-pulse" />
              <div className="h-16 w-4/5 max-w-[240px] rounded-2xl bg-muted/40 animate-pulse ml-auto" />
            </div>
          )}

          {showStarter && !hasUserMessage && members.length > 0 && mode === "help" && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="flex justify-start"
            >
              <div className="rounded-2xl p-4 bg-card border border-border shadow-soft max-w-[85%]">
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  Задайте вопрос про питание, стул, аллергию, режим или самочувствие ребёнка. Отвечу по шагам и подскажу, когда к врачу.
                </p>
              </div>
            </motion.div>
          )}

          {/* Загрузка/инициализация чата рецептов: нейтральный placeholder, чтобы не было пустого экрана (в т.ч. пока грузятся члены семьи) */}
          {mode === "recipes" && messages.length === 0 && (!isChatBootstrapped || isLoadingHistory) && (members.length > 0 || isLoadingMembers) && (
            <div className="flex flex-col gap-3 pt-1" aria-busy="true" aria-label="Загрузка чата">
              <div className="h-10 w-3/4 max-w-[200px] rounded-2xl bg-muted/60 animate-pulse" />
              <div className="h-16 w-[85%] max-w-[280px] rounded-2xl bg-muted/50 animate-pulse ml-auto" />
              <div className="h-12 w-2/3 max-w-[220px] rounded-2xl bg-muted/60 animate-pulse" />
            </div>
          )}

          {/* Пустое состояние чата рецептов: приветствие и подсказки (показываем после инициализации; при пустой истории не сбрасываем bootstrapped) */}
          {mode === "recipes" && isChatBootstrapped && messages.length === 0 && members.length > 0 && (
            <ChatEmptyState
              suggestions={EMPTY_STATE_QUICK_SUGGESTIONS}
              onSuggestionClick={(text) => {
                setInput(text);
                markHintsSeen();
                textareaRef.current?.focus();
              }}
            />
          )}

          <AnimatePresence>
            {messages.map((m) => (
              <ChatMessage
                key={m.id}
                id={m.id}
                role={m.role}
                content={
                  m.role === "assistant" && m.isStreaming && mode === "recipes" && m.content.trim().startsWith("{")
                    ? RECIPE_GENERATION_PHRASES[recipeStatusPhraseIndex]
                    : m.content
                }
                timestamp={m.timestamp}
                rawContent={mode === "recipes" ? m.rawContent : undefined}
                expectRecipe={mode === "recipes" && m.role === "assistant" && !m.isBlockedRefusal}
                preParsedRecipe={mode === "recipes" && !m.isBlockedRefusal ? m.preParsedRecipe : null}
                recipeId={mode === "recipes" ? m.recipeId : undefined}
                isStreaming={m.isStreaming}
                onDelete={handleDeleteMessage}
                memberId={selectedMember?.id}
                memberName={selectedMember?.name}
                ageMonths={selectedMember?.age_months ?? undefined}
                selectedProfileId={selectedMemberId}
                onOpenArticle={setOpenArticleId}
                forcePlainText={mode === "help"}
                isConsultationMode={isConsultationMode}
                isBlockedRefusal={m.isBlockedRefusal}
                systemHintType={m.systemHintType}
                topicKey={m.topicKey}
                topicTitle={m.topicTitle}
                topicShortTitle={m.topicShortTitle}
                systemHintExtraActions={
                  mode === "recipes" && m.systemHintType === "curated_under_12_recipe" ? (
                    <>
                      <Button type="button" variant="default" size="sm" className="h-8 w-full sm:w-auto" onClick={() => navigate("/meal-plan")}>
                        Открыть план
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="h-8 w-full sm:w-auto" onClick={() => navigate("/sos")}>
                        Помощь маме
                      </Button>
                    </>
                  ) : undefined
                }
                onOpenAssistant={
                  mode === "recipes" && m.systemHintType === "assistant_topic_redirect"
                    ? (topicKey) => navigate("/sos" + (topicKey ? "?scenario=" + encodeURIComponent(topicKey) : ""))
                    : undefined
                }
              />
            ))}
          </AnimatePresence>

          <AnimatePresence>
            {isChatting && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex justify-start"
              >
                <div className="rounded-2xl p-4 bg-card border border-border shadow-soft max-w-[85%] w-full min-w-0">
                  {mode === "help" ? (
                    <p className="text-sm text-foreground leading-relaxed">Думаю…</p>
                  ) : (
                    <>
                      {/* Служебное предупреждение — мельче и muted, в обеих темах через токены shadcn */}
                      <p className="w-full min-w-0 text-[11px] sm:text-xs text-muted-foreground leading-snug text-pretty">
                        {"⏳ Генерация может занять до 30 секунд. Если вы уйдёте со страницы, результат может не\u00A0сохраниться."}
                      </p>
                      {/* Основной контент ожидания — подсказка визуально доминирует */}
                      <p className="text-sm font-medium text-foreground leading-relaxed mt-3 pt-3 border-t border-border/60">
                        {RECIPE_GENERATION_PHRASES[recipeStatusPhraseIndex]}
                      </p>
                    </>
                  )}
                  <div className="flex items-center gap-1.5 mt-2" aria-hidden>
                    <span className="chat-thinking-dot" />
                    <span className="chat-thinking-dot" />
                    <span className="chat-thinking-dot" />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>

        {/* Нижняя панель ввода: тот же composer, что в «Помощь маме»; меню (⋮) — в хедере вкладки. ИИ-дисклеймер — только в «Что умеет помощник» (AssistantAboutSheet). */}
        <ChatInputBar
          ref={textareaRef}
          value={input}
          onChange={setInput}
          onKeyDown={handleKeyDown}
          onSend={() => handleSend()}
          isSending={isChatting}
          mode={mode}
          placeholderIndex={placeholderIndex}
          placeholderSuggestions={showInputHints ? CHAT_PLACEHOLDER_SUGGESTIONS : []}
          placeholder={
            mode === "help"
              ? "Например: Сыпь после творога — что делать?"
              : showInputHints
                ? ""
                : RECIPES_CHAT_PLACEHOLDER_STATIC
          }
        />
      </div>
      <AssistantAboutSheet
        open={showAboutAssistant}
        onOpenChange={setShowAboutAssistant}
      />

      <FriendlyLimitDialog
        open={friendlyLimitOpen}
        onOpenChange={(open) => {
          setFriendlyLimitOpen(open);
          if (!open) setFriendlyLimitKind(null);
        }}
        title={friendlyLimitKind === "help" ? PREMIUM_HELP_LIMIT_TITLE : PREMIUM_CHAT_LIMIT_TITLE}
        description={friendlyLimitKind === "help" ? PREMIUM_HELP_LIMIT_BODY : PREMIUM_CHAT_LIMIT_BODY}
        secondaryLabel="Попробовать завтра"
        paywallTextKey={friendlyLimitKind === "help" ? "friendly_limit_help_paid" : "friendly_limit_chat_paid"}
      />

      <RecipeChatSoftLimitDialog
        open={recipeSoftLimitOpen}
        onOpenChange={setRecipeSoftLimitOpen}
        onRequestFullPaywall={handleRequestFullPaywallFromRecipeSoftLimit}
      />

      <Paywall
        isOpen={showPaywall}
        onClose={() => {
          setShowPaywall(false);
          useAppStore.getState().setPaywallReason(null);
          useAppStore.getState().setPaywallCustomMessage(null);
        }}
      />
      <ArticleReaderModal
        article={openArticle}
        open={!!openArticleId}
        onOpenChange={(open) => !open && setOpenArticleId(null)}
        isLoading={isArticleLoading}
      />
      <QuickPromptsSheet
        open={showHintsModal}
        onOpenChange={setShowHintsModal}
        prompts={quickPrompts}
        onSelect={(phrase) => {
          setInput(phrase);
          setShowHintsModal(false);
          textareaRef.current?.focus();
        }}
      />
      <ConfirmActionModal
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title="Очистить чат?"
        description="Все сообщения будут скрыты. Данные не удаляются."
        confirmText="Очистить"
        cancelText="Отмена"
        onConfirm={handleClearChatConfirm}
      />
    </MobileLayout>
  );
}
