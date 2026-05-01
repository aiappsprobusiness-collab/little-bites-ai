import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import {
  Plus,
  LogOut,
  ChevronRight,
  HelpCircle,
  FileText,
  Download,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { getSubscriptionLimits } from "@/utils/subscriptionRules";
import { useAppStore } from "@/store/useAppStore";
import { FriendlyLimitDialog } from "@/components/subscription/FriendlyLimitDialog";
import { PREMIUM_PROFILES_MAX_BODY, PREMIUM_PROFILES_MAX_TITLE } from "@/utils/friendlyLimitCopy";
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
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { isStandalone } from "@/utils/standalone";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

const VEGETABLE_EMOJIS = ["🥕", "🥦", "🍅", "🥬", "🌽"];

function memberAvatar(_member: MembersRow, index: number): string {
  return VEGETABLE_EMOJIS[index % VEGETABLE_EMOJIS.length];
}

/** Дата окончания подписки/пробного периода (ru-RU уже включает «г.» в конце). */
function formatSubscriptionEndDate(isoDate: string | null): string {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function ProfilePage() {
  const { user, signOut, authReady } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { members, isLoading, formatAge, primaryMemberId, isFreeLocked } = useFamily();
  const {
    subscriptionStatus,
    hasAccess,
    trialUntil,
    expiresAt,
    showInputHints,
    setShowInputHints,
    isUpdatingShowInputHints,
    themePreference,
    setThemePreference,
    isUpdatingThemePreference,
  } = useSubscription();
  const { theme: uiTheme, setTheme: setUiTheme, resolvedTheme } = useTheme();
  const subscriptionLimits = getSubscriptionLimits(subscriptionStatus);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const setPaywallReason = useAppStore((s) => s.setPaywallReason);
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const [showMemberSheet, setShowMemberSheet] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [showIosInstallDialog, setShowIosInstallDialog] = useState(false);
  const [showManualInstallDialog, setShowManualInstallDialog] = useState(false);
  const [showProfileCapDialog, setShowProfileCapDialog] = useState(false);
  const onboardingFirstProfileRef = useRef(false);
  /** После успешного создания профиля blocking автооткрытие шторки, пока FamilyContext не покажет нового члена (members ещё может быть []). Иначе эффект снова делает setShowMemberSheet(true). */
  const suppressEmptyFamilyAutoOpenRef = useRef(false);
  const [welcomeAfterEmail, setWelcomeAfterEmail] = useState(false);
  const { canInstall, promptInstall, isInstalled, isIOSDevice } = usePWAInstall();
  const showAppSection = !isInstalled && !isStandalone();

  /** Сбрасываем suppress только при переходе «были члены → стало 0» (удалили всех), чтобы снова можно было автооткрыть шторку. Не сбрасываем при members>0 — иначе гонка с refetch оставляет members===0 и suppress уже false. */
  const prevMembersLenRef = useRef(members.length);
  useEffect(() => {
    const prev = prevMembersLenRef.current;
    if (prev > 0 && members.length === 0) {
      suppressEmptyFamilyAutoOpenRef.current = false;
    }
    prevMembersLenRef.current = members.length;
  }, [members.length]);

  useEffect(() => {
    if (!authReady || isLoading || members.length > 0) return;
    if (suppressEmptyFamilyAutoOpenRef.current) return;
    if (!onboardingFirstProfileRef.current) {
      onboardingFirstProfileRef.current = true;
      setShowMemberSheet(true);
    }
  }, [authReady, isLoading, members.length]);

  // После magic link / email confirmation: открыть модалку «Новый профиль», только если профилей нет
  useEffect(() => {
    if (searchParams.get("openCreateProfile") !== "1" || !authReady || isLoading) return;
    const lim = getSubscriptionLimits(subscriptionStatus).maxProfiles;
    if (members.length >= lim) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("openCreateProfile");
        next.delete("welcome");
        return next;
      }, { replace: true });
      if (hasAccess) setShowProfileCapDialog(true);
      else {
        setPaywallReason("add_child_limit");
        setPaywallCustomMessage(null);
        setShowPaywall(true);
      }
      return;
    }
    if (members.length > 0) return;
    if (searchParams.get("welcome") === "1") {
      setWelcomeAfterEmail(true);
    }
    setShowMemberSheet(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("openCreateProfile");
      next.delete("welcome");
      return next;
    }, { replace: true });
  }, [searchParams, authReady, isLoading, members.length, setSearchParams, subscriptionStatus, hasAccess, setPaywallReason, setPaywallCustomMessage, setShowPaywall]);

  const handleMemberCreated = (
    memberId: string,
    meta?: { wasEmptyFamilyOnboarding?: boolean },
  ) => {
    suppressEmptyFamilyAutoOpenRef.current = true;
    setShowMemberSheet(false);

    const emptyFamilyOnboarding = !!meta?.wasEmptyFamilyOnboarding;
    if (emptyFamilyOnboarding) {
      onboardingFirstProfileRef.current = false;
      setJustCreatedMemberId(memberId);
      navigate(getPlanUrlForMember(memberId), { replace: true });
      void startFillDay(memberId).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "LIMIT_REACHED") {
          toast({
            variant: "destructive",
            title: "Лимит",
            description: "Сегодняшний лимит подбора исчерпан. Попробуйте завтра или оформите полный доступ.",
          });
          return;
        }
        toast({
          variant: "destructive",
          title: "Ошибка",
          description: "Не удалось подобрать меню. Попробуйте снова на странице План.",
        });
      });
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
    try {
      await signOut();
    } catch (_e) {
      // Локальная сессия уже очищена в signOut; редирект выполняем в любом случае.
    }
    navigate("/auth", { replace: true });
  };

  const handleAddProfile = () => {
    if (members.length >= subscriptionLimits.maxProfiles) {
      if (hasAccess) {
        setShowProfileCapDialog(true);
        return;
      }
      setPaywallReason("add_child_limit");
      setPaywallCustomMessage(null);
      setShowPaywall(true);
      return;
    }
    setShowMemberSheet(true);
  };

  const handleMemberCardClick = (member: MembersRow) => {
    if (isFreeLocked && member.id !== primaryMemberId) {
      setPaywallReason("switch_child");
      setPaywallCustomMessage(null);
      setShowPaywall(true);
      return;
    }
    navigate(`/profile/child/${member.id}`);
  };

  const handleSubscriptionCta = () => {
    if (subscriptionStatus === "free") {
      setPaywallReason("fallback");
      setPaywallCustomMessage(null);
      setShowPaywall(true);
      return;
    }
    navigate("/subscription/manage");
  };

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
      <div className="min-h-full bg-app-bg overflow-x-hidden">
        <div className="px-4 pt-4 pb-24 max-w-md mx-auto flex flex-col gap-5">
          {/* Hero: аккаунт + подписка в одной карточке */}
          <ProfileHeaderCard
            displayName={displayName}
            status={subscriptionStatus}
            accountEmail={user?.email ?? undefined}
            onEditClick={handleOpenNameModal}
            trialUntilFormatted={trialUntil ? formatSubscriptionEndDate(trialUntil) : null}
            expiresAtFormatted={expiresAt ? formatSubscriptionEndDate(expiresAt) : null}
            onSubscriptionCta={handleSubscriptionCta}
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
                const allergyLabels =
                  (memberRow.allergy_items ?? []).length > 0
                    ? (memberRow.allergy_items ?? []).map((i) => i.value)
                    : (memberRow.allergies ?? []);
                const hasPreferences = subscriptionStatus === "trial" || subscriptionStatus === "premium";
                const isFree = subscriptionStatus === "free";
                const maxVisible = 4;
                const allChips: { type: "like" | "dislike" | "allergy"; label: string }[] = [
                  ...allergyLabels.map((a) => ({ type: "allergy" as const, label: normalizeAllergyToken(a) })),
                  ...(hasPreferences ? likesArr.map((l) => ({ type: "like" as const, label: l })) : []),
                  ...(hasPreferences ? dislikesArr.map((d) => ({ type: "dislike" as const, label: d })) : []),
                ];
                const visibleChips = allChips.slice(0, maxVisible);
                const overflowCount = allChips.length - maxVisible;
                const handleTeaserClick = (e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPaywallReason("preferences_locked");
                  setPaywallCustomMessage(null);
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
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-muted/30 text-foreground hover:bg-muted/50 h-10 text-sm font-medium transition-colors"
                >
                  <Plus className="h-4 w-4" strokeWidth={2} />
                  Добавить профиль
                </motion.button>
              </motion.div>
            </div>
          </section>

          {/* Приложение: установка PWA (не показываем в standalone и если уже установлено) */}
          {showAppSection && (
            <section className="flex flex-col gap-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Приложение
              </p>
              <div className="rounded-2xl border border-border/70 bg-card overflow-hidden shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
                <button
                  type="button"
                  onClick={() => {
                    if (canInstall) {
                      promptInstall();
                    } else if (isIOSDevice) {
                      setShowIosInstallDialog(true);
                    } else {
                      setShowManualInstallDialog(true);
                    }
                  }}
                  className="w-full flex items-center gap-3 px-4 min-h-[50px] text-left hover:bg-muted/20 active:bg-muted/30 transition-colors text-sm"
                >
                  <Download className="h-[18px] w-[18px] text-muted-foreground/80 shrink-0" strokeWidth={2} />
                  <span className="text-foreground">Установить приложение</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50 ml-auto shrink-0" strokeWidth={2} />
                </button>
              </div>
            </section>
          )}

          {user && (
            <section className="flex flex-col gap-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Настройки
              </p>
              <div className="rounded-2xl border border-border/70 bg-card overflow-hidden shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
                <div className="px-4 py-3 border-b border-border/20">
                  <p className="text-sm text-foreground leading-snug">Тема</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Активная тема: {resolvedTheme === "dark" ? "тёмная" : "светлая"}
                  </p>
                  <div className="flex gap-2 mt-3">
                    {(
                      [
                        { id: "light" as const, label: "Светлая" },
                        { id: "dark" as const, label: "Тёмная" },
                      ] as const
                    ).map(({ id, label }) => {
                      const active = (uiTheme ?? themePreference ?? "light") === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          disabled={isUpdatingThemePreference}
                          onClick={() => {
                            setUiTheme(id);
                            void setThemePreference(id).catch((e) => {
                              toast({
                                variant: "destructive",
                                title: "Не удалось сохранить тему",
                                description: (e as Error).message,
                              });
                            });
                          }}
                          className={cn(
                            "flex-1 min-h-10 rounded-xl text-xs font-semibold transition-colors border",
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted/30 text-foreground border-border/60 hover:bg-muted/50",
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 min-h-[50px] py-2">
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-sm text-foreground leading-snug">
                      Показывать подсказки в поле ввода
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Ротация идей в чате рецептов; выкл. — короткий текст-подсказка
                    </p>
                  </div>
                  <Switch
                    checked={showInputHints}
                    disabled={isUpdatingShowInputHints}
                    onCheckedChange={(checked) => {
                      void setShowInputHints(checked).catch((e) => {
                        toast({
                          variant: "destructive",
                          title: "Не удалось сохранить",
                          description: (e as Error).message,
                        });
                      });
                    }}
                    aria-label="Показывать подсказки в поле ввода чата рецептов"
                  />
                </div>
              </div>
            </section>
          )}

          {/* Утилиты: одна карточка, строки 48–52px, мелкие иконки и шевроны */}
          <section className="flex flex-col gap-2">
            <div className="rounded-2xl border border-border/70 bg-card overflow-hidden shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
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

      <Dialog open={showIosInstallDialog} onOpenChange={setShowIosInstallDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Установить приложение</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground whitespace-pre-line py-1">
            Поделиться → На экран Домой
          </div>
          <div className="text-sm text-muted-foreground">
            В Safari нажмите кнопку «Поделиться» (квадрат со стрелкой вверх), затем выберите «На экран Домой».
          </div>
          <DialogFooter>
            <Button onClick={() => setShowIosInstallDialog(false)}>Понятно</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showManualInstallDialog} onOpenChange={setShowManualInstallDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Установить приложение</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Откройте меню браузера (три точки или три полоски) и выберите:</p>
            <p className="font-medium text-foreground">«Установить приложение» или «Добавить на главный экран»</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowManualInstallDialog(false)}>Понятно</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLegalModal} onOpenChange={setShowLegalModal}>
        <DialogContent className="flex h-[min(85vh,calc(100vh-2rem))] w-[min(100vw-2rem,42rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
          <DialogHeader className="shrink-0 space-y-1 px-5 pb-3 pt-5 text-center sm:text-center">
            <DialogTitle className="text-xl font-bold leading-snug tracking-tight sm:text-2xl">
              Правовая информация
            </DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="terms" className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 px-4 pb-2">
              <TabsList className="mx-auto grid h-auto w-full max-w-md grid-cols-3 gap-1 p-1.5">
                <TabsTrigger value="terms" className="px-2 py-2 text-xs sm:text-sm">
                  Соглашение
                </TabsTrigger>
                <TabsTrigger value="privacy" className="px-2 py-2 text-xs sm:text-sm">
                  Конфиденциальность
                </TabsTrigger>
                <TabsTrigger value="subscription" className="px-2 py-2 text-xs sm:text-sm">
                  Подписка
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent
              value="terms"
              className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden focus-visible:ring-0 data-[state=inactive]:hidden"
            >
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-1">
                <TermsContent />
              </div>
            </TabsContent>
            <TabsContent
              value="privacy"
              className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden focus-visible:ring-0 data-[state=inactive]:hidden"
            >
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-1">
                <PrivacyContent />
              </div>
            </TabsContent>
            <TabsContent
              value="subscription"
              className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden focus-visible:ring-0 data-[state=inactive]:hidden"
            >
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-1">
                <SubscriptionContent />
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <ProfileEditSheet
        open={showMemberSheet}
        onOpenChange={(open) => {
          setShowMemberSheet(open);
          if (!open) setWelcomeAfterEmail(false);
        }}
        member={null}
        createMode={true}
        onCreated={handleMemberCreated}
        skipFillAndRedirectWhenCreated={members.length === 0}
        welcomeAfterEmailConfirm={welcomeAfterEmail}
      />

      <FriendlyLimitDialog
        open={showProfileCapDialog}
        onOpenChange={setShowProfileCapDialog}
        title={PREMIUM_PROFILES_MAX_TITLE}
        description={PREMIUM_PROFILES_MAX_BODY}
        paywallTextKey="friendly_limit_profiles_max"
      />
    </MobileLayout>
  );
}
