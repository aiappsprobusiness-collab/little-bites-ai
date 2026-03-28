import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagListEditor } from "@/components/ui/tag-list-editor";
import { Plus, Check, ArrowRight } from "lucide-react";
import { useMembers, birthDateToAgeMonths, memberTypeFromAgeMonths } from "@/hooks/useMembers";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/store/useAppStore";
import { getSubscriptionLimits } from "@/utils/subscriptionRules";
import { trackUsageEvent } from "@/utils/usageEvents";
import { normalizeAllergyInput } from "@/utils/allergyAliases";
import { FF_AUTO_FILL_AFTER_MEMBER_CREATE } from "@/config/featureFlags";
import { startFillDay, setJustCreatedMemberId, getPlanUrlForMember } from "@/services/planFill";
import type { MembersRow } from "@/integrations/supabase/types-v2";
import { Calendar } from "lucide-react";

function parseTags(s: string): string[] {
  return s
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

const ONBOARDING_FAMILY_LIMIT_MESSAGE =
  "Добавьте всю семью в Premium и получайте рецепты для всех детей сразу";

export function getMaxMembersByTariff(status: string): number {
  return getSubscriptionLimits(status as "free" | "trial" | "premium").maxProfiles;
}

interface AddChildFormProps {
  onSaved: (memberId: string) => void;
  onAddAnother: () => void;
  onComplete: () => void;
  memberCount: number;
}

export function AddChildForm({
  onSaved,
  onAddAnother,
  onComplete,
  memberCount,
}: AddChildFormProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { createMember, isCreating } = useMembers();
  const { subscriptionStatus, hasAccess } = useSubscription();
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const setPaywallReason = useAppStore((s) => s.setPaywallReason);

  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [allergies, setAllergies] = useState<string[]>([]);
  const [allergyInput, setAllergyInput] = useState("");
  const [likes, setLikes] = useState<string[]>([]);
  const [likesInput, setLikesInput] = useState("");
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [dislikesInput, setDislikesInput] = useState("");
  const MAX_CHIPS = 20;

  const maxMembers = getMaxMembersByTariff(subscriptionStatus);
  const canAddMore = memberCount < maxMembers;
  const limits = getSubscriptionLimits(subscriptionStatus as "free" | "trial" | "premium");
  const isFreeLimitReached = !hasAccess && memberCount >= limits.maxActiveProfiles;

  const addToList = (
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    setInput: React.Dispatch<React.SetStateAction<string>>,
    max = 20
  ) => (raw: string) => {
    const toAdd = parseTags(raw).map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (toAdd.length) setList((prev) => Array.from(new Set([...prev.map((s) => s.trim().toLowerCase()), ...toAdd])).slice(0, max));
    setInput("");
  };

  const removeFromList = (setList: React.Dispatch<React.SetStateAction<string[]>>) => (index: number) => {
    setList((prev) => prev.filter((_, i) => i !== index));
  };

  const editInList = (
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    setInput: React.Dispatch<React.SetStateAction<string>>
  ) => (value: string, index: number) => {
    setInput(value);
    setList((prev) => prev.filter((_, i) => i !== index));
  };

  const allergiesHandlers = {
    add: (raw: string) => {
      if (!hasAccess && allergies.length >= 1) {
        setPaywallReason("allergies_locked");
        setPaywallCustomMessage(null);
        setShowPaywall(true);
        return;
      }
      const toAdd = parseTags(raw).map((s) => normalizeAllergyInput(s)).filter(Boolean);
      if (toAdd.length) {
        const existing = new Set(allergies.map((s) => s.trim().toLowerCase()));
        const added = toAdd.filter((v) => !existing.has(v.toLowerCase()));
        added.forEach((v) => existing.add(v.toLowerCase()));
        if (added.length) setAllergies((prev) => [...prev, ...added].slice(0, 20));
      }
      setAllergyInput("");
    },
    remove: removeFromList(setAllergies),
    edit: editInList(setAllergies, setAllergyInput),
  };

  const likesHandlers = {
    add: addToList(setLikes, setLikesInput, MAX_CHIPS),
    remove: removeFromList(setLikes),
    edit: editInList(setLikes, setLikesInput),
  };
  const dislikesHandlers = {
    add: addToList(setDislikes, setDislikesInput, MAX_CHIPS),
    remove: removeFromList(setDislikes),
    edit: editInList(setDislikes, setDislikesInput),
  };

  const resetForm = () => {
    setName("");
    setBirthDate("");
    setAllergies([]);
    setAllergyInput("");
    setLikes([]);
    setLikesInput("");
    setDislikes([]);
    setDislikesInput("");
  };

  const handleSave = async () => {
    if (isFreeLimitReached && memberCount >= 1) {
      setPaywallReason("add_child_limit");
      setPaywallCustomMessage(ONBOARDING_FAMILY_LIMIT_MESSAGE);
      setShowPaywall(true);
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ variant: "destructive", title: "Введите имя" });
      return;
    }
    const birthDateTrimmed = birthDate.trim();
    if (!birthDateTrimmed) {
      toast({ variant: "destructive", title: "Укажите дату рождения" });
      return;
    }
    const ageMonths = birthDateToAgeMonths(birthDateTrimmed);
    const type = memberTypeFromAgeMonths(ageMonths);

    trackUsageEvent("member_create_start");
    try {
      const newMember = await createMember({
        name: trimmedName,
        type,
        age_months: ageMonths || null,
        allergies,
        ...(hasAccess && { likes, dislikes }),
      });
      trackUsageEvent("member_create_success", { properties: { member_id: newMember.id } });
      toast({ title: "Профиль создан", description: `«${trimmedName}» добавлен`, duration: 2000 });
      onSaved(newMember.id);
      resetForm();

      if (FF_AUTO_FILL_AFTER_MEMBER_CREATE) {
        try {
          await startFillDay(newMember.id);
          setJustCreatedMemberId(newMember.id);
          navigate(getPlanUrlForMember(newMember.id));
        } catch (fillError) {
          toast({
            variant: "destructive",
            title: "Ошибка",
            description: "Не удалось подобрать меню. Попробуйте снова.",
          });
        }
      }
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: (e as Error)?.message || "Не удалось создать профиль",
      });
    }
  };

  const handleAddAnother = async () => {
    if (!canAddMore) {
      setPaywallReason("add_child_limit");
      setPaywallCustomMessage(ONBOARDING_FAMILY_LIMIT_MESSAGE);
      setShowPaywall(true);
      return;
    }
    await handleSave();
    onAddAnother();
  };

  const handleContinue = async () => {
    const trimmedName = name.trim();
    if (memberCount === 0 && !trimmedName) {
      toast({ variant: "destructive", title: "Добавьте хотя бы одного члена семьи" });
      return;
    }
    if (trimmedName) {
      await handleSave();
    }
    onComplete();
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="onboarding-name" className="text-typo-muted font-medium">
          Имя
        </Label>
        <Input
          id="onboarding-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Имя ребёнка или взрослого"
          className="h-11 border-2"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="onboarding-birth" className="text-typo-muted font-medium">
          Дата рождения <span className="text-destructive">*</span>
        </Label>
        <div className="date-input-wrap relative rounded-xl border-2 border-input bg-background">
          <Input
            id="onboarding-birth"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="h-11 min-h-0 border-0 bg-transparent rounded-xl pl-3 pr-12 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <button
            type="button"
            onClick={() => document.getElementById("onboarding-birth")?.focus()}
            className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Выбрать дату"
          >
            <Calendar className="w-5 h-5" />
          </button>
        </div>
        <p className="text-typo-caption text-muted-foreground">Возраст считается автоматически</p>
      </div>

      <TagListEditor
        label="Аллергии"
        chipVariant="allergy"
        items={allergies}
        inputValue={allergyInput}
        onInputChange={setAllergyInput}
        onAdd={allergiesHandlers.add}
        onEdit={allergiesHandlers.edit}
        onRemove={allergiesHandlers.remove}
        placeholder="Добавить аллергию (запятая или Enter)"
        helperText="Запятая или Enter."
      />

      {hasAccess && (
        <>
          <TagListEditor
            label="Любит"
            chipVariant="like"
            items={likes}
            inputValue={likesInput}
            onInputChange={setLikesInput}
            onAdd={likesHandlers.add}
            onEdit={likesHandlers.edit}
            onRemove={likesHandlers.remove}
            placeholder="Например: ягоды, рыба (запятая или Enter)"
            helperText="Запятая или Enter."
          />
          <TagListEditor
            label="Не любит"
            chipVariant="dislike"
            items={dislikes}
            inputValue={dislikesInput}
            onInputChange={setDislikesInput}
            onAdd={dislikesHandlers.add}
            onEdit={dislikesHandlers.edit}
            onRemove={dislikesHandlers.remove}
            placeholder="Например: лук, мясо (запятая или Enter)"
            helperText="Запятая или Enter."
          />
        </>
      )}

      <div className="flex flex-col gap-2 pt-2">
        <Button
          className="w-full h-12 gap-2"
          onClick={handleSave}
          disabled={isCreating || !name.trim() || !birthDate.trim()}
        >
          <Check className="h-4 w-4" />
          Сохранить
        </Button>
        {canAddMore && (
          <Button
            variant="outline"
            className="w-full h-11 gap-2"
            onClick={handleAddAnother}
            disabled={isCreating || !name.trim() || !birthDate.trim()}
          >
            <Plus className="h-4 w-4" />
            Добавить ещё профиль
          </Button>
        )}
        <Button
          variant="secondary"
          className="w-full h-11 gap-2"
          onClick={handleContinue}
          disabled={isCreating}
        >
          <ArrowRight className="h-4 w-4" />
          Продолжить
        </Button>
      </div>
    </div>
  );
}
