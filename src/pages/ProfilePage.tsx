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
    <Badge variant={variant} className="text-xs font-medium shrink-0">
      {STATUS_LABEL[status] ?? "Free"}
    </Badge>
  );
}

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { members, isLoading, formatAge } = useFamily();
  const { subscriptionStatus, hasAccess, hasPremiumAccess, isTrial, trialDaysRemaining, cancelSubscription, isCancellingSubscription } = useSubscription();
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
      <MobileLayout title="Профиль">
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title="Профиль">
      <div className="px-4 py-6 space-y-8 max-w-md mx-auto">
        {/* User Card */}
        <section
          className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] space-y-4"
          style={{ boxShadow: "0 8px 30px -8px hsl(240 10% 25% / 0.08)" }}
        >
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-2xl font-semibold text-foreground border-2 border-background shrink-0 shadow-sm">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-foreground truncate">
                  {displayName}
                </h2>
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
        </section>

        {/* My Family */}
        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Моя семья
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Профили, для которых вы готовите
            </p>
          </div>
          <div className="space-y-3">
            {members.map((member, index) => (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="rounded-2xl border border-border bg-card p-4 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.06)]"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-2xl shrink-0">
                    {memberAvatar(member, index)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">
                      {member.name}
                      <span className="text-muted-foreground font-normal text-sm ml-1.5">
                        {[
                          MEMBER_TYPE_LABEL[(member as MembersRow).type] ??
                            (member as MembersRow).type,
                          formatAge(member.age_months ?? null),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {[
                        member.allergies?.length &&
                          `Аллергии: ${(member.allergies as string[]).join(", ")}`,
                        member.preferences?.length &&
                          `Предпочтения: ${(member.preferences as string[]).join(", ")}`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Нет ограничений"}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 -ml-2 h-8 text-primary hover:text-primary/90"
                      onClick={() => navigate(`/profile/child/${member.id}`)}
                    >
                      Открыть профиль
                      <ChevronRight className="h-4 w-4 ml-0.5" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: members.length * 0.05 }}
              onClick={() => {
                if (!hasAccess && members.length >= 1) {
                  setPaywallCustomMessage(
                    "Добавьте всю семью в Premium и получайте рецепты для всех детей сразу"
                  );
                  useAppStore.getState().setShowPaywall(true);
                  return;
                }
                setShowMemberSheet(true);
              }}
              className="w-full rounded-2xl border-2 border-dashed border-muted-foreground/30 bg-muted/30 p-5 flex items-center justify-center gap-3 text-muted-foreground hover:bg-muted/50 hover:border-muted-foreground/50 transition-colors"
            >
              <Plus className="h-6 w-6" />
              <span className="font-medium">
                Добавить ребёнка / члена семьи
              </span>
            </motion.button>
          </div>
        </section>

        {/* Subscription */}
        <section
          className="rounded-2xl border border-border bg-card p-5 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.06)] space-y-4"
          style={{ boxShadow: "0 8px 30px -8px hsl(240 10% 25% / 0.08)" }}
        >
          <h3 className="text-base font-semibold text-foreground">
            Текущий план
          </h3>
          <div className="flex items-center justify-between gap-2">
            <PlanBadge status={subscriptionStatus} />
            {isTrial && trialDaysRemaining !== null && (
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Осталось {trialDaysRemaining} {trialDaysRemaining === 1 ? "день" : trialDaysRemaining < 5 ? "дня" : "дней"}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {PLAN_BENEFITS[subscriptionStatus] ?? PLAN_BENEFITS.free}
          </p>
          <Button
            variant="outline"
            className="w-full"
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

        {/* Settings */}
        <section className="space-y-2">
          <h3 className="text-base font-semibold text-foreground px-1">
            Настройки
          </h3>
          <div
            className="rounded-2xl border border-border bg-card overflow-hidden shadow-[0_4px_16px_-4px_rgba(0,0,0,0.06)]"
            style={{ boxShadow: "0 8px 30px -8px hsl(240 10% 25% / 0.08)" }}
          >
            <button
              type="button"
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/50 transition-colors border-b border-border last:border-b-0"
            >
              <Bell className="h-5 w-5 text-muted-foreground shrink-0" />
              <span className="text-foreground">Уведомления</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
            </button>
            <a
              href="mailto:momrecipesai@gmail.com"
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/50 transition-colors border-b border-border last:border-b-0"
            >
              <HelpCircle className="h-5 w-5 text-muted-foreground shrink-0" />
              <span className="text-foreground">Обратная связь</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
            </a>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/50 transition-colors text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              <span>Выйти из аккаунта</span>
            </button>
          </div>
        </section>

        {/* Юридическая информация */}
        <section className="space-y-2">
          <h3 className="text-base font-semibold text-foreground px-1">
            Юридическая информация
          </h3>
          <div
            className="rounded-2xl border border-border bg-card overflow-hidden shadow-[0_4px_16px_-4px_rgba(0,0,0,0.06)]"
            style={{ boxShadow: "0 8px 30px -8px hsl(240 10% 25% / 0.08)" }}
          >
            <Link
              to="/terms"
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/50 transition-colors border-b border-border"
            >
              <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
              <span className="text-foreground">Пользовательское соглашение</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
            </Link>
            <Link
              to="/privacy"
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/50 transition-colors border-b border-border"
            >
              <Lock className="h-5 w-5 text-muted-foreground shrink-0" />
              <span className="text-foreground">Политика конфиденциальности</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
            </Link>
            <Link
              to="/subscription"
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/50 transition-colors last:border-b-0"
            >
              <CreditCard className="h-5 w-5 text-muted-foreground shrink-0" />
              <span className="text-foreground">Условия подписки</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
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
          <div className="space-y-2 py-2">
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
