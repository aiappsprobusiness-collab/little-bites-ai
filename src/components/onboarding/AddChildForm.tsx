import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagListEditor } from "@/components/ui/tag-list-editor";
import { Plus, Check, ArrowRight } from "lucide-react";
import { useMembers } from "@/hooks/useMembers";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/store/useAppStore";
import { getSubscriptionLimits } from "@/utils/subscriptionRules";
import type { MembersRow, MemberTypeV2 } from "@/integrations/supabase/types-v2";

function ageMonthsFromYearsMonths(years: number, months: number): number {
  return years * 12 + Math.max(0, Math.min(11, months));
}

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
  const { createMember, isCreating } = useMembers();
  const { subscriptionStatus, hasAccess } = useSubscription();
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);

  const [name, setName] = useState("");
  const [memberType, setMemberType] = useState<MemberTypeV2>("child");
  const [ageYears, setAgeYears] = useState(0);
  const [ageMonths, setAgeMonths] = useState(0);
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

  const totalAgeMonths = ageMonthsFromYearsMonths(ageYears, ageMonths);

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
        setPaywallCustomMessage(ONBOARDING_FAMILY_LIMIT_MESSAGE);
        setShowPaywall(true);
        return;
      }
      addToList(setAllergies, setAllergyInput)(raw);
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
    setMemberType("child");
    setAgeYears(0);
    setAgeMonths(0);
    setAllergies([]);
    setAllergyInput("");
    setLikes([]);
    setLikesInput("");
    setDislikes([]);
    setDislikesInput("");
  };

  const handleSave = async () => {
    if (isFreeLimitReached && memberCount >= 1) {
      setPaywallCustomMessage(ONBOARDING_FAMILY_LIMIT_MESSAGE);
      setShowPaywall(true);
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ variant: "destructive", title: "Введите имя" });
      return;
    }

    try {
      const newMember = await createMember({
        name: trimmedName,
        type: memberType,
        age_months: totalAgeMonths || null,
        allergies,
        ...(hasAccess && { likes, dislikes }),
      });
      toast({ title: "Профиль создан", description: `«${trimmedName}» добавлен` });
      onSaved(newMember.id);
      resetForm();
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
        <Label className="text-typo-muted font-medium">Тип</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={memberType === "child" ? "default" : "outline"}
            size="sm"
            onClick={() => setMemberType("child")}
          >
            Ребёнок
          </Button>
          <Button
            type="button"
            variant={memberType === "adult" ? "default" : "outline"}
            size="sm"
            onClick={() => setMemberType("adult")}
          >
            Взрослый
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="onboarding-age-years" className="text-typo-muted font-medium">
            Возраст: годы
          </Label>
          <Input
            id="onboarding-age-years"
            type="number"
            min={0}
            max={20}
            value={ageYears === 0 ? "" : ageYears}
            onChange={(e) => setAgeYears(Math.max(0, parseInt(e.target.value, 10) || 0))}
            placeholder="0"
            className="h-11 border-2"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="onboarding-age-months" className="text-typo-muted font-medium">
            Месяцы (0–11)
          </Label>
          <Input
            id="onboarding-age-months"
            type="number"
            min={0}
            max={11}
            value={ageMonths === 0 ? "" : ageMonths}
            onChange={(e) => setAgeMonths(Math.max(0, Math.min(11, parseInt(e.target.value, 10) || 0)))}
            placeholder="0"
            className="h-11 border-2"
          />
        </div>
      </div>

      <TagListEditor
        label="Аллергии"
        items={allergies}
        inputValue={allergyInput}
        onInputChange={setAllergyInput}
        onAdd={allergiesHandlers.add}
        onEdit={allergiesHandlers.edit}
        onRemove={allergiesHandlers.remove}
        placeholder="Добавить аллергию (запятая или Enter)"
      />

      {hasAccess && (
        <>
          <TagListEditor
            label="Любит"
            items={likes}
            inputValue={likesInput}
            onInputChange={setLikesInput}
            onAdd={likesHandlers.add}
            onEdit={likesHandlers.edit}
            onRemove={likesHandlers.remove}
            placeholder="Например: ягоды, рыба (запятая или Enter)"
          />
          <TagListEditor
            label="Не любит"
            items={dislikes}
            inputValue={dislikesInput}
            onInputChange={setDislikesInput}
            onAdd={dislikesHandlers.add}
            onEdit={dislikesHandlers.edit}
            onRemove={dislikesHandlers.remove}
            placeholder="Например: лук, мясо (запятая или Enter)"
          />
        </>
      )}

      <div className="flex flex-col gap-2 pt-2">
        <Button
          className="w-full h-12 gap-2"
          onClick={handleSave}
          disabled={isCreating || !name.trim()}
        >
          <Check className="h-4 w-4" />
          Сохранить
        </Button>
        {canAddMore && (
          <Button
            variant="outline"
            className="w-full h-11 gap-2"
            onClick={handleAddAnother}
            disabled={isCreating || !name.trim()}
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
