import { useState } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Plus, Settings, LogOut, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useAppStore } from "@/store/useAppStore";
import { ProfileEditSheet } from "@/components/chat/ProfileEditSheet";
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

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { members, isLoading, formatAge, selectedMember, setSelectedMemberId } = useFamily();
  const { subscriptionStatus, hasPremiumAccess } = useSubscription();
  const [showMemberSheet, setShowMemberSheet] = useState(false);

  const displayName = user?.email?.split("@")[0] ?? "Пользователь";
  const statusLabel = STATUS_LABEL[subscriptionStatus] ?? "Free";

  const handleLogout = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  if (isLoading) {
    return (
      <MobileLayout
        title="Профиль"
        headerRight={
          <Button variant="ghost" size="icon" className="h-10 w-10" disabled>
            <Settings className="h-5 w-5" />
          </Button>
        }
      >
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout
      title="Профиль"
      headerRight={
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full"
          aria-label="Настройки"
        >
          <Settings className="h-5 w-5" />
        </Button>
      }
    >
      <div className="px-4 py-6 space-y-8">
        {/* Секция: Аккаунт */}
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
          <h3 className="text-base font-semibold text-foreground">Аккаунт</h3>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-2xl border-2 border-background shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground truncate">{displayName}</p>
              <p className="text-sm text-muted-foreground">
                Статус: <span className="font-medium text-foreground">{statusLabel}</span>
              </p>
            </div>
          </div>
        </section>

        {/* Секция: Моя семья */}
        <section className="space-y-4">
          <h3 className="text-base font-semibold text-foreground">Моя семья</h3>
          <div className="space-y-3">
            {members.map((member, index) => (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-2xl shrink-0">
                    {memberAvatar(member, index)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">
                      {member.name}
                      <span className="text-muted-foreground font-normal text-sm ml-1.5">
                        {[MEMBER_TYPE_LABEL[(member as MembersRow).type] ?? (member as MembersRow).type, formatAge(member.age_months ?? null)].filter(Boolean).join(" · ")}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {[
                        (member.allergies?.length && `Аллергии: ${(member.allergies as string[]).join(", ")}`) || "",
                        (member.preferences?.length && `Предпочтения: ${(member.preferences as string[]).join(", ")}`) || "",
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Нет ограничений"}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 -ml-2 h-8 text-primary"
                      onClick={() => navigate(`/profile/child/${member.id}`)}
                    >
                      Редактировать
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
                if (!hasPremiumAccess && members.length >= 1) {
                  useAppStore.getState().setShowPaywall(true);
                  return;
                }
                setShowMemberSheet(true);
              }}
              className="w-full rounded-2xl border-2 border-dashed border-muted-foreground/30 bg-muted/30 p-4 flex items-center justify-center gap-2 text-muted-foreground hover:bg-muted/50 hover:border-muted-foreground/50 transition-colors"
            >
              <Plus className="h-5 w-5" />
              <span className="font-medium">Добавить члена семьи</span>
            </motion.button>
          </div>
        </section>

        {/* Секция: Выбранный профиль (для чата) */}
        {members.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
            <h3 className="text-base font-semibold text-foreground">Выбранный профиль</h3>
            <p className="text-sm text-muted-foreground">
              В чате готовим для:{" "}
              <span className="font-medium text-foreground">
                {selectedMember?.name ?? "Семья"}
              </span>
            </p>
            {members.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = members.find((m) => m.id !== selectedMember?.id);
                  if (next) setSelectedMemberId(next.id);
                }}
              >
                Сменить профиль
              </Button>
            )}
          </section>
        )}

        {/* Секция: Управление */}
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
          <h3 className="text-base font-semibold text-foreground">Управление</h3>
          <p className="text-sm text-muted-foreground">
            Текущий план: <span className="font-medium text-foreground">{statusLabel}</span>
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => useAppStore.getState().setShowPaywall(true)}
          >
            Управлять подпиской
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Выйти из аккаунта
          </Button>
        </section>
      </div>

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
