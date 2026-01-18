import { useState } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Baby, Plus, Edit2, AlertTriangle, ChefHat, Heart, Calendar } from "lucide-react";

const mockChildren = [
  {
    id: "1",
    name: "Миша",
    birthDate: "2023-10-15",
    age: "1 год 3 мес",
    avatarEmoji: "👶",
    allergies: ["Глютен", "Молоко"],
    stats: { recipes: 24, favorites: 8, planned: 12 },
  },
];

const allergyOptions = [
  "Молоко", "Яйца", "Глютен", "Орехи", "Соя", "Рыба", "Мед", "Цитрусы"
];

export default function ProfilePage() {
  const [children] = useState(mockChildren);
  const [selectedChild] = useState(children[0]);

  return (
    <MobileLayout title="Профиль">
      <div className="px-4 pt-6 space-y-6">
        {/* Child Selector */}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
          {children.map((child) => (
            <motion.button
              key={child.id}
              whileTap={{ scale: 0.95 }}
              className={`flex-shrink-0 flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
                selectedChild?.id === child.id
                  ? "bg-primary text-primary-foreground shadow-button"
                  : "bg-card shadow-soft"
              }`}
            >
              <span className="text-2xl">{child.avatarEmoji}</span>
              <div className="text-left">
                <p className="font-semibold">{child.name}</p>
                <p className="text-xs opacity-80">{child.age}</p>
              </div>
            </motion.button>
          ))}
          <motion.button
            whileTap={{ scale: 0.95 }}
            className="flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-2xl bg-muted border-2 border-dashed border-muted-foreground/30"
          >
            <Plus className="w-6 h-6 text-muted-foreground" />
          </motion.button>
        </div>

        {selectedChild && (
          <>
            {/* Profile Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card variant="elevated" className="overflow-hidden">
                <div className="h-24 gradient-primary" />
                <CardContent className="relative pt-0">
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2">
                    <div className="w-24 h-24 rounded-3xl bg-card shadow-card flex items-center justify-center text-5xl border-4 border-card">
                      {selectedChild.avatarEmoji}
                    </div>
                  </div>
                  <div className="pt-14 text-center">
                    <h2 className="text-2xl font-bold">{selectedChild.name}</h2>
                    <p className="text-muted-foreground flex items-center justify-center gap-2 mt-1">
                      <Baby className="w-4 h-4" />
                      {selectedChild.age}
                    </p>
                    <Button variant="ghost" size="sm" className="mt-2">
                      <Edit2 className="w-4 h-4 mr-2" />
                      Редактировать
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-3 gap-3"
            >
              {[
                { icon: ChefHat, label: "Рецепты", value: selectedChild.stats.recipes, color: "mint" },
                { icon: Heart, label: "Избранное", value: selectedChild.stats.favorites, color: "peach" },
                { icon: Calendar, label: "Запланировано", value: selectedChild.stats.planned, color: "lavender" },
              ].map((stat) => (
                <Card key={stat.label} variant={stat.color as any} className="text-center">
                  <CardContent className="p-4">
                    <stat.icon className="w-6 h-6 mx-auto mb-2 opacity-80" />
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </CardContent>
                </Card>
              ))}
            </motion.div>

            {/* Allergies */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card variant="default">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                    <h3 className="font-bold">Аллергии и ограничения</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedChild.allergies.map((allergy) => (
                      <span
                        key={allergy}
                        className="px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-sm font-medium"
                      >
                        {allergy}
                      </span>
                    ))}
                    <button className="px-3 py-1.5 rounded-full border-2 border-dashed border-muted-foreground/30 text-muted-foreground text-sm font-medium flex items-center gap-1">
                      <Plus className="w-4 h-4" />
                      Добавить
                    </button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Quick Settings */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-3"
            >
              <h3 className="font-bold px-1">Настройки</h3>
              {[
                { label: "Telegram уведомления", desc: "Получать новые рецепты", emoji: "📱" },
                { label: "Экспорт рецептов", desc: "PDF для бабушки или врача", emoji: "📄" },
                { label: "Синхронизация семьи", desc: "Поделиться с партнером", emoji: "👨‍👩‍👧" },
              ].map((setting) => (
                <Card key={setting.label} variant="default" className="cursor-pointer hover:shadow-card transition-shadow">
                  <CardContent className="p-4 flex items-center gap-4">
                    <span className="text-2xl">{setting.emoji}</span>
                    <div className="flex-1">
                      <p className="font-semibold">{setting.label}</p>
                      <p className="text-sm text-muted-foreground">{setting.desc}</p>
                    </div>
                    <ChefHat className="w-5 h-5 text-muted-foreground" />
                  </CardContent>
                </Card>
              ))}
            </motion.div>
          </>
        )}
      </div>
    </MobileLayout>
  );
}
