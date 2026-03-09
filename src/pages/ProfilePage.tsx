import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import {
  Plus,
  LogOut,
  ChevronRight,
  Bell,
  HelpCircle,
  FileText,
  Lock,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { getSubscriptionLimits } from "@/utils/subscriptionRules";
import { useAppStore } from "@/store/useAppStore";
import { normalizeAllergyToken } from "@/utils/allergyAliases";
import { ProfileEditSheet } from "@/components/chat/ProfileEditSheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TermsContent } from "@/components/legal/TermsContent";
import { PrivacyContent } from "@/components/legal/PrivacyContent";
import { SubscriptionContent } from "@/components/legal/SubscriptionContent";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { MembersRow } from "@/integrations/supabase/types-v2";
import { ProfileHeaderCard } from "@/components/profile/ProfileHeaderCard";
import { FamilyMemberCard } from "@/components/profile/FamilyMemberCard";
import { startFillDay, setJustCreatedMemberId, getPlanUrlForMember } from "@/services/planFill";
import { Loader2 } from "lucide-react";

const VEGETABLE_EMOJIS = ["🥕", "🥦", "🍅", "🥬", "🌽"];

const DINNER_REMINDER_STORAGE_KEY = "dinner_reminder_enabled";

function getDinnerReminderEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(DINNER_REMINDER_STORAGE_KEY) === "1";
}

function setDinnerReminderEnabled(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  if (enabled) localStorage.setItem(DINNER_REMINDER_STORAGE_KEY, "1");
  else localStorage.removeItem(DINNER_REMINDER_STORAGE_KEY);
}

function memberAvatar(_member: MembersRow, index: number): string {
  return VEGETABLE_EMOJIS[index % VEGETABLE_EMOJIS.length];
}

function formatSubscriptionEndDate(isoDate: string | null): string {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** For subscription panel: "25 марта 2026" → "25 марта 2026 г." */
function formatSubscriptionEndDateWithYear(isoDate: string | null): string {
  const s = formatSubscriptionEndDate(isoDate);
  return s ? `${s} г.` : "";
}

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { members, isLoading, formatAge, primaryMemberId, isFreeLocked } = useFamily();
  const {
    subscriptionStatus,
    hasAccess,
    trialUntil,
    expiresAt,
    cancelSubscription,
    isCancellingSubscription,
  } = useSubscription();
  const subscriptionLimits = getSubscriptionLimits(subscriptionStatus);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const [showMemberSheet, setShowMemberSheet] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [dinnerReminderEnabled, setDinnerReminderEnabledState] = useState(getDinnerReminderEnabled);
  const [showGeneratingScreen, setShowGeneratingScreen] = useState(false);
  const [onboardingMemberId, setOnboardingMemberId] = useState<string | null>(null);
  const [generatingDone, setGeneratingDone] = useState(false);
  const onboardingFirstProfileRef = useRef(false);

  useEffect(() => {
    if (isLoading || members.length > 0) return;
    if (!onboardingFirstProfileRef.current) {
      onboardingFirstProfileRef.current = true;
      setShowMemberSheet(true);
    }
  }, [isLoading, members.length]);

  // После magic link / email confirmation: открыть модалку «Новый профиль», только если профилей нет
  useEffect(() => {
    if (searchParams.get("openCreateProfile") !== "1" || isLoading || members.length > 0) return;
    setShowMemberSheet(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("openCreateProfile");
      return next;
    }, { replace: true });
  }, [searchParams, isLoading, members.length, setSearchParams]);

  const handleDinnerReminderChange = (checked: boolean) => {
    setDinnerReminderEnabledState(checked);
    setDinnerReminderEnabled(checked);
  };

  const handleMemberCreated = (memberId: string) => {
    setShowMemberSheet(false);
    if (onboardingFirstProfileRef.current) {
      onboardingFirstProfileRef.current = false;
      setOnboardingMemberId(memberId);
      setShowGeneratingScreen(true);
    }
  };

  const displayName =
    (user?.user_metadata?.display_name as string)?.trim() ||
    user?.email?.split("@")[0] ||
    "Пользователь";

  const handleOpenNameModal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditName(displayName);
    setShowNameModal(true);
  };

  const handleSaveName = async () => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    setIsSavingName(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { display_name: trimmed },
      });
      if (error) throw error;
      toast({ title: "Имя обновлено", description: trimmed });
      setShowNameModal(false);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: (e as Error).message,
      });
    } finally {
      setIsSavingName(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  const handleAddProfile = () => {
    if (members.length >= subscriptionLimits.maxProfiles) {
      setPaywallCustomMessage("Добавление профилей доступно в Premium.");
      setShowPaywall(true);
      return;
    }
    setShowMemberSheet(true);
  };

  const handleMemberCardClick = (member: MembersRow) => {
    if (isFreeLocked && member.id !== primaryMemberId) {
      setPaywallCustomMessage("Переключение между профилями детей доступно в Premium");
      setShowPaywall(true);
      return;
    }
    navigate(`/profile/child/${member.id}`);
  };

  const handleSubscriptionCta = () => {
    if (subscriptionStatus === "free") {
      setShowPaywall(true);
      return;
    }
    navigate("/subscription/manage");
  };

  const MIN_LOADING_SCREEN_MS = 4000;

  useEffect(() => {
    if (!showGeneratingScreen || !onboardingMemberId) return;
    let cancelled = false;
    const startTime = Date.now();
    (async () => {
      try {
        await startFillDay(onboardingMemberId);
        if (cancelled) return;
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, MIN_LOADING_SCREEN_MS - elapsed);
        if (remaining > 0) {
          await new Promise((r) => setTimeout(r, remaining));
        }
        if (cancelled) return;
        setJustCreatedMemberId(onboardingMemberId);
        setGeneratingDone(true);
        const t = setTimeout(() => {
          navigate(getPlanUrlForMember(onboardingMemberId), { replace: true });
          setShowGeneratingScreen(false);
          setOnboardingMemberId(null);
          setGeneratingDone(false);
        }, 1500);
        return () => clearTimeout(t);
      } catch (e) {
        if (!cancelled) {
          toast({
            variant: "destructive",
            title: "Ошибка",
            description: "Не удалось подобрать меню. Попробуйте снова на странице План.",
          });
          setShowGeneratingScreen(false);
          setOnboardingMemberId(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showGeneratingScreen, onboardingMemberId, navigate, toast]);

  const GENERATION_STEPS = [
    "Определяем возраст ребёнка",
    "Проверяем аллергии",
    "Подбираем подходящие блюда",
    "Собираем план питания",
  ];

  if (isLoading) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="min-h-full bg-[var(--color-bg-main)] overflow-x-hidden">
        <div className="px-4 pt-4 pb-24 max-w-md mx-auto flex flex-col gap-5">
          {/* Hero: аккаунт + подписка в одной карточке */}
          <ProfileHeaderCard
            displayName={displayName}
            status={subscriptionStatus}
            onEditClick={handleOpenNameModal}
            freePlanLine="5 запросов в день · 1 профиль"
            trialUntilFormatted={trialUntil ? formatSubscriptionEndDateWithYear(trialUntil) : null}
            expiresAtFormatted={expiresAt ? formatSubscriptionEndDateWithYear(expiresAt) : null}
            onSubscriptionCta={handleSubscriptionCta}
            onCancelSubscription={hasAccess ? async () => {
              try {
                await cancelSubscription();
                toast({
                  title: "Подписка отменена",
                  description: "Доступ сохранится до конца оплаченного периода.",
                });
              } catch {
                toast({
                  variant: "destructive",
                  title: "Не удалось отменить подписку",
                });
              }
            } : undefined}
            isCancellingSubscription={isCancellingSubscription}
            canCancel={hasAccess}
          />

          {/* Моя семья */}
          <section className="flex flex-col gap-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Моя семья
            </p>
            <p className="text-xs text-muted-foreground -mt-0.5">
              Люди, для которых вы готовите
            </p>
            <div className="flex flex-col gap-2">
              {members.map((member, index) => {
                const isPrimary = member.id === primaryMemberId;
                const isLockedForFree = isFreeLocked && !isPrimary;
                const ageStr = formatAge(member.age_months ?? null);
                const memberRow = member as MembersRow;
                const likesArr = memberRow.likes ?? [];
                const dislikesArr = memberRow.dislikes ?? [];
                const allergiesArr = memberRow.allergies ?? [];
                const hasPreferences = subscriptionStatus === "trial" || subscriptionStatus === "premium";
                const isFree = subscriptionStatus === "free";
                const maxVisible = 4;
                const allChips: { type: "like" | "dislike" | "allergy"; label: string }[] = [
                  ...(hasPreferences ? likesArr.map((l) => ({ type: "like" as const, label: l })) : []),
                  ...(hasPreferences ? dislikesArr.map((d) => ({ type: "dislike" as const, label: d })) : []),
                  ...allergiesArr.map((a) => ({ type: "allergy" as const, label: normalizeAllergyToken(a) })),
                ];
                const visibleChips = allChips.slice(0, maxVisible);
                const overflowCount = allChips.length - maxVisible;
                const handleTeaserClick = (e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPaywallCustomMessage("Предпочтения (любит / не любит) — настройте в Premium.");
                  setShowPaywall(true);
                };
                return (
                  <FamilyMemberCard
                    key={member.id}
                    name={member.name}
                    ageStr={ageStr ?? null}
                    avatarEmoji={memberAvatar(memberRow, index)}
                    visibleChips={visibleChips}
                    overflowCount={overflowCount}
                    isLocked={isLockedForFree}
                    onTeaserClick={handleTeaserClick}
                    isFree={isFree}
                    onClick={() => handleMemberCardClick(memberRow)}
                    index={index}
                  />
                );
              })}
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: members.length * 0.03, duration: 0.15 }}
                className="w-full"
              >
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  onClick={handleAddProfile}
                  disabled={members.length >= subscriptionLimits.maxProfiles}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-muted/30 text-foreground hover:bg-muted/50 h-10 text-sm font-medium transition-colors disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" strokeWidth={2} />
                  Добавить профиль
                </motion.button>
              </motion.div>
            </div>
          </section>

          {/* Утилиты: одна карточка, строки 48–52px, мелкие иконки и шевроны */}
          <section className="flex flex-col gap-2">
            <div className="rounded-2xl border border-border/70 bg-card overflow-hidden shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
              <div className="w-full flex items-center gap-3 px-4 min-h-[50px] border-b border-border/20">
                <Bell className="h-[18px] w-[18px] text-muted-foreground/80 shrink-0" strokeWidth={2} />
                <span className="text-foreground text-sm flex-1">Напоминать про ужин</span>
                <Switch
                  checked={dinnerReminderEnabled}
                  onCheckedChange={handleDinnerReminderChange}
                />
              </div>
              <a
                href="mailto:momrecipesai@gmail.com"
                className="w-full flex items-center gap-3 px-4 min-h-[50px] text-left hover:bg-muted/20 active:bg-muted/30 transition-colors text-sm border-b border-border/20"
              >
                <HelpCircle className="h-[18px] w-[18px] text-muted-foreground/80 shrink-0" strokeWidth={2} />
                <span className="text-foreground">Обратная связь</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 ml-auto shrink-0" strokeWidth={2} />
              </a>
              <button
                type="button"
                onClick={() => setShowLegalModal(true)}
                className="w-full flex items-center gap-3 px-4 min-h-[50px] text-left hover:bg-muted/20 active:bg-muted/30 transition-colors text-sm border-b border-border/20"
              >
                <FileText className="h-[18px] w-[18px] text-muted-foreground/80 shrink-0" strokeWidth={2} />
                <span className="text-foreground">Правовая информация</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 ml-auto shrink-0" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 min-h-[50px] text-left hover:bg-muted/20 active:bg-muted/30 transition-colors text-sm text-destructive"
              >
                <LogOut className="h-[18px] w-[18px] shrink-0 opacity-80" strokeWidth={2} />
                <span>Выйти из аккаунта</span>
              </button>
            </div>
          </section>
        </div>
      </div>

      <Dialog open={showNameModal} onOpenChange={setShowNameModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Изменить имя</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="edit-name">Имя</Label>
            <Input
              id="edit-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Ваше имя"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNameModal(false)}>
              Отмена
            </Button>
            <Button onClick={handleSaveName} disabled={isSavingName || !editName.trim()}>
              {isSavingName ? "Сохранение…" : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLegalModal} onOpenChange={setShowLegalModal}>
        <DialogContent className="sm:max-w-md flex flex-col max-h-[85vh] p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>Правовая информация</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="terms" className="flex flex-col min-h-0 flex-1 flex overflow-hidden">
            <TabsList className="grid w-full grid-cols-3 h-auto flex-wrap gap-1 p-1 mx-6 shrink-0">
              <TabsTrigger value="terms" className="text-xs whitespace-nowrap py-2">
                Соглашение
              </TabsTrigger>
              <TabsTrigger value="privacy" className="text-xs whitespace-nowrap py-2">
                Конфиденциальность
              </TabsTrigger>
              <TabsTrigger value="subscription" className="text-xs whitespace-nowrap py-2">
                Подписка
              </TabsTrigger>
            </TabsList>
            <TabsContent value="terms" className="flex flex-col min-h-0 mt-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
              <div className="relative flex-1 min-h-0 flex flex-col">
                <div
                  className="overflow-y-auto px-6 pb-6 pt-2 flex-1 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_p]:text-sm [&_p]:leading-[1.55] [&_p]:mb-4 [&_p:last-child]:mb-0"
                  style={{ maxHeight: "calc(85vh - 140px)" }}
                >
                  <TermsContent />
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none shrink-0" />
              </div>
            </TabsContent>
            <TabsContent value="privacy" className="flex flex-col min-h-0 mt-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
              <div className="relative flex-1 min-h-0 flex flex-col">
                <div
                  className="overflow-y-auto px-6 pb-6 pt-2 flex-1 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_p]:text-sm [&_p]:leading-[1.55] [&_p]:mb-4 [&_p:last-child]:mb-0"
                  style={{ maxHeight: "calc(85vh - 140px)" }}
                >
                  <PrivacyContent />
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none shrink-0" />
              </div>
            </TabsContent>
            <TabsContent value="subscription" className="flex flex-col min-h-0 mt-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
              <div className="relative flex-1 min-h-0 flex flex-col">
                <div
                  className="overflow-y-auto px-6 pb-6 pt-2 flex-1 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_p]:text-sm [&_p]:leading-[1.55] [&_p]:mb-4 [&_p:last-child]:mb-0"
                  style={{ maxHeight: "calc(85vh - 140px)" }}
                >
                  <SubscriptionContent />
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none shrink-0" />
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <ProfileEditSheet
        open={showMemberSheet}
        onOpenChange={setShowMemberSheet}
        member={null}
        createMode={true}
        onCreated={handleMemberCreated}
        skipFillAndRedirectWhenCreated={members.length === 0}
      />

      {showGeneratingScreen && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-6"
          aria-live="polite"
        >
          <div className="text-center max-w-sm">
            {generatingDone ? (
              <p className="text-2xl font-semibold text-foreground">Готово!</p>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-foreground mb-6">
                  Собираем меню для вашего ребёнка
                </h2>
                <ul className="space-y-3 text-left mb-6">
                  {GENERATION_STEPS.map((step, i) => (
                    <li key={step} className="flex items-center gap-2 text-sm text-foreground">
                      <span className="text-primary shrink-0">✓</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Многие родители делятся такими меню с друзьями
                </p>
                <div className="mt-8 flex justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </MobileLayout>
  );
}
