import { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TagListEditor } from "@/components/ui/tag-list-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Calendar, Loader2, Lock, Plus, Trash2, X } from "lucide-react";
import { useMembers, birthDateToAgeMonths } from "@/hooks/useMembers";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/store/useAppStore";
import { getSubscriptionLimits } from "@/utils/subscriptionRules";
import { normalizeAllergyInput } from "@/utils/allergyAliases";
import type { MembersRow, AllergyItemRow } from "@/integrations/supabase/types-v2";

function ageMonthsToBirthDate(ageMonths: number | null): string {
  if (ageMonths == null || ageMonths < 0) return "";
  const d = new Date();
  d.setMonth(d.getMonth() - ageMonths);
  return d.toISOString().slice(0, 10);
}

function parseTags(s: string): string[] {
  return s
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function ChildProfileEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { members, createMember, updateMember, deleteMember, isCreating, isUpdating, isDeleting } = useMembers();
  const { subscriptionStatus, hasAccess } = useSubscription();
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const limits = getSubscriptionLimits(subscriptionStatus);
  const isFree = subscriptionStatus === "free";
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [allergyItems, setAllergyItems] = useState<AllergyItemRow[]>([]);
  const [allergyInput, setAllergyInput] = useState("");
  const [likes, setLikes] = useState<string[]>([]);
  const [likesInput, setLikesInput] = useState("");
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [dislikesInput, setDislikesInput] = useState("");
  const [difficulty, setDifficulty] = useState<string>("easy");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const initRef = useRef(false);

  const isNew = id === "new";
  const member = !isNew && id ? members.find((m) => m.id === id) : null;
  const activeAllergyCount = allergyItems.filter((i) => i.is_active).length;

  useEffect(() => {
    if (isNew) {
      setName("");
      setBirthDate("");
      setAllergyItems([]);
      setAllergyInput("");
      setLikes([]);
      setLikesInput("");
      setDislikes([]);
      setDislikesInput("");
      setDifficulty("easy");
      initRef.current = true;
      return;
    }
    if (!member) return;
    initRef.current = true;
    setName(member.name ?? "");
    setBirthDate(ageMonthsToBirthDate(member.age_months ?? null));
    const items = (member as MembersRow).allergy_items ?? (member.allergies ?? []).map((value, sort_order) => ({ value, is_active: true, sort_order }));
    setAllergyItems(items);
    setAllergyInput("");
    setLikes((member as MembersRow).likes ?? []);
    setLikesInput("");
    setDislikes((member as MembersRow).dislikes ?? []);
    setDislikesInput("");
    const d = (member as MembersRow).difficulty?.trim();
    setDifficulty(d === "medium" || d === "any" ? d : "easy");
  }, [isNew, id, member?.id]);

  const allergiesHandlers = {
    add: (raw: string) => {
      const toAdd = parseTags(raw);
      if (!toAdd.length) return;
      if (activeAllergyCount >= limits.maxAllergiesPerProfile) {
        setPaywallCustomMessage("Аллергии и исключения — в Trial");
        setShowPaywall(true);
        return;
      }
      const nextActive = hasAccess ? true : activeAllergyCount === 0;
      const existing = allergyItems.map((i) => i.value.toLowerCase());
      const normalized = toAdd.map((v) => normalizeAllergyInput(v));
      const newItems = normalized.filter((v) => !existing.includes(v.toLowerCase())).map((value, i) => ({
        value,
        is_active: nextActive && i === 0,
        sort_order: allergyItems.length + i,
      }));
      if (newItems.length) setAllergyItems((prev) => [...prev, ...newItems]);
      setAllergyInput("");
    },
    remove: (index: number) => setAllergyItems((prev) => prev.filter((_, i) => i !== index)),
    edit: (value: string, index: number) => {
      setAllergyInput(value);
      setAllergyItems((prev) => prev.filter((_, i) => i !== index));
    },
    setActive: (index: number, active: boolean) => {
      if (!hasAccess && active) {
        setPaywallCustomMessage("Аллергии и исключения — в Trial");
        setShowPaywall(true);
        return;
      }
      setAllergyItems((prev) => prev.map((item, i) => (i === index ? { ...item, is_active: active } : item)));
    },
  };

  const MAX_CHIPS = 20;
  function normalizeChip(s: string): string {
    return s.trim().toLowerCase();
  }
  function addDedup(list: string[], toAdd: string[], max: number): string[] {
    const normalized = toAdd.map(normalizeChip).filter(Boolean);
    const set = new Set([...list.map(normalizeChip), ...normalized]);
    return Array.from(set).slice(0, max);
  }
  const openPaywallLikesDislikes = () => {
    setPaywallCustomMessage("Предпочтения (любит / не любит) и сложность блюд — в Premium.");
    setShowPaywall(true);
  };
  const LIKES_GHOST_CHIPS = ["ягоды", "рыба", "овощи"];
  const DISLIKES_GHOST_CHIPS = ["лук", "печень", "гречка"];
  const likesHandlers = {
    add: (raw: string) => {
      if (isFree) {
        openPaywallLikesDislikes();
        return;
      }
      const toAdd = parseTags(raw);
      if (toAdd.length) setLikes((prev) => addDedup(prev, toAdd, MAX_CHIPS));
      setLikesInput("");
    },
    remove: (index: number) => {
      if (isFree) {
        openPaywallLikesDislikes();
        return;
      }
      setLikes((prev) => prev.filter((_, i) => i !== index));
    },
    edit: (value: string, index: number) => {
      if (isFree) {
        openPaywallLikesDislikes();
        return;
      }
      setLikesInput(value);
      setLikes((prev) => prev.filter((_, i) => i !== index));
    },
  };
  const dislikesHandlers = {
    add: (raw: string) => {
      if (isFree) {
        openPaywallLikesDislikes();
        return;
      }
      const toAdd = parseTags(raw);
      if (toAdd.length) setDislikes((prev) => addDedup(prev, toAdd, MAX_CHIPS));
      setDislikesInput("");
    },
    remove: (index: number) => {
      if (isFree) {
        openPaywallLikesDislikes();
        return;
      }
      setDislikes((prev) => prev.filter((_, i) => i !== index));
    },
    edit: (value: string, index: number) => {
      if (isFree) {
        openPaywallLikesDislikes();
        return;
      }
      setDislikesInput(value);
      setDislikes((prev) => prev.filter((_, i) => i !== index));
    },
  };

  const ageMonths = birthDate ? birthDateToAgeMonths(birthDate) : null;

  const hasChanges = useMemo(() => {
    if (isNew) {
      return Boolean(
        name.trim() ||
        birthDate ||
        allergyItems.length > 0 ||
        likes.length > 0 ||
        dislikes.length > 0 ||
        difficulty !== "easy"
      );
    }
    if (!member) return false;
    const origName = (member.name ?? "").trim();
    const origBirth = ageMonthsToBirthDate(member.age_months ?? null);
    const origItems = (member as MembersRow).allergy_items ?? (member.allergies ?? []).map((value, sort_order) => ({ value, is_active: true, sort_order }));
    const origLikes = (member as MembersRow).likes ?? [];
    const origDislikes = (member as MembersRow).dislikes ?? [];
    const origDiff = ((member as MembersRow).difficulty?.trim() === "medium" || (member as MembersRow).difficulty?.trim() === "any") ? (member as MembersRow).difficulty?.trim() : "easy";
    if (name.trim() !== origName || birthDate !== origBirth || difficulty !== (origDiff ?? "easy")) return true;
    if (allergyItems.length !== origItems.length) return true;
    for (let i = 0; i < allergyItems.length; i++) {
      if (allergyItems[i].value !== origItems[i]?.value || allergyItems[i].is_active !== origItems[i]?.is_active) return true;
    }
    if (likes.length !== origLikes.length || dislikes.length !== origDislikes.length) return true;
    const toKey = (a: string[]) => [...a].sort().join(",");
    if (toKey(likes) !== toKey(origLikes) || toKey(dislikes) !== toKey(origDislikes)) return true;
    return false;
  }, [isNew, member, name, birthDate, allergyItems, likes, dislikes, difficulty]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ variant: "destructive", title: "Введите имя" });
      return;
    }
    if (activeAllergyCount > limits.maxAllergiesPerProfile) {
      setPaywallCustomMessage("Аллергии и исключения — в Trial");
      setShowPaywall(true);
      return;
    }
    try {
      if (isNew) {
        const newMember = await createMember({
          name: trimmedName,
          type: "child",
          age_months: ageMonths || null,
          allergy_items: allergyItems.length ? allergyItems : undefined,
          allergies: allergyItems.filter((i) => i.is_active).map((i) => i.value),
        ...(limits.preferencesEnabled && {
          likes,
          dislikes,
          difficulty: difficulty === "any" ? "any" : difficulty === "medium" ? "medium" : "easy",
        }),
      });
      toast({ title: "Профиль сохранён" });
        navigate("/profile", { replace: true });
        return;
      }
      if (!member) return;
      await updateMember({
        id: member.id,
        name: trimmedName,
        age_months: ageMonths || null,
        allergy_items: allergyItems.length ? allergyItems : undefined,
        allergies: allergyItems.filter((i) => i.is_active).map((i) => i.value),
        ...(limits.preferencesEnabled && {
          likes,
          dislikes,
          difficulty: difficulty === "any" ? "any" : difficulty === "medium" ? "medium" : "easy",
        }),
      });
      toast({ title: "Профиль сохранён" });
      navigate("/profile", { replace: true });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: (e as Error)?.message ?? "Не удалось сохранить",
      });
    }
  };

  const handleDelete = async () => {
    if (!member) return;
    try {
      await deleteMember(member.id);
      toast({ title: "Профиль удалён" });
      setShowDeleteConfirm(false);
      navigate("/profile", { replace: true });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: (e as Error)?.message ?? "Не удалось удалить",
      });
    }
  };

  const loading = !isNew && id && members.length > 0 && !member;

  useEffect(() => {
    if (!isNew && id && members.length > 0 && !member) {
      navigate("/profile", { replace: true });
    }
  }, [isNew, id, members.length, member, navigate]);

  return (
    <MobileLayout
      title="Профиль"
      headerLeft={
        <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => navigate("/profile")} aria-label="Назад">
          <ArrowLeft className="h-5 w-5" />
        </Button>
      }
      headerRight={
        <Button
          className="bg-[#7A8F4D] hover:bg-[#6a7e41] text-white border-0 rounded-[10px] px-[14px] py-2 h-auto font-medium"
          onClick={handleSave}
          disabled={isCreating || isUpdating || !hasChanges}
        >
          {(isCreating || isUpdating) ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Сохранить"
          )}
        </Button>
      }
    >
      <div className="profile-edit-page min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 py-4 max-w-lg mx-auto flex flex-col gap-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Карточка 1: Основная информация */}
              <div className="profile-card">
                <h2 className="profile-card-title mb-4">Основная информация</h2>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="child-name" className="profile-label">
                      Имя
                    </label>
                    <Input
                      id="child-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Имя ребёнка"
                      className="profile-input h-auto min-h-[44px] text-base placeholder:text-[#9CA3AF] focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="child-birth" className="profile-label">
                      Дата рождения
                    </label>
                    <div className="relative">
                      <Input
                        id="child-birth"
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        className="profile-input h-auto min-h-[44px] pl-3 pr-12 text-base placeholder:text-[#9CA3AF] focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                      <button
                        type="button"
                        onClick={() => document.getElementById("child-birth")?.focus()}
                        className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-[#9CA3AF] hover:text-foreground"
                        aria-label="Выбрать дату"
                      >
                        <Calendar className="w-5 h-5" />
                      </button>
                    </div>
                    <p className="text-[13px] text-[#9CA3AF] mt-0.5">
                      Возраст считается автоматически
                    </p>
                  </div>
                </div>
              </div>

              {/* Карточка 2: Аллергии */}
              <div className="profile-card">
                <h2 className="profile-card-title mb-4">Аллергии</h2>
                {allergyItems.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {allergyItems.map((item, i) => {
                      const isLocked = !hasAccess && !item.is_active;
                      return (
                        <span
                          key={i}
                          className={`profile-tag-enter ${isLocked ? "bg-amber-50 text-amber-800 cursor-pointer hover:bg-amber-100 inline-flex items-center gap-1.5 rounded-[999px] py-1.5 px-3 text-[13px]" : "profile-pill"}`}
                          role={isLocked ? "button" : undefined}
                          tabIndex={isLocked ? 0 : undefined}
                          onClick={isLocked ? () => { setPaywallCustomMessage("Аллергии и исключения — в Trial"); setShowPaywall(true); } : undefined}
                          onKeyDown={isLocked ? (e) => e.key === "Enter" && (setPaywallCustomMessage("Аллергии и исключения — в Trial"), setShowPaywall(true)) : undefined}
                        >
                          <span
                            className={!isLocked ? "cursor-pointer truncate max-w-[120px]" : "truncate max-w-[120px]"}
                            onClick={!isLocked ? (e) => { e.stopPropagation(); allergiesHandlers.edit(item.value, i); } : undefined}
                          >
                            {item.value}
                          </span>
                          {isLocked ? (
                            <Lock className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); allergiesHandlers.remove(i); }}
                              className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-[#d4e0b8] shrink-0 -mr-0.5"
                              aria-label="Удалить"
                            >
                              <X className="w-3 h-3 text-[#556B2F]" />
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}
                {isFree && activeAllergyCount >= 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => { setPaywallCustomMessage("Аллергии и исключения — в Trial"); setShowPaywall(true); }}
                      className="profile-pill-add-btn w-full gap-2 font-medium text-sm"
                    >
                      <Plus className="w-5 h-5" />
                      Добавить аллергию
                    </button>
                    <p className="text-[13px] text-[#9CA3AF] mt-2">
                      В Free доступна 1 аллергия
                    </p>
                  </>
                ) : (
                  <>
                    <label htmlFor="child-allergy-add" className="flex h-11 items-center gap-3 px-4 rounded-xl border border-[#E5E7EB] bg-white hover:border-[#7A8F4D]/40 transition-colors cursor-text w-full profile-input">
                      <button
                        type="button"
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[#7A8F4D] text-white hover:opacity-90 disabled:opacity-50"
                        onClick={(e) => {
                          e.preventDefault();
                          if (allergyInput.trim()) allergiesHandlers.add(allergyInput);
                        }}
                        disabled={!allergyInput.trim()}
                        aria-label="Добавить аллергию"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <input
                        id="child-allergy-add"
                        value={allergyInput}
                        onChange={(e) => setAllergyInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            allergiesHandlers.add(allergyInput);
                          }
                        }}
                        placeholder="Добавить аллергию"
                        className="flex-1 min-w-0 border-0 bg-transparent py-2 text-[15px] font-medium text-foreground placeholder:text-[#9CA3AF] focus:outline-none focus:ring-0"
                      />
                    </label>
                    <p className="text-[13px] text-[#9CA3AF] mt-1.5">
                      {!hasAccess ? "В Free доступна 1 аллергия" : "Запятая или Enter."}
                    </p>
                  </>
                )}
              </div>

              {/* Карточка 3: Предпочтения */}
              <div className="profile-card">
                <h2 className="profile-card-title mb-4">Предпочтения</h2>
                {isFree ? (
                  <>
                    <button
                      type="button"
                      onClick={openPaywallLikesDislikes}
                      className="text-left w-full rounded-xl border border-[#E5E7EB] bg-white p-4 hover:border-[#7A8F4D]/40 hover:bg-[#EEF3E5]/30 transition-colors"
                    >
                      <p className="profile-label font-medium text-[#2F3A2E]">Любит</p>
                      <p className="text-[13px] text-[#9CA3AF] mt-0.5">Помогает точнее подбирать рецепты</p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {LIKES_GHOST_CHIPS.map((chip) => (
                          <span key={chip} className="profile-pill" style={{ background: "#EEF3E5", color: "#556B2F" }}>
                            {chip}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 w-full rounded-xl py-2.5 text-center text-sm font-medium profile-pill-add-btn">
                        ✨ Настроить (Premium)
                      </div>
                    </button>
                    <div className="profile-divider" />
                    <button
                      type="button"
                      onClick={openPaywallLikesDislikes}
                      className="text-left w-full rounded-xl border border-[#E5E7EB] bg-white p-4 hover:border-[#7A8F4D]/40 hover:bg-[#EEF3E5]/30 transition-colors"
                    >
                      <p className="profile-label font-medium text-[#2F3A2E]">Не любит</p>
                      <p className="text-[13px] text-[#9CA3AF] mt-0.5">Помогает точнее подбирать рецепты</p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {DISLIKES_GHOST_CHIPS.map((chip) => (
                          <span key={chip} className="profile-pill" style={{ background: "#EEF3E5", color: "#556B2F" }}>
                            {chip}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 w-full rounded-xl py-2.5 text-center text-sm font-medium profile-pill-add-btn">
                        ✨ Настроить (Premium)
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={openPaywallLikesDislikes}
                      className="text-left w-full rounded-xl border border-[#E5E7EB] bg-white p-4 mt-3 hover:border-[#7A8F4D]/40 hover:bg-[#EEF3E5]/30 transition-colors"
                    >
                      <p className="profile-label font-medium text-[#2F3A2E]">Сложность блюд</p>
                      <p className="text-[13px] text-[#9CA3AF] mt-0.5">Простые, средние или любые — в Premium</p>
                      <div className="mt-3 w-full rounded-xl py-2.5 text-center text-sm font-medium profile-pill-add-btn">
                        ✨ Настроить (Premium)
                      </div>
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col gap-2">
                      <p className="profile-label font-medium text-[#2F3A2E]">Любит</p>
                      <TagListEditor
                        id="profile-likes"
                        label=""
                        items={likes}
                        inputValue={likesInput}
                        onInputChange={setLikesInput}
                        onAdd={likesHandlers.add}
                        onEdit={likesHandlers.edit}
                        onRemove={likesHandlers.remove}
                        placeholder="Добавить (например: ягоды, рыба)"
                        unified
                        variant="pill"
                        helperText={`Запятая или Enter. До ${MAX_CHIPS} пунктов.`}
                      />
                    </div>
                    <div className="profile-divider" />
                    <div className="flex flex-col gap-2">
                      <p className="profile-label font-medium text-[#2F3A2E]">Не любит</p>
                      <TagListEditor
                        id="profile-dislikes"
                        label=""
                        items={dislikes}
                        inputValue={dislikesInput}
                        onInputChange={setDislikesInput}
                        onAdd={dislikesHandlers.add}
                        onEdit={dislikesHandlers.edit}
                        onRemove={dislikesHandlers.remove}
                        placeholder="Добавить (например: лук, мясо)"
                        unified
                        variant="pill"
                        helperText={`Запятая или Enter. До ${MAX_CHIPS} пунктов.`}
                      />
                    </div>
                    <div className="flex flex-col gap-2 mt-4">
                      <p className="profile-label font-medium text-[#2F3A2E]">Сложность блюд</p>
                      <div className="flex rounded-xl bg-[#EEF3E5]/60 p-1 gap-0">
                        {[
                          { value: "easy", label: "Простые" },
                          { value: "medium", label: "Средние" },
                          { value: "any", label: "Любые" },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setDifficulty(opt.value)}
                            className={`flex-1 h-9 rounded-[10px] text-sm font-medium transition-colors ${
                              difficulty === opt.value
                                ? "bg-[#7A8F4D] text-white shadow-sm"
                                : "bg-transparent text-[#556B2F] hover:bg-[#EEF3E5]"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {!isNew && member && (
                <Button
                  variant="ghost"
                  className="w-full h-11 rounded-xl text-[#6B7280] hover:text-destructive hover:bg-destructive/5 text-sm font-medium"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isDeleting}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Удалить профиль
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить профиль?</AlertDialogTitle>
            <AlertDialogDescription>
              Профиль «{member?.name}» будет удалён. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileLayout>
  );
}
