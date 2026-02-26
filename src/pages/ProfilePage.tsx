import { useState } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import {
  Plus,
  LogOut,
  ChevronRight,
  Pencil,
  Bell,
  HelpCircle,
  FileText,
  Lock,
  CreditCard,
  Crown,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { getSubscriptionLimits } from "@/utils/subscriptionRules";
import { useAppStore } from "@/store/useAppStore";
import { ProfileEditSheet } from "@/components/chat/ProfileEditSheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { MembersRow } from "@/integrations/supabase/types-v2";

const VEGETABLE_EMOJIS = ["🥕", "🥦", "🍅", "🥬", "🌽"];

function memberAvatar(_member: MembersRow, index: number): string {
  return VEGETABLE_EMOJIS[index % VEGETABLE_EMOJIS.length];
}

const STATUS_LABEL: Record<string, string> = {
  free: "Free",
  trial: "Trial",
  premium: "Premium",
};

const MEMBER_TYPE_LABEL: Record<string, string> = {
  child: "Ребёнок",
  adult: "Взрослый",
  family: "Семья",
};

const FREE_PLAN_DESCRIPTION = "1 профиль · 5 запросов в день";

function formatSubscriptionEndDate(isoDate: string | null): string {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Бейдж статуса: rounded-full, 12–14px. free — серый, trial — оливковый, premium — насыщенный оливковый + иконка короны. */
function PlanBadge({ status }: { status: string }) {
  const isPremium = status === "premium";
  const isTrial = status === "trial";
  const isFree = status === "free";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        isFree && "bg-muted text-muted-foreground",
        isTrial && "bg-primary/15 text-primary border border-primary/30",
        isPremium && "bg-primary text-primary-foreground"
      )}
    >
      {STATUS_LABEL[status] ?? "Free"}
      {isPremium && <Crown className="h-3.5 w-3.5" aria-hidden />}
    </span>
  );
}

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
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
  const [editName, setEditName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

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

  if (isLoading) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </MobileLayout>
    );
  }

  const cardClass =
    "rounded-2xl border border-border bg-card p-4 transition-colors active:opacity-95";

  return (
    <MobileLayout>
      <div className="min-h-full bg-[var(--color-bg-main)]">
        <div className="px-4 pt-4 pb-24 space-y-6 max-w-md mx-auto">
          {/* Верхний блок пользователя: вся карточка кликабельна, без email, бейдж статуса */}
          <section>
            <button
              type="button"
              onClick={handleOpenNameModal}
              className={cn(
                cardClass,
                "w-full text-left flex items-center gap-4 hover:bg-muted/30"
              )}
              aria-label="Редактировать профиль"
            >
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-lg font-semibold text-foreground shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 flex flex-col gap-1">
                <span className="text-base font-semibold text-foreground truncate">
                  {displayName}
                </span>
                <PlanBadge status={subscriptionStatus} />
              </div>
              <Pencil className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
            </button>
          </section>

          {/* Моя семья: компактные карточки, [avatar] Name / Age, стрелка, вся карточка кликабельна */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Моя семья</h2>
            <p className="text-sm text-muted-foreground -mt-2">
              Профили, для которых вы готовите
            </p>
            <div className="space-y-2">
              {members.map((member, index) => {
                const isPrimary = member.id === primaryMemberId;
                const isLockedForFree = isFreeLocked && !isPrimary;
                const typeLabel =
                  MEMBER_TYPE_LABEL[(member as MembersRow).type] ??
                  (member as MembersRow).type;
                const ageStr = formatAge(member.age_months ?? null);
                const subtitle = [typeLabel, ageStr].filter(Boolean).join(" · ");
                const memberRow = member as MembersRow;
                const likesArr = memberRow.likes ?? [];
                const dislikesArr = memberRow.dislikes ?? [];
                const hasPreferences = subscriptionStatus === "trial" || subscriptionStatus === "premium";
                const isFree = subscriptionStatus === "free";
                const handleTeaserClick = (e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPaywallCustomMessage("Предпочтения (любит / не любит) — настройте в Premium.");
                  setShowPaywall(true);
                };
                return (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className={cn(cardClass, "w-full text-left overflow-hidden")}
                  >
                    <button
                      type="button"
                      onClick={() => handleMemberCardClick(memberRow)}
                      className="w-full flex items-center gap-3 py-3 hover:bg-muted/30 rounded-2xl -m-1 p-1 transition-colors text-left"
                    >
                      <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center text-lg shrink-0 relative">
                        {memberAvatar(memberRow, index)}
                        {isLockedForFree && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                            <Lock className="w-4 h-4 text-white" strokeWidth={2} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-medium text-foreground truncate">
                          {member.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {subtitle}
                        </div>
                        {hasPreferences && (likesArr.length > 0 || dislikesArr.length > 0) && (
                          <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5 truncate">
                            {likesArr.length > 0 && (
                              <div className="truncate">Любит: {likesArr.slice(0, 5).join(", ")}{likesArr.length > 5 ? "…" : ""}</div>
                            )}
                            {dislikesArr.length > 0 && (
                              <div className="truncate">Не любит: {dislikesArr.slice(0, 5).join(", ")}{dislikesArr.length > 5 ? "…" : ""}</div>
                            )}
                          </div>
                        )}
                      </div>
                      <ChevronRight
                        className="h-4 w-4 text-muted-foreground shrink-0"
                        strokeWidth={2}
                        aria-hidden
                      />
                    </button>
                    {isFree && (
                      <button
                        type="button"
                        onClick={handleTeaserClick}
                        className="w-full mt-1 pt-3 border-t border-border rounded-b-2xl flex flex-col gap-1.5 items-stretch text-left hover:bg-muted/20 transition-colors -mb-1 pb-1"
                      >
                        <span className="text-xs font-medium text-foreground">Любит / Не любит</span>
                        <span className="text-[11px] text-muted-foreground">Настройте продукты и улучшите подбор блюд</span>
                        <span className="text-xs font-medium text-primary">Открыть Premium</span>
                      </button>
                    )}
                  </motion.div>
                );
              })}
              <motion.button
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: members.length * 0.04 }}
                onClick={handleAddProfile}
                className={cn(
                  "w-full rounded-2xl border-2 border-dashed py-3 px-4 flex items-center justify-center gap-2",
                  "border-primary/50 text-primary hover:bg-primary/5 hover:border-primary/70",
                  "transition-colors disabled:opacity-50 disabled:pointer-events-none"
                )}
                disabled={members.length >= subscriptionLimits.maxProfiles}
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
                <span className="text-sm font-medium">Добавить профиль</span>
              </motion.button>
            </div>
          </section>

          {/* Подписка: единый контейнер для free / trial / premium */}
          <section className={cn(cardClass, "space-y-4")}>
            <h2 className="text-lg font-semibold text-foreground">Подписка</h2>

            {subscriptionStatus === "free" && (
              <>
                <div>
                  <p className="text-sm font-medium text-foreground">Free план</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {FREE_PLAN_DESCRIPTION}
                  </p>
                </div>
                <Button
                  className="w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 border-0"
                  onClick={handleSubscriptionCta}
                >
                  Попробовать Premium
                </Button>
              </>
            )}

            {(subscriptionStatus === "trial" || subscriptionStatus === "premium") && (
              <>
                {subscriptionStatus === "trial" && trialUntil && (
                  <p className="text-sm text-muted-foreground">
                    Trial до {formatSubscriptionEndDate(trialUntil)}
                  </p>
                )}
                {subscriptionStatus === "premium" && expiresAt && (
                  <p className="text-sm text-muted-foreground">
                    Premium до {formatSubscriptionEndDate(expiresAt)}
                  </p>
                )}
                <Button
                  className="w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 border-0"
                  onClick={handleSubscriptionCta}
                >
                  Управлять подпиской
                </Button>
                {hasAccess && (
                  <button
                    type="button"
                    className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                    onClick={async () => {
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
                    }}
                    disabled={isCancellingSubscription}
                  >
                    {isCancellingSubscription ? "Отмена…" : "Отменить подписку"}
                  </button>
                )}
              </>
            )}
          </section>

          {/* Уведомления, обратная связь, выход */}
          <section className="space-y-1">
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors text-sm border-b border-border"
              >
                <Bell className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={2} />
                <span className="text-foreground">Уведомления</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" strokeWidth={2} />
              </button>
              <a
                href="mailto:momrecipesai@gmail.com"
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border text-sm"
              >
                <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={2} />
                <span className="text-foreground">Обратная связь</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" strokeWidth={2} />
              </a>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors text-muted-foreground hover:text-destructive text-sm"
              >
                <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} />
                <span>Выйти из аккаунта</span>
              </button>
            </div>
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <Link
                to="/terms"
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border text-sm"
              >
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={2} />
                <span className="text-foreground">Пользовательское соглашение</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" strokeWidth={2} />
              </Link>
              <Link
                to="/privacy"
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border text-sm"
              >
                <Lock className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={2} />
                <span className="text-foreground">Политика конфиденциальности</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" strokeWidth={2} />
              </Link>
              <Link
                to="/subscription/terms"
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors text-sm"
              >
                <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={2} />
                <span className="text-foreground">Условия подписки</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" strokeWidth={2} />
              </Link>
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

      <ProfileEditSheet
        open={showMemberSheet}
        onOpenChange={setShowMemberSheet}
        member={null}
        createMode={true}
        onCreated={() => setShowMemberSheet(false)}
      />
    </MobileLayout>
  );
}
