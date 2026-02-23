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
  ExternalLink,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { getSubscriptionLimits } from "@/utils/subscriptionRules";
import { useAppStore } from "@/store/useAppStore";
import { ProfileEditSheet } from "@/components/chat/ProfileEditSheet";
import { Badge } from "@/components/ui/badge";
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

const PLAN_BENEFITS: Record<string, string> = {
  free: "1 профиль · 5 запросов в день",
  trial: "До 10 профилей · Безлимит · Планы питания",
  premium: "До 10 профилей · Безлимит · Планы питания",
};

function PlanBadge({ status }: { status: string }) {
  const variant =
    status === "premium"
      ? "default"
      : status === "trial"
        ? "secondary"
        : "outline";
  return (
    <Badge variant={variant} className="text-typo-caption font-medium shrink-0">
      {STATUS_LABEL[status] ?? "Free"}
    </Badge>
  );
}

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { members, isLoading, formatAge, primaryMemberId, isFreeLocked } = useFamily();
  const { subscriptionStatus, hasAccess, hasPremiumAccess, isTrial, trialDaysRemaining, cancelSubscription, isCancellingSubscription } = useSubscription();
  const subscriptionLimits = getSubscriptionLimits(subscriptionStatus);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const [showMemberSheet, setShowMemberSheet] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  const displayName =
    (user?.user_metadata?.display_name as string)?.trim() ||
    user?.email?.split("@")[0] ||
    "Пользователь";
  const email = user?.email ?? "";
  const statusLabel = STATUS_LABEL[subscriptionStatus] ?? "Free";

  const handleOpenNameModal = () => {
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

  const getSubscriptionCta = () => {
    if (subscriptionStatus === "premium") return "Управлять подпиской";
    if (subscriptionStatus === "trial") return "Перейти на Premium";
    return "Открыть Premium";
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

  const cardClass = "rounded-2xl border border-border bg-card shadow-soft p-4";

  return (
    <MobileLayout>
      <div className="px-4 pt-0 pb-2 space-y-3 max-w-md mx-auto">
        <section className="space-y-2">
          <div className={cardClass}>
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center text-xl font-semibold text-foreground shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-semibold text-foreground truncate">
                    {displayName}
                  </span>
                  <button
                    type="button"
                    onClick={handleOpenNameModal}
                    className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="Изменить имя"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">
                  {email}
                </p>
                <div className="mt-2">
                  <PlanBadge status={subscriptionStatus} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Моя семья — карточки того же размера, что и Аккаунт */}
        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Моя семья</h2>
          <p className="text-sm text-muted-foreground -mt-1">Профили, для которых вы готовите</p>
          <div className="space-y-2">
          {members.map((member, index) => {
              const isPrimary = member.id === primaryMemberId;
              const isLockedForFree = isFreeLocked && !isPrimary;
              return (
                <motion.div
                  key={member.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`${cardClass} ${
                    isLockedForFree
                      ? "border-slate-200 bg-slate-50/80"
                      : ""
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-semibold text-foreground shrink-0 relative ${
                      isLockedForFree ? "bg-slate-200" : "bg-muted"
                    }`}>
                      {memberAvatar(member, index)}
                      {isLockedForFree && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-500/40">
                          <Lock className="w-5 h-5 text-white" strokeWidth={2.5} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-base font-semibold truncate ${isLockedForFree ? "text-slate-500" : "text-foreground"}`}>
                          {member.name}
                        </span>
                      </div>
                      <p className={`text-sm mt-0.5 truncate ${isLockedForFree ? "text-slate-400" : "text-muted-foreground"}`}>
                        {[
                          MEMBER_TYPE_LABEL[(member as MembersRow).type] ?? (member as MembersRow).type,
                          formatAge(member.age_months ?? null),
                        ].filter(Boolean).join(" · ")}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`mt-1.5 -ml-2 h-7 text-xs ${isLockedForFree ? "text-slate-400 hover:text-slate-600" : "text-primary hover:text-primary/90"}`}
                        onClick={() => {
                          if (isLockedForFree) {
                            setPaywallCustomMessage("Переключение между профилями детей доступно в Premium");
                            useAppStore.getState().setShowPaywall(true);
                            return;
                          }
                          navigate(`/profile/child/${member.id}`);
                        }}
                      >
                        {isLockedForFree ? (
                          <>Активно в Premium <Lock className="h-3.5 w-3.5 ml-1 inline" /></>
                        ) : (
                          <>Открыть профиль <ChevronRight className="h-4 w-4 ml-0.5" /></>
                        )}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: members.length * 0.05 }}
              onClick={() => {
                if (members.length >= subscriptionLimits.maxProfiles) return;
                setShowMemberSheet(true);
              }}
              disabled={members.length >= subscriptionLimits.maxProfiles}
              className="w-full rounded-xl border border-border bg-background hover:bg-muted/50 py-3.5 px-4 flex items-center justify-center gap-3 text-foreground font-medium transition-colors disabled:opacity-60 disabled:pointer-events-none"
            >
              <Plus className="h-5 w-5 text-muted-foreground" />
              <span>Добавить ребёнка</span>
            </motion.button>
          </div>
        </section>

        {/* Подписка */}
        <section className={cardClass + " space-y-3"}>
          <h2 className="text-xl font-semibold text-foreground">
            Подписка
          </h2>
          <div className="flex items-center justify-between gap-2">
            <PlanBadge status={subscriptionStatus} />
            {isTrial && trialDaysRemaining !== null && (
              <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Осталось {trialDaysRemaining} {trialDaysRemaining === 1 ? "день" : trialDaysRemaining < 5 ? "дня" : "дней"}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {PLAN_BENEFITS[subscriptionStatus] ?? PLAN_BENEFITS.free}
          </p>
          <Button
            variant="outline"
            className="w-full rounded-xl"
            onClick={() => useAppStore.getState().setShowPaywall(true)}
          >
            {getSubscriptionCta()}
            <ExternalLink className="h-4 w-4 ml-2" />
          </Button>
          {hasAccess && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground hover:text-destructive"
              onClick={async () => {
                try {
                  await cancelSubscription();
                  toast({ title: "Подписка отменена", description: "Доступ сохранится до конца оплаченного периода." });
                } catch {
                  toast({ variant: "destructive", title: "Не удалось отменить подписку" });
                }
              }}
              disabled={isCancellingSubscription}
            >
              {isCancellingSubscription ? "Отмена…" : "Отменить подписку"}
            </Button>
          )}
        </section>

        {/* Внизу: уведомления, обратная связь, выход и юридические ссылки */}
        <section className="space-y-3">
          <div className="rounded-2xl border border-border bg-card shadow-soft overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors border-b border-border text-sm"
            >
              <Bell className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-foreground">Уведомления</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
            </button>
            <a
              href="mailto:momrecipesai@gmail.com"
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors border-b border-border text-sm"
            >
              <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-foreground">Обратная связь</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
            </a>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors text-muted-foreground hover:text-destructive text-sm"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Выйти из аккаунта</span>
            </button>
          </div>
          <div className="rounded-2xl border border-border bg-card shadow-soft overflow-hidden">
            <Link
              to="/terms"
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors border-b border-border text-sm"
            >
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-foreground">Пользовательское соглашение</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
            </Link>
            <Link
              to="/privacy"
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors border-b border-border text-sm"
            >
              <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-foreground">Политика конфиденциальности</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
            </Link>
            <Link
              to="/subscription"
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors text-sm"
            >
              <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-foreground">Условия подписки</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
            </Link>
          </div>
        </section>
      </div>

      {/* Name edit modal */}
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
            <Button
              variant="outline"
              onClick={() => setShowNameModal(false)}
            >
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
